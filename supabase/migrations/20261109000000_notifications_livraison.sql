-- =============================================================================
-- Notifications de livraison (web push)
-- =============================================================================
-- * Les clients activent les notifications sur leur téléphone : l'abonnement
--   du navigateur est gardé dans abonnements_push.
-- * Le livreur « démarre la tournée » : chaque client prévu reçoit l'heure
--   d'arrivée estimée. À chaque « Livré », le client suivant est prévenu.
-- * notifications_envoyees garantit qu'un client ne reçoit chaque message
--   qu'une fois (appui répété, envoi différé hors connexion…).
-- * Les clés de signature (VAPID) sont créées par l'application à la
--   première utilisation et rangées dans le schéma privé : la clé privée
--   n'est lisible que par l'équipe.
-- =============================================================================

create type public.type_notification as enum ('depart', 'prochain');

-- -----------------------------------------------------------------------------
-- 1. Clés de signature (une seule ligne, schéma privé)
-- -----------------------------------------------------------------------------
create table prive.cles_push (
  id boolean primary key default true check (id),
  publique text not null check (length(publique) between 40 and 200),
  privee text not null check (length(privee) between 20 and 200),
  created_at timestamptz not null default now()
);

revoke all on table prive.cles_push from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Abonnements des téléphones (un par navigateur)
-- -----------------------------------------------------------------------------
create table public.abonnements_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https?://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  appareil text check (length(appareil) <= 200),
  created_at timestamptz not null default now()
);

create index abonnements_push_user_idx on public.abonnements_push (user_id);

-- -----------------------------------------------------------------------------
-- 3. Tournées démarrées et notifications envoyées
-- -----------------------------------------------------------------------------
create table public.tournees (
  date_livraison date not null,
  secteur_id uuid not null references public.secteurs (id) on delete cascade,
  demarree_le timestamptz not null default now(),
  primary key (date_livraison, secteur_id)
);

create index tournees_secteur_idx on public.tournees (secteur_id);

create table public.notifications_envoyees (
  commande_id uuid not null references public.commandes (id) on delete cascade,
  type public.type_notification not null,
  envoyee_le timestamptz not null default now(),
  primary key (commande_id, type)
);

-- -----------------------------------------------------------------------------
-- 4. Fonctions (logique privée, SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- Clé publique : tout compte connecté (pour abonner son téléphone)
create function prive.cle_publique_push()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select publique from prive.cles_push;
$$;

-- Clés complètes : l'équipe seulement (pour signer les envois)
create function prive.cles_push()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('publique', publique, 'privee', privee) from prive.cles_push);
end;
$$;

-- Première création des clés (sans effet si elles existent déjà)
create function prive.enregistrer_cles_push(p_publique text, p_privee text)
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
  insert into prive.cles_push (publique, privee) values (p_publique, p_privee)
  on conflict (id) do nothing;
end;
$$;

-- Abonner le téléphone du compte connecté. Un même navigateur passé à un
-- autre compte change de propriétaire.
create function prive.enregistrer_abonnement_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_appareil text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Connexion nécessaire.' using errcode = '42501';
  end if;
  insert into public.abonnements_push (user_id, endpoint, p256dh, auth, appareil)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_appareil, 200))
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    appareil = excluded.appareil;
end;
$$;

