-- =============================================================================
-- Secteurs réservés à l'équipe (ex. Secteur V, vendredi après-midi, clients
-- choisis un par un) : visibles seulement par l'administrateur et les livreurs.
-- Pas sur la page publique /paniers ; dans l'espace d'un client de ce secteur,
-- seuls sa date et son créneau de livraison apparaissent, pas le nom du secteur.
-- =============================================================================

alter table public.secteurs add column interne boolean not null default false;
comment on column public.secteurs.interne is
  'Réservé à l''équipe : absent de la page publique, nom caché aux clients.';

-- Le client ne lit plus la fiche d'un secteur interne
alter policy secteurs_lecture_client on public.secteurs
  using (id = (select prive.mon_secteur_id()) and not interne);

create or replace function prive.paniers_publics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base date;
  v_ouverte date;
  v_semaine date;
  v_p public.parametres_commandes;
  v_r public.recettes;
begin
  -- La semaine en cours reste affichée jusqu'au dimanche 23 h (heure de Paris),
  -- puis la suivante : « une heure plus tard », on est déjà lundi
  v_base := (date_trunc('week', (now() at time zone 'Europe/Paris') + interval '1 hour'))::date;
  -- Semaine de la prochaine livraison encore ouverte aux commandes
  select (date_trunc('week', min(prive.prochaine_livraison(s.id))::timestamp))::date into v_ouverte
  from public.secteurs s
  where not s.interne;

  select min(semaine) into v_semaine from public.compositions where semaine >= v_base;
  select * into v_p from public.parametres_commandes;
  -- Recette de la même semaine que les paniers affichés (ou de la semaine à venir)
  select * into v_r from public.recettes where semaine = coalesce(v_semaine, v_base);

  return jsonb_build_object(
    'semaine', v_semaine,
    'paniers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'nom', a.nom,
        'prix_centimes', a.prix_centimes,
        'contenu', c.contenu
      ) order by a.ordre, a.nom)
      from public.articles a
      left join public.compositions c on c.article_id = a.id and c.semaine = v_semaine
      where a.actif and a.categorie = 'panier'
    ), '[]'::jsonb),
    'supplements', coalesce((
      select jsonb_agg(jsonb_build_object('nom', a.nom, 'prix_centimes', a.prix_centimes) order by a.ordre, a.nom)
      from public.articles a
      where a.actif and a.categorie = 'supplement'
    ), '[]'::jsonb),
    'secteurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nom', s.nom,
        'jour', s.jour,
        'creneau', s.creneau,
        'communes', coalesce((
          select jsonb_agg(sc.nom order by sc.nom)
          from public.secteur_communes sc where sc.secteur_id = s.id
        ), '[]'::jsonb)
      ) order by s.jour, s.creneau, s.nom)
      from public.secteurs s
      where not s.interne
    ), '[]'::jsonb),
    'commandes_ouvertes', coalesce(v_p.commandes_ouvertes, true),
    -- Paniers affichés d'une semaine déjà close (après la clôture, jusqu'au dimanche 23 h)
    'semaine_close', v_semaine is not null and (v_ouverte is null or v_semaine < v_ouverte),
    'cloture_jour', v_p.cloture_jour,
    'cloture_heure', to_char(v_p.cloture_heure, 'HH24:MI'),
    'message', v_p.message_clients,
    'parrainage_debut', (select f.parrainage_cadeaux_debut from public.parametres_fidelite f),
    'recette', case when v_r.semaine is null then null else jsonb_build_object(
      'titre', v_r.titre,
      'infos', v_r.infos,
      'ingredients', v_r.ingredients,
      'etapes', v_r.etapes,
      'astuce', v_r.astuce
    ) end
  );
end;
$$;

create or replace function prive.ma_situation()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_client uuid;
  v_email text;
  v_confirme timestamptz;
  v_ids uuid[];
  v_statut public.statut_inscription;
  v_c public.clients;
  v_s public.secteurs;
  v_p public.parametres_commandes;
  v_date date;
  v_commande uuid;
  v_date_commande date;
begin
  if v_uid is null then
    raise exception 'Connexion nécessaire.' using errcode = '42501';
  end if;
  if (select prive.est_equipe()) then
    return jsonb_build_object('etat', 'equipe');
  end if;

  v_client := prive.mon_client_id();
  if v_client is null then
    select email, email_confirmed_at into v_email, v_confirme from auth.users where id = v_uid;
    if v_confirme is not null and v_email is not null then
      select array_agg(c.id) into v_ids
      from public.clients c
      where lower(c.email) = lower(v_email)
        and not exists (select 1 from public.comptes_clients cc where cc.client_id = c.id);
      if coalesce(array_length(v_ids, 1), 0) = 1 then
        insert into public.comptes_clients (user_id, client_id) values (v_uid, v_ids[1]);
        delete from public.inscriptions where user_id = v_uid;
        v_client := v_ids[1];
      end if;
    end if;
  end if;

  if v_client is null then
    select statut into v_statut from public.inscriptions where user_id = v_uid;
    return jsonb_build_object('etat', coalesce(v_statut::text, 'nouveau'));
  end if;

  select * into v_c from public.clients where id = v_client;
  select * into v_s from public.secteurs where id = v_c.secteur_id;
  select * into v_p from public.parametres_commandes;
  v_date := prive.prochaine_livraison(v_c.secteur_id);

  if v_date is not null then
    select id, date_livraison into v_commande, v_date_commande
    from public.commandes
    where client_id = v_client
      and semaine = date_trunc('week', v_date::timestamp)::date
      and statut <> 'annulee';
  end if;

  return jsonb_build_object(
    'etat', 'client',
    'client_id', v_client,
    'prenom', v_c.prenom,
    'nom', v_c.nom,
    'actif', v_c.actif,
    -- Secteur réservé à l'équipe : son nom n'est pas montré au client
    'secteur', case when v_s.interne then null else v_s.nom end,
    'creneau', v_s.creneau,
    'prochaine_livraison', coalesce(v_date_commande, v_date),
    'cloture', case when v_date is not null then prive.cloture_commandes(coalesce(v_date_commande, v_date)) end,
    'commande_id', v_commande,
    'commandes_ouvertes', v_p.commandes_ouvertes,
    'message_clients', v_p.message_clients
  );
end;
$$;
