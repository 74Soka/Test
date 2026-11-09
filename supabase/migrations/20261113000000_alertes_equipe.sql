-- =============================================================================
-- Notifications aux administrateurs : nouvelle inscription à valider, et
-- commande passée, modifiée ou annulée en ligne par un client.
--
-- 1. L'action du client demande l'alerte (demander_alerte_equipe) : la base
--    vérifie que l'inscription ou la commande est bien la sienne, compose le
--    message, le range dans prive.alertes_equipe, puis appelle le site
--    (/api/alertes) avec le jeton secret du robot, qui ne sort jamais de la base.
-- 2. Le site, avec ce jeton, récupère les alertes en attente et les téléphones
--    des administrateurs (alertes_a_envoyer), puis envoie les notifications.
-- =============================================================================

create table prive.alertes_equipe (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('inscription', 'commande', 'modification', 'annulation')),
  ref uuid not null,
  titre text not null,
  corps text not null,
  url text not null,
  creee_le timestamptz not null default now(),
  envoyee_le timestamptz
);

create index alertes_equipe_attente_idx on prive.alertes_equipe (creee_le) where envoyee_le is null;
create index alertes_equipe_ref_idx on prive.alertes_equipe (ref, type, creee_le);

alter table prive.alertes_equipe enable row level security;
revoke all on table prive.alertes_equipe from public, anon, authenticated;

-- « samedi 14 novembre »
create function prive.date_en_clair(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])[extract(isodow from p_date)::int]
    || ' ' || extract(day from p_date)::int
    || ' ' || (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre',
                     'novembre','décembre'])[extract(month from p_date)::int];
$$;

create function prive.demander_alerte_equipe(p_type text, p_ref uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_titre text;
  v_corps text;
  v_url text;
  v_i public.inscriptions;
  v_c record;
  v_robot prive.parametres_robot;
begin
  if v_uid is null then
    raise exception 'Connexion nécessaire.' using errcode = '42501';
  end if;
  if p_type not in ('inscription', 'commande', 'modification', 'annulation') then
    raise exception 'Alerte inconnue.' using errcode = 'PN010';
  end if;

  if p_type = 'inscription' then
    -- Seulement sa propre inscription, encore en attente
    select * into v_i from public.inscriptions where user_id = v_uid and user_id = p_ref and statut = 'en_attente';
    if v_i.user_id is null then
      return;
    end if;
    v_titre := '🆕 Nouvelle inscription à valider';
    v_corps := btrim(v_i.prenom || ' ' || v_i.nom) || ' (' || v_i.commune || ') attend votre validation.';
    v_url := '/clients/inscriptions';
  else
    -- Seulement une commande de sa propre fiche
    select co.id, co.date_livraison, co.statut, cl.prenom, cl.nom, cl.commune,
           coalesce((select string_agg(l.quantite || ' × ' || l.libelle, ', ' order by l.categorie, l.libelle)
                     from public.lignes_commande l where l.commande_id = co.id), '') as contenu
      into v_c
    from public.commandes co
    join public.clients cl on cl.id = co.client_id
    where co.id = p_ref and co.client_id = prive.mon_client_id();
    if v_c.id is null then
      return;
    end if;
    v_titre := case p_type
      when 'commande' then '🧺 Nouvelle commande en ligne'
      when 'modification' then '✏️ Commande modifiée'
      else '❌ Commande annulée'
    end;
    v_corps := btrim(v_c.prenom || ' ' || v_c.nom) || ' · ' || prive.date_en_clair(v_c.date_livraison)
      || case when p_type <> 'annulation' and v_c.contenu <> '' then ' · ' || v_c.contenu else '' end;
    v_url := '/commandes/' || v_c.id;
  end if;

  -- Pas deux fois la même alerte en moins de 2 minutes (double appui, rechargement)
  if exists (
    select 1 from prive.alertes_equipe
    where ref = p_ref and type = p_type and creee_le > now() - interval '2 minutes'
  ) then
    return;
  end if;

  insert into prive.alertes_equipe (type, ref, titre, corps, url)
  values (p_type, p_ref, left(v_titre, 120), left(v_corps, 400), v_url);

  -- Le site envoie les notifications (sans effet sans pg_net ni adresse du site)
  select * into v_robot from prive.parametres_robot;
  if v_robot.url_site is not null and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := v_robot.url_site || '/api/alertes',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-jeton', v_robot.jeton),
      timeout_milliseconds := 20000
    );
  end if;
end;
$$;

-- Pour le site, avec le jeton : alertes de la dernière heure pas encore
-- envoyées × téléphones des administrateurs ; chaque alerte n'est remise qu'une fois
create function prive.alertes_a_envoyer(p_jeton text)
returns table (alerte_id uuid, titre text, corps text, url text, endpoint text, p256dh text, auth text)
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
    with reservees as (
      update prive.alertes_equipe a set envoyee_le = now()
      where a.envoyee_le is null and a.creee_le > now() - interval '1 hour'
      returning a.id, a.titre, a.corps, a.url, a.creee_le
    )
    select r.id, r.titre, r.corps, r.url, ab.endpoint, ab.p256dh, ab.auth
    from reservees r
    cross join public.abonnements_push ab
    join public.profils p on p.id = ab.user_id and p.role = 'admin'
    order by r.creee_le;
end;
$$;

create function public.demander_alerte_equipe(p_type text, p_ref uuid)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.demander_alerte_equipe(p_type, p_ref); end; $$;

create function public.alertes_a_envoyer(p_jeton text)
returns table (alerte_id uuid, titre text, corps text, url text, endpoint text, p256dh text, auth text)
language plpgsql volatile security invoker set search_path = ''
as $$ begin return query select * from prive.alertes_a_envoyer(p_jeton); end; $$;

revoke execute on function
  prive.date_en_clair(date),
  prive.demander_alerte_equipe(text, uuid),
  prive.alertes_a_envoyer(text),
  public.demander_alerte_equipe(text, uuid),
  public.alertes_a_envoyer(text)
from public, anon, authenticated;

grant execute on function prive.date_en_clair(date) to authenticated;
grant execute on function prive.demander_alerte_equipe(text, uuid), public.demander_alerte_equipe(text, uuid)
  to authenticated;
-- Le robot (jeton exigé) appelle sans compte
grant execute on function prive.alertes_a_envoyer(text), public.alertes_a_envoyer(text) to anon, authenticated;
