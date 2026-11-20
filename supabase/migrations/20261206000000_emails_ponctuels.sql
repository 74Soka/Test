-- =============================================================================
-- E-mails ponctuels aux clients, envoyés depuis l'adresse du site (Brevo).
--
-- L'administrateur (ou l'assistant, dans Supabase → SQL Editor) dépose un
-- e-mail dans prive.emails_a_envoyer ; la base appelle aussitôt le site
-- (/api/emails) avec le jeton secret du robot. Le site, avec ce jeton, récupère
-- les e-mails en attente (emails_a_envoyer), les envoie par Brevo, puis note le
-- résultat (email_envoye). La clé Brevo ne quitte jamais Netlify.
--
--   insert into prive.emails_a_envoyer (destinataire, sujet, texte)
--   values ('client@exemple.fr', 'Sujet', 'Bonjour…');
-- =============================================================================

create table prive.emails_a_envoyer (
  id bigint generated always as identity primary key,
  destinataire text not null check (destinataire ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sujet text not null check (btrim(sujet) <> '' and length(sujet) <= 200),
  texte text not null check (btrim(texte) <> '' and length(texte) <= 10000),
  cree_le timestamptz not null default now(),
  pris_le timestamptz,
  envoye_le timestamptz,
  erreur text
);

comment on table prive.emails_a_envoyer is
  'E-mails ponctuels à envoyer par le site (Brevo) ; pris_le = remis au site, envoye_le = accepté par Brevo.';

create index emails_a_envoyer_attente_idx on prive.emails_a_envoyer (cree_le) where pris_le is null;

alter table prive.emails_a_envoyer enable row level security;
revoke all on table prive.emails_a_envoyer from public, anon, authenticated;

-- Pour le site, avec le jeton : e-mails en attente, remis une seule fois
create function prive.emails_a_envoyer(p_jeton text)
returns table (id bigint, destinataire text, sujet text, texte text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not prive.jeton_valide(p_jeton) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
    update prive.emails_a_envoyer e set pris_le = now()
    where e.pris_le is null
    returning e.id, e.destinataire, e.sujet, e.texte;
end;
$$;

-- Résultat de l'envoi (p_erreur vide : envoyé)
create function prive.email_envoye(p_jeton text, p_id bigint, p_erreur text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not prive.jeton_valide(p_jeton) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  update prive.emails_a_envoyer
  set envoye_le = case when nullif(btrim(p_erreur), '') is null then now() end,
      erreur = left(nullif(btrim(p_erreur), ''), 500)
  where id = p_id and pris_le is not null and envoye_le is null;
end;
$$;

create function public.emails_a_envoyer(p_jeton text)
returns table (id bigint, destinataire text, sujet text, texte text)
language plpgsql volatile security invoker set search_path = ''
as $$ begin return query select * from prive.emails_a_envoyer(p_jeton); end; $$;

create function public.email_envoye(p_jeton text, p_id bigint, p_erreur text default null)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.email_envoye(p_jeton, p_id, p_erreur); end; $$;

-- Dès qu'un e-mail est déposé, le site est appelé (sans effet sans pg_net ni adresse du site)
create function prive.declencher_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_robot prive.parametres_robot;
begin
  select * into v_robot from prive.parametres_robot;
  if v_robot.url_site is not null and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := v_robot.url_site || '/api/emails',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-jeton', v_robot.jeton),
      timeout_milliseconds := 30000
    );
  end if;
  return null;
end;
$$;

create trigger emails_a_envoyer_declencher
  after insert on prive.emails_a_envoyer
  for each statement execute function prive.declencher_emails();

revoke execute on function
  prive.emails_a_envoyer(text),
  prive.email_envoye(text, bigint, text),
  prive.declencher_emails(),
  public.emails_a_envoyer(text),
  public.email_envoye(text, bigint, text)
from public, anon, authenticated;
-- Le robot (jeton exigé) appelle sans compte
grant execute on function
  prive.emails_a_envoyer(text), public.emails_a_envoyer(text),
  prive.email_envoye(text, bigint, text), public.email_envoye(text, bigint, text)
to anon, authenticated;