-- Désabonner : son propre téléphone, ou (équipe) un abonnement expiré
create function prive.supprimer_abonnement_push(p_endpoint text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.abonnements_push
  where endpoint = p_endpoint
    and (user_id = (select auth.uid()) or (select prive.est_equipe()));
end;
$$;

-- Abonnements des comptes reliés à une fiche client (équipe seulement)
create function prive.abonnements_du_client(p_client_id uuid)
returns table (endpoint text, p256dh text, auth text)
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
    select a.endpoint, a.p256dh, a.auth
    from public.abonnements_push a
    join public.comptes_clients cc on cc.user_id = a.user_id
    where cc.client_id = p_client_id;
end;
$$;

-- Démarrer une tournée (une fois par jour et par secteur) : renvoie l'heure
-- de départ et si c'est ce premier appel qui l'a démarrée
create function prive.demarrer_tournee(p_date date, p_secteur_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_le timestamptz;
  v_nouvelle boolean := false;
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  insert into public.tournees (date_livraison, secteur_id) values (p_date, p_secteur_id)
  on conflict do nothing
  returning demarree_le into v_le;
  v_nouvelle := v_le is not null;
  if not v_nouvelle then
    select demarree_le into v_le from public.tournees where date_livraison = p_date and secteur_id = p_secteur_id;
  end if;
  return jsonb_build_object('demarree_le', v_le, 'nouvelle', v_nouvelle);
end;
$$;

-- Réserve l'envoi d'un message pour des commandes : renvoie celles qui ne
-- l'avaient pas encore reçu (les autres sont ignorées)
create function prive.reserver_notifications(p_commandes uuid[], p_type public.type_notification)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  with nouvelles as (
    insert into public.notifications_envoyees (commande_id, type)
    select c.id, p_type from public.commandes c where c.id = any (p_commandes)
    on conflict do nothing
    returning commande_id
  )
  select coalesce(array_agg(commande_id), '{}') into v_ids from nouvelles;
  return v_ids;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Fonctions exposées (SECURITY INVOKER)
-- -----------------------------------------------------------------------------
create function public.cle_publique_push()
returns text language plpgsql stable security invoker set search_path = ''
as $$ begin return prive.cle_publique_push(); end; $$;

create function public.cles_push()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$ begin return prive.cles_push(); end; $$;

create function public.enregistrer_cles_push(p_publique text, p_privee text)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.enregistrer_cles_push(p_publique, p_privee); end; $$;

create function public.enregistrer_abonnement_push(
  p_endpoint text, p_p256dh text, p_auth text, p_appareil text default null
)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.enregistrer_abonnement_push(p_endpoint, p_p256dh, p_auth, p_appareil); end; $$;

create function public.supprimer_abonnement_push(p_endpoint text)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.supprimer_abonnement_push(p_endpoint); end; $$;

create function public.abonnements_du_client(p_client_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql stable security invoker set search_path = ''
as $$ begin return query select * from prive.abonnements_du_client(p_client_id); end; $$;

create function public.demarrer_tournee(p_date date, p_secteur_id uuid)
returns jsonb language plpgsql volatile security invoker set search_path = ''
as $$ begin return prive.demarrer_tournee(p_date, p_secteur_id); end; $$;

create function public.reserver_notifications(p_commandes uuid[], p_type public.type_notification)
returns uuid[] language plpgsql volatile security invoker set search_path = ''
as $$ begin return prive.reserver_notifications(p_commandes, p_type); end; $$;

-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
alter table public.abonnements_push enable row level security;
alter table public.tournees enable row level security;
alter table public.notifications_envoyees enable row level security;

-- Abonnements : chacun voit les siens ; écriture par les fonctions
create policy abonnements_push_lecture on public.abonnements_push
  for select to authenticated using (user_id = (select auth.uid()));

-- Tournées et notifications : lecture équipe ; écriture par les fonctions
create policy tournees_lecture_equipe on public.tournees
  for select to authenticated using ((select prive.est_equipe()));
create policy notifications_envoyees_lecture_equipe on public.notifications_envoyees
  for select to authenticated using ((select prive.est_equipe()));

-- -----------------------------------------------------------------------------
-- 7. Droits
-- -----------------------------------------------------------------------------
revoke all on table public.abonnements_push, public.tournees, public.notifications_envoyees from anon;
grant select on table public.abonnements_push, public.tournees, public.notifications_envoyees to authenticated;
revoke insert, update, delete on table public.abonnements_push, public.tournees, public.notifications_envoyees
  from authenticated;

revoke execute on function
  prive.cle_publique_push(),
  prive.cles_push(),
  prive.enregistrer_cles_push(text, text),
  prive.enregistrer_abonnement_push(text, text, text, text),
  prive.supprimer_abonnement_push(text),
  prive.abonnements_du_client(uuid),
  prive.demarrer_tournee(date, uuid),
  prive.reserver_notifications(uuid[], public.type_notification)
from public, anon;

grant execute on function
  prive.cle_publique_push(),
  prive.cles_push(),
  prive.enregistrer_cles_push(text, text),
  prive.enregistrer_abonnement_push(text, text, text, text),
  prive.supprimer_abonnement_push(text),
  prive.abonnements_du_client(uuid),
  prive.demarrer_tournee(date, uuid),
  prive.reserver_notifications(uuid[], public.type_notification)
to authenticated;

revoke execute on function
  public.cle_publique_push(),
  public.cles_push(),
  public.enregistrer_cles_push(text, text),
  public.enregistrer_abonnement_push(text, text, text, text),
  public.supprimer_abonnement_push(text),
  public.abonnements_du_client(uuid),
  public.demarrer_tournee(date, uuid),
  public.reserver_notifications(uuid[], public.type_notification)
from public, anon;

grant execute on function
  public.cle_publique_push(),
  public.cles_push(),
  public.enregistrer_cles_push(text, text),
  public.enregistrer_abonnement_push(text, text, text, text),
  public.supprimer_abonnement_push(text),
  public.abonnements_du_client(uuid),
  public.demarrer_tournee(date, uuid),
  public.reserver_notifications(uuid[], public.type_notification)
to authenticated;
