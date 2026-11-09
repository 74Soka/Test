-- =============================================================================
-- Avis après livraison, annonce des paniers, rappels du jeudi
-- =============================================================================
-- * « Merci pour votre commande » à la livraison (notification), puis le
--   client peut donner son avis : note et commentaire (retours, soucis).
-- * L'équipe prévient les clients quand la composition de la semaine est
--   prête (une fois par semaine).
-- * Rappels « n'oubliez pas de commander » le jeudi à midi et le soir, pour
--   les clients qui n'ont pas encore commandé. Ils partent tout seuls : le
--   planificateur de Supabase (pg_cron + pg_net) appelle chaque heure du jeudi
--   la page /api/rappels du site, avec un jeton secret gardé en base ; le site
--   n'envoie qu'à 12 h et 19 h (heure de Paris).
-- =============================================================================

alter type public.type_notification add value if not exists 'merci';

-- -----------------------------------------------------------------------------
-- 1. Avis des clients
-- -----------------------------------------------------------------------------
create table public.avis_livraison (
  commande_id uuid primary key references public.commandes (id) on delete cascade,
  note smallint check (note between 1 and 5),
  commentaire text check (length(commentaire) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Retour pris en charge par l'équipe
  traite_le timestamptz,
  constraint avis_non_vide check (note is not null or length(btrim(commentaire)) > 0)
);

create index avis_livraison_a_traiter_idx on public.avis_livraison (created_at) where traite_le is null;

create trigger avis_livraison_updated_at before update on public.avis_livraison
  for each row execute function public.maj_updated_at();

-- Donner (ou corriger) son avis sur une commande livrée, dans les 30 jours
create function prive.donner_mon_avis(p_commande_id uuid, p_note smallint, p_commentaire text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := prive.mon_client_id();
  v_c public.commandes;
begin
  select * into v_c from public.commandes where id = p_commande_id;
  if not found or v_client is null or v_c.client_id <> v_client then
    raise exception 'Commande introuvable.' using errcode = 'PN006';
  end if;
  if v_c.statut <> 'livree' then
    raise exception 'Vous pourrez donner votre avis une fois la commande livrée.' using errcode = 'PN050';
  end if;
  if v_c.livree_le < now() - interval '30 days' then
    raise exception 'Cette livraison date de plus d''un mois : contactez-nous directement.' using errcode = 'PN051';
  end if;
  if p_note is null and length(btrim(coalesce(p_commentaire, ''))) = 0 then
    raise exception 'Choisissez une note ou écrivez un commentaire.' using errcode = 'PN052';
  end if;

  insert into public.avis_livraison (commande_id, note, commentaire)
  values (p_commande_id, p_note, nullif(btrim(p_commentaire), ''))
  on conflict (commande_id) do update set
    note = excluded.note,
    commentaire = excluded.commentaire,
    traite_le = null;
end;
$$;

-- L'équipe marque un retour comme traité (ou le rouvre)
create function prive.traiter_avis(p_commande_id uuid, p_traite boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_admin()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  update public.avis_livraison
  set traite_le = case when p_traite then now() end
  where commande_id = p_commande_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Annonce de la composition (une fois par semaine)
-- -----------------------------------------------------------------------------
create table public.annonces_composition (
  semaine date primary key check (extract(isodow from semaine) = 1),
  envoyee_le timestamptz not null default now()
);

-- Réserve l'annonce d'une semaine : vrai si elle n'était pas encore partie
create function prive.reserver_annonce(p_semaine date)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if not (select prive.est_admin()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  insert into public.annonces_composition (semaine) values (p_semaine)
  on conflict do nothing
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- Téléphones abonnés des clients actifs (équipe)
create function prive.abonnements_clients_actifs()
returns table (client_id uuid, endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
    select c.id, a.endpoint, a.p256dh, a.auth
    from public.abonnements_push a
    join public.comptes_clients cc on cc.user_id = a.user_id
    join public.clients c on c.id = cc.client_id
    where c.actif;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Rappels automatiques (jeton secret, planificateur)
-- -----------------------------------------------------------------------------
create table prive.parametres_robot (
  id boolean primary key default true check (id),
  -- Jeton secret (2 × 122 bits aléatoires) : seul le planificateur le connaît
  jeton text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  -- Adresse du site, notée par l'application à chaque visite de l'équipe
  url_site text check (url_site ~ '^https://[^/]+$'),
  maj_le timestamptz not null default now()
);

insert into prive.parametres_robot default values;
revoke all on table prive.parametres_robot from public, anon, authenticated;

create table public.rappels_envoyes (
  client_id uuid not null references public.clients (id) on delete cascade,
  date_livraison date not null,
  moment text not null check (moment in ('midi', 'soir')),
  envoye_le timestamptz not null default now(),
  primary key (client_id, date_livraison, moment)
);

-- L'équipe note l'adresse publique du site (pour le planificateur)
create function prive.noter_url_site(p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_url !~ '^https://[^/]+$' then
    return; -- adresse de développement : ignorée
  end if;
  update prive.parametres_robot set url_site = p_url, maj_le = now()
  where url_site is distinct from p_url;
end;
$$;

create function prive.jeton_valide(p_jeton text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from prive.parametres_robot where jeton = p_jeton and length(p_jeton) >= 40);
$$;

-- Clés de signature pour le robot
create function prive.cles_push_robot(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not prive.jeton_valide(p_jeton) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('publique', publique, 'privee', privee) from prive.cles_push);
end;
$$;

-- Clients à rappeler (abonnés, actifs, sans commande pour leur prochaine
-- livraison, clôture dans les 48 h) ; chaque rappel est réservé une seule fois
create function prive.rappels_a_envoyer(p_jeton text, p_moment text)
returns table (
  client_id uuid,
  prenom text,
  date_livraison date,
  cloture timestamptz,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not prive.jeton_valide(p_jeton) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_moment not in ('midi', 'soir') then
    raise exception 'Moment inconnu.' using errcode = 'PN010';
  end if;
  if not (select commandes_ouvertes from public.parametres_commandes) then
    return;
  end if;

  return query
    with candidats as (
      select c.id, c.prenom, prive.prochaine_livraison(c.secteur_id) as jour
      from public.clients c
      where c.actif
        and exists (
          select 1 from public.comptes_clients cc
          join public.abonnements_push a on a.user_id = cc.user_id
          where cc.client_id = c.id
        )
    ),
    a_rappeler as (
      select k.id, k.prenom, k.jour, prive.cloture_commandes(k.jour) as fin
      from candidats k
      where k.jour is not null
        and prive.cloture_commandes(k.jour) <= now() + interval '48 hours'
        and not exists (
          select 1 from public.commandes co
          where co.client_id = k.id
            and co.semaine = date_trunc('week', k.jour::timestamp)::date
            and co.statut <> 'annulee'
        )
    ),
    reserves as (
      insert into public.rappels_envoyes (client_id, date_livraison, moment)
      select r.id, r.jour, p_moment from a_rappeler r
      on conflict do nothing
      returning rappels_envoyes.client_id
    )
    select r.id, r.prenom, r.jour, r.fin, a.endpoint, a.p256dh, a.auth
    from a_rappeler r
    join reserves s on s.client_id = r.id
    join public.comptes_clients cc on cc.client_id = r.id
    join public.abonnements_push a on a.user_id = cc.user_id;
end;
$$;

create function prive.supprimer_abonnement_robot(p_jeton text, p_endpoint text)
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
  delete from public.abonnements_push where endpoint = p_endpoint;
end;
$$;

-- Appel du site par le planificateur (sans effet tant que l'adresse est inconnue)
create function prive.declencher_rappels()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p prive.parametres_robot;
begin
  select * into v_p from prive.parametres_robot;
  if v_p.url_site is null then
    return;
  end if;
  perform net.http_post(
    url := v_p.url_site || '/api/rappels',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jeton', v_p.jeton),
    timeout_milliseconds := 30000
  );
end;
$$;

-- Planificateur : chaque heure du jeudi (le site trie 12 h et 19 h, heure de Paris).
-- Absent des bases de test (sans pg_cron ni pg_net) : rien n'est planifié.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('rappels-commande-jeudi', '0 * * * 4', 'select prive.declencher_rappels()');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Fonctions exposées (SECURITY INVOKER)
-- -----------------------------------------------------------------------------
create function public.donner_mon_avis(p_commande_id uuid, p_note smallint, p_commentaire text)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.donner_mon_avis(p_commande_id, p_note, p_commentaire); end; $$;

create function public.traiter_avis(p_commande_id uuid, p_traite boolean)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.traiter_avis(p_commande_id, p_traite); end; $$;

create function public.reserver_annonce(p_semaine date)
returns boolean language plpgsql volatile security invoker set search_path = ''
as $$ begin return prive.reserver_annonce(p_semaine); end; $$;

create function public.abonnements_clients_actifs()
returns table (client_id uuid, endpoint text, p256dh text, auth text)
language plpgsql stable security invoker set search_path = ''
as $$ begin return query select * from prive.abonnements_clients_actifs(); end; $$;

create function public.noter_url_site(p_url text)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.noter_url_site(p_url); end; $$;

-- Fonctions du robot : appelées sans compte, protégées par le jeton
create function public.cles_push_robot(p_jeton text)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$ begin return prive.cles_push_robot(p_jeton); end; $$;

create function public.rappels_a_envoyer(p_jeton text, p_moment text)
returns table (
  client_id uuid, prenom text, date_livraison date, cloture timestamptz, endpoint text, p256dh text, auth text
)
language plpgsql volatile security invoker set search_path = ''
as $$ begin return query select * from prive.rappels_a_envoyer(p_jeton, p_moment); end; $$;

create function public.supprimer_abonnement_robot(p_jeton text, p_endpoint text)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.supprimer_abonnement_robot(p_jeton, p_endpoint); end; $$;

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
alter table public.avis_livraison enable row level security;
alter table public.annonces_composition enable row level security;
alter table public.rappels_envoyes enable row level security;

create policy avis_livraison_lecture on public.avis_livraison
  for select to authenticated using (
    (select prive.est_equipe())
    or commande_id in (select c.id from public.commandes c where c.client_id = (select prive.mon_client_id()))
  );
create policy annonces_composition_lecture_equipe on public.annonces_composition
  for select to authenticated using ((select prive.est_equipe()));
create policy rappels_envoyes_lecture_equipe on public.rappels_envoyes
  for select to authenticated using ((select prive.est_equipe()));

-- -----------------------------------------------------------------------------
-- 6. Droits
-- -----------------------------------------------------------------------------
revoke all on table public.avis_livraison, public.annonces_composition, public.rappels_envoyes from anon;
grant select on table public.avis_livraison, public.annonces_composition, public.rappels_envoyes to authenticated;
revoke insert, update, delete on table public.avis_livraison, public.annonces_composition, public.rappels_envoyes
  from authenticated;

revoke execute on function
  prive.donner_mon_avis(uuid, smallint, text),
  prive.traiter_avis(uuid, boolean),
  prive.reserver_annonce(date),
  prive.abonnements_clients_actifs(),
  prive.noter_url_site(text),
  prive.jeton_valide(text),
  prive.cles_push_robot(text),
  prive.rappels_a_envoyer(text, text),
  prive.supprimer_abonnement_robot(text, text),
  prive.declencher_rappels()
from public, anon, authenticated;

grant execute on function
  prive.donner_mon_avis(uuid, smallint, text),
  prive.traiter_avis(uuid, boolean),
  prive.reserver_annonce(date),
  prive.abonnements_clients_actifs(),
  prive.noter_url_site(text)
to authenticated;

-- Fonctions du robot : appelables sans compte (le jeton fait foi)
grant usage on schema prive to anon;
grant execute on function
  prive.cles_push_robot(text),
  prive.rappels_a_envoyer(text, text),
  prive.supprimer_abonnement_robot(text, text),
  prive.jeton_valide(text)
to anon, authenticated;

revoke execute on function
  public.donner_mon_avis(uuid, smallint, text),
  public.traiter_avis(uuid, boolean),
  public.reserver_annonce(date),
  public.abonnements_clients_actifs(),
  public.noter_url_site(text),
  public.cles_push_robot(text),
  public.rappels_a_envoyer(text, text),
  public.supprimer_abonnement_robot(text, text)
from public, anon;

grant execute on function
  public.donner_mon_avis(uuid, smallint, text),
  public.traiter_avis(uuid, boolean),
  public.reserver_annonce(date),
  public.abonnements_clients_actifs(),
  public.noter_url_site(text)
to authenticated;

grant execute on function
  public.cles_push_robot(text),
  public.rappels_a_envoyer(text, text),
  public.supprimer_abonnement_robot(text, text)
to anon, authenticated;
