-- =============================================================================
-- Alerte aux livreurs : à partir du vendredi 20 h (heure de Paris), un client
-- ajouté à une tournée de ce week-end (nouvelle commande, commande déplacée
-- vers ce jour ou ce secteur, commande annulée remise « à livrer ») envoie une
-- notification aux téléphones des livreurs.
--
-- Même circuit que les alertes de l'équipe : l'alerte est rangée dans
-- prive.alertes_equipe (destinataire « livreur »), puis la base appelle le site
-- (/api/alertes) avec le jeton du robot, qui envoie les notifications.
-- =============================================================================

alter table prive.alertes_equipe
  add column destinataire text not null default 'admin' check (destinataire in ('admin', 'livreur'));
alter table prive.alertes_equipe drop constraint alertes_equipe_type_check;
alter table prive.alertes_equipe add constraint alertes_equipe_type_check
  check (type in ('inscription', 'commande', 'modification', 'annulation', 'ajout_tournee'));

-- Tournée « verrouillée » : la livraison n'est pas passée et on est après le
-- vendredi 20 h de sa semaine (les livreurs ont préparé leur camion)
create function prive.tournee_apres_vendredi_soir(p_date date, p_maintenant timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_date >= (p_maintenant at time zone 'Europe/Paris')::date
     and p_maintenant >= ((date_trunc('week', p_date::timestamp)::date + 4) + time '20:00') at time zone 'Europe/Paris';
$$;

-- Le site envoie les alertes en attente (sans effet sans pg_net ni adresse du site)
create function prive.reveiller_alertes()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_robot prive.parametres_robot;
begin
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

-- En fin de transaction (lignes de la commande déjà écrites)
create function prive.alerter_livreurs_ajout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  if not (
    tg_op = 'INSERT'
    -- Remise « à livrer » d'une commande annulée (pas une livraison annulée par le livreur)
    or (old.statut = 'annulee' and new.statut = 'a_livrer')
    or old.date_livraison is distinct from new.date_livraison
    or old.secteur_id is distinct from new.secteur_id
  ) then
    return null;
  end if;

  select co.id, co.statut, co.date_livraison, cl.prenom, cl.nom, cl.commune,
         coalesce(co.secteur_id, cl.secteur_id) as secteur_id, s.nom as secteur,
         coalesce((select string_agg(l.quantite || ' × ' || l.libelle, ', ' order by l.categorie, l.libelle)
                   from public.lignes_commande l where l.commande_id = co.id), '') as contenu
    into v_c
  from public.commandes co
  join public.clients cl on cl.id = co.client_id
  join public.secteurs s on s.id = coalesce(co.secteur_id, cl.secteur_id)
  where co.id = new.id;

  if v_c.id is null or v_c.statut <> 'a_livrer' or not prive.tournee_apres_vendredi_soir(v_c.date_livraison) then
    return null;
  end if;
  -- Pas deux fois la même alerte en moins de 2 minutes
  if exists (
    select 1 from prive.alertes_equipe
    where ref = v_c.id and type = 'ajout_tournee' and creee_le > now() - interval '2 minutes'
  ) then
    return null;
  end if;

  insert into prive.alertes_equipe (type, ref, titre, corps, url, destinataire)
  values (
    'ajout_tournee',
    v_c.id,
    '➕ Client ajouté à la tournée',
    left(btrim(v_c.prenom || ' ' || v_c.nom) || ' (' || v_c.commune || ') · ' || prive.date_en_clair(v_c.date_livraison)
      || ' · ' || v_c.secteur || case when v_c.contenu <> '' then ' · ' || v_c.contenu else '' end, 400),
    '/tournee?du=' || to_char(v_c.date_livraison, 'YYYY-MM-DD') || '&secteur=' || v_c.secteur_id,
    'livreur'
  );
  perform prive.reveiller_alertes();
  return null;
end;
$$;

create constraint trigger commandes_alerte_livreurs
  after insert or update of statut, date_livraison, secteur_id on public.commandes
  deferrable initially deferred
  for each row execute function prive.alerter_livreurs_ajout();

-- Les alertes partent vers les téléphones de leurs destinataires (administrateurs ou livreurs)
create or replace function prive.alertes_a_envoyer(p_jeton text)
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
      returning a.id, a.titre, a.corps, a.url, a.creee_le, a.destinataire
    )
    select r.id, r.titre, r.corps, r.url, ab.endpoint, ab.p256dh, ab.auth
    from reservees r
    cross join public.abonnements_push ab
    join public.profils p on p.id = ab.user_id and p.role::text = r.destinataire
    order by r.creee_le;
end;
$$;

revoke execute on function
  prive.tournee_apres_vendredi_soir(date, timestamptz),
  prive.reveiller_alertes(),
  prive.alerter_livreurs_ajout()
from public, anon, authenticated;
