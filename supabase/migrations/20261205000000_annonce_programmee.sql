-- =============================================================================
-- Annonce des paniers programmée : quand la composition d'une semaine (en
-- cours ou à venir) est enregistrée, l'annonce « Les paniers de la semaine
-- sont prêts ! » est programmée au prochain 12 h 30, heure de Paris (le jour
-- même avant 12 h 30, sinon le lendemain). Une seule annonce par semaine.
--
-- Le planificateur de Supabase passe chaque heure à la demie ; s'il y a une
-- annonce due, il appelle le site (/api/annonces) avec le jeton du robot, qui
-- envoie les notifications aux clients abonnés.
-- L'heure peut être changée (ou l'annonce retirée) dans public.annonces_programmees.
-- =============================================================================

create table public.annonces_programmees (
  semaine date primary key check (extract(isodow from semaine) = 1),
  prevue_le timestamptz not null,
  programmee_le timestamptz not null default now()
);

comment on table public.annonces_programmees is
  'Annonce des paniers à envoyer (une par semaine), à l''heure prévue.';

alter table public.annonces_programmees enable row level security;
create policy annonces_programmees_lecture_equipe on public.annonces_programmees
  for select to authenticated using ((select prive.est_equipe()));
revoke all on table public.annonces_programmees from anon;
grant select on table public.annonces_programmees to authenticated;

-- Prochain 12 h 30 à Paris : aujourd'hui si on n'y est pas encore, sinon demain
create function prive.prochain_12h30(p_maintenant timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_maintenant < (((p_maintenant at time zone 'Europe/Paris')::date + time '12:30') at time zone 'Europe/Paris')
      then ((p_maintenant at time zone 'Europe/Paris')::date + time '12:30') at time zone 'Europe/Paris'
    else (((p_maintenant at time zone 'Europe/Paris')::date + 1) + time '12:30') at time zone 'Europe/Paris'
  end;
$$;

-- Composition enregistrée : annonce programmée (si pas encore envoyée ni programmée)
create function prive.programmer_annonce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(btrim(new.contenu), '') = ''
     or new.semaine < date_trunc('week', (now() at time zone 'Europe/Paris'))::date then
    return null;
  end if;
  if exists (select 1 from public.annonces_composition where semaine = new.semaine) then
    return null;
  end if;
  insert into public.annonces_programmees (semaine, prevue_le)
  values (new.semaine, prive.prochain_12h30())
  on conflict (semaine) do nothing;
  return null;
end;
$$;

create trigger compositions_programmer_annonce
  after insert or update of contenu on public.compositions
  for each row execute function prive.programmer_annonce();

-- Pour le site, avec le jeton : annonces dues × téléphones des clients actifs.
-- Chaque annonce n'est remise qu'une fois (annonces_composition).
create function prive.annonces_a_envoyer(p_jeton text)
returns table (
  semaine date,
  contenu text,
  cloture_jour integer,
  cloture_heure text,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a record;
  v_p public.parametres_commandes;
begin
  if not prive.jeton_valide(p_jeton) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_p from public.parametres_commandes;

  for v_a in
    delete from public.annonces_programmees ap where ap.prevue_le <= now()
    returning ap.semaine
  loop
    -- Déjà annoncée (par exemple depuis les réglages) : rien
    insert into public.annonces_composition (semaine) values (v_a.semaine) on conflict do nothing;
    if not found then
      continue;
    end if;
    -- Commandes en ligne fermées : l'annonce est consommée, sans envoi
    if not coalesce(v_p.commandes_ouvertes, true) then
      continue;
    end if;
    return query
      select v_a.semaine,
             (select c.contenu from public.compositions c
              join public.articles ar on ar.id = c.article_id
              where c.semaine = v_a.semaine and ar.categorie = 'panier' and btrim(c.contenu) <> ''
              order by ar.ordre, ar.prix_centimes, ar.nom limit 1),
             v_p.cloture_jour::integer,
             to_char(v_p.cloture_heure, 'HH24:MI'),
             ab.endpoint, ab.p256dh, ab.auth
      from public.abonnements_push ab
      join public.comptes_clients cc on cc.user_id = ab.user_id
      join public.clients cl on cl.id = cc.client_id
      where cl.actif;
  end loop;
end;
$$;

create function public.annonces_a_envoyer(p_jeton text)
returns table (
  semaine date,
  contenu text,
  cloture_jour integer,
  cloture_heure text,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql volatile security invoker set search_path = ''
as $$ begin return query select * from prive.annonces_a_envoyer(p_jeton); end; $$;

-- Planificateur : s'il y a une annonce due, le site est appelé
create function prive.declencher_annonces()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p prive.parametres_robot;
begin
  if not exists (select 1 from public.annonces_programmees where prevue_le <= now()) then
    return;
  end if;
  select * into v_p from prive.parametres_robot;
  if v_p.url_site is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  perform net.http_post(
    url := v_p.url_site || '/api/annonces',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jeton', v_p.jeton),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function
  prive.prochain_12h30(timestamptz),
  prive.programmer_annonce(),
  prive.declencher_annonces(),
  prive.annonces_a_envoyer(text),
  public.annonces_a_envoyer(text)
from public, anon, authenticated;
-- Le robot (jeton exigé) appelle sans compte
grant execute on function prive.annonces_a_envoyer(text), public.annonces_a_envoyer(text) to anon, authenticated;

-- Chaque heure à la demie (12 h 30 à Paris tombe toujours sur une demie UTC)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('annonces-paniers', '30 * * * *', 'select prive.declencher_annonces()');
  end if;
end;
$$;
