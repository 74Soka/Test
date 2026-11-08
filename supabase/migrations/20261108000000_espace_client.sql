-- =============================================================================
-- Phase 3 : espace client
-- =============================================================================
-- Les clients ont leur propre compte (e-mail + mot de passe) :
--   * un compte dont l'e-mail confirmé correspond à une fiche client y est
--     relié automatiquement (table comptes_clients) ;
--   * sinon, la personne envoie une inscription, validée par l'administrateur
--     (qui crée la fiche ou la relie à une fiche existante).
-- Un client lit ses propres données (RLS) et n'écrit que par des fonctions
-- qui vérifient tout : commandes ouvertes, clôture (vendredi 12 h par défaut),
-- compte actif, règles des récompenses.
-- Les comptes de l'équipe (table profils) ne changent pas.
--
-- Fonctions : la logique est dans le schéma privé (SECURITY DEFINER, non
-- exposé par l'API) ; l'API n'expose que de petites fonctions SECURITY
-- INVOKER qui l'appellent. Les deux fonctions de tournée suivent désormais
-- le même modèle.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Paramètres des commandes en ligne (une seule ligne)
-- -----------------------------------------------------------------------------
create table public.parametres_commandes (
  id boolean primary key default true check (id),
  commandes_ouvertes boolean not null default true,
  -- Clôture : ce jour de la semaine (1 = lundi … 7 = dimanche), à cette heure
  -- (heure de Paris), avant chaque livraison
  cloture_jour smallint not null default 5 check (cloture_jour between 1 and 7),
  cloture_heure time not null default '12:00',
  -- Message affiché aux clients (ex. « Pas de livraison le 26 décembre »)
  message_clients text check (length(message_clients) <= 500),
  updated_at timestamptz not null default now()
);

insert into public.parametres_commandes default values;

create trigger parametres_commandes_updated_at before update on public.parametres_commandes
  for each row execute function public.maj_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Composition des paniers, semaine par semaine (lundi de la semaine)
-- -----------------------------------------------------------------------------
create table public.compositions (
  semaine date not null check (extract(isodow from semaine) = 1),
  article_id uuid not null references public.articles (id) on delete cascade,
  contenu text not null check (length(btrim(contenu)) between 1 and 2000),
  updated_at timestamptz not null default now(),
  primary key (semaine, article_id)
);

create index compositions_article_idx on public.compositions (article_id);

create trigger compositions_updated_at before update on public.compositions
  for each row execute function public.maj_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Origine des commandes et récompenses choisies en ligne
-- -----------------------------------------------------------------------------
create type public.source_commande as enum ('equipe', 'client');

alter table public.commandes
  add column source public.source_commande not null default 'equipe';

-- Nombre de suppléments que le client choisit lui-même pour une récompense
-- sans article imposé (ex. « Confiture + supplément » : 2)
alter table public.recompenses
  add column nb_offerts integer not null default 1 check (nb_offerts between 1 and 10);

update public.recompenses set nb_offerts = 2 where nom = 'Confiture + supplément offerts';

-- -----------------------------------------------------------------------------
-- 4. Comptes clients et inscriptions
-- -----------------------------------------------------------------------------
create table public.comptes_clients (
  user_id uuid primary key references auth.users (id) on delete cascade,
  client_id uuid not null unique references public.clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.comptes_clients is
  'Compte en ligne d''un client : relie un utilisateur (auth.users) à sa fiche.';

create type public.statut_inscription as enum ('en_attente', 'refusee');

create table public.inscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  prenom text not null default '' check (length(prenom) <= 100),
  nom text not null check (length(btrim(nom)) between 1 and 100),
  telephone text not null check (telephone ~ '^\+[1-9][0-9]{6,14}$'),
  adresse text not null check (length(btrim(adresse)) between 1 and 200),
  complement_adresse text check (length(complement_adresse) <= 200),
  code_postal text not null check (code_postal ~ '^[0-9]{5}$'),
  commune text not null check (length(btrim(commune)) between 1 and 100),
  code_insee text check (code_insee ~ '^[0-9][0-9AB][0-9]{3}$'),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  notes_livraison text check (length(notes_livraison) <= 500),
  -- Qui l'a parrainé, en toutes lettres (l'administrateur fait le lien)
  parrain text check (length(parrain) <= 100),
  statut public.statut_inscription not null default 'en_attente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inscriptions_position_complete check ((lat is null) = (lng is null))
);

comment on table public.inscriptions is
  'Inscriptions en ligne de nouveaux clients, en attente de validation.';

create trigger inscriptions_updated_at before update on public.inscriptions
  for each row execute function public.maj_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Fonctions privées d'identification
-- -----------------------------------------------------------------------------

-- Fiche client du compte connecté (ou null)
create function prive.mon_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select client_id from public.comptes_clients where user_id = (select auth.uid());
$$;

-- Secteur du client connecté (ou null)
create function prive.mon_secteur_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.secteur_id
  from public.comptes_clients cc
  join public.clients c on c.id = cc.client_id
  where cc.user_id = (select auth.uid());
$$;

-- Clôture des commandes pour une livraison : le dernier « jour de clôture » à
-- l'heure de clôture strictement avant le jour de livraison (heure de Paris)
create function prive.cloture_commandes(p_date date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_date - (case when e.ecart = 0 then 7 else e.ecart end)) + p.cloture_heure)
         at time zone 'Europe/Paris'
  from public.parametres_commandes p
  cross join lateral (
    select ((extract(isodow from p_date)::integer - p.cloture_jour + 7) % 7) as ecart
  ) e;
$$;

-- Prochaine livraison encore ouverte aux commandes pour un secteur
create function prive.prochaine_livraison(p_secteur_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select d.jour
  from public.secteurs s
  cross join lateral (
    select ((now() at time zone 'Europe/Paris')::date + i) as jour
    from generate_series(0, 21) as i
  ) d
  where s.id = p_secteur_id
    and extract(isodow from d.jour) = s.jour
    and now() < prive.cloture_commandes(d.jour)
  order by d.jour
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 6. Fonctions de l'espace client (logique privée)
-- -----------------------------------------------------------------------------

-- Situation du compte connecté. Relie au passage le compte à la fiche client
-- dont l'e-mail (confirmé) est le même, si elle est unique et libre.
create function prive.ma_situation()
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
    'secteur', v_s.nom,
    'creneau', v_s.creneau,
    'prochaine_livraison', coalesce(v_date_commande, v_date),
    'cloture', case when v_date is not null then prive.cloture_commandes(coalesce(v_date_commande, v_date)) end,
    'commande_id', v_commande,
    'commandes_ouvertes', v_p.commandes_ouvertes,
    'message_clients', v_p.message_clients
  );
end;
$$;

-- Carte de fidélité du client connecté (calculée sur toutes ses données,
-- filleuls compris, que la RLS ne lui montre pas)
create function prive.ma_fidelite()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client uuid := prive.mon_client_id();
  v_resultat jsonb;
begin
  if v_client is null then
    raise exception 'Votre compte n''est pas encore relié à une fiche client.' using errcode = 'PN030';
  end if;

  select jsonb_build_object(
    'solde', f.solde,
    'tampons_gagnes', f.tampons_gagnes,
    'tampons_utilises', f.tampons_utilises,
    'niveau', f.niveau,
    'filleuls_comptes', f.filleuls_comptes,
    'confitures_dues', f.confitures_dues,
    'filleuls', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'prenom', fi.prenom,
          'initiale', left(fi.nom, 1),
          'livre', exists (select 1 from public.commandes x where x.client_id = fi.id and x.statut = 'livree')
        )
        order by fi.date_inscription, fi.id
      )
      from public.clients fi
      where fi.parrain_id = v_client
    ), '[]'::jsonb)
  )
  into v_resultat
  from public.fidelite_clients f
  where f.client_id = v_client;

  return v_resultat;
end;
$$;

-- Commander (ou modifier sa commande) pour la prochaine livraison.
-- p_recompenses_gardees : récompenses déjà sur la commande que le client garde
-- p_nouvelles_recompenses : [{ recompense_id, articles: [{ article_id, quantite }] }]
-- Les cadeaux de parrainage s'ajoutent tout seuls quand le client y a droit
-- et que leur article est réglé.
create function prive.passer_commande(
  p_lignes jsonb,
  p_recompenses_gardees uuid[] default '{}',
  p_nouvelles_recompenses jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := prive.mon_client_id();
  v_actif boolean;
  v_secteur uuid;
  v_parrain uuid;
  v_ouvertes boolean;
  v_date date;
  v_commande uuid;
  v_statut public.statut_commande;
  v_date_commande date;
  v_recompenses jsonb := '[]'::jsonb;
  v_u record;
  v_r jsonb;
  v_rec public.recompenses;
  v_articles jsonb;
  v_debut date;
  v_id uuid;
begin
  if v_client is null then
    raise exception 'Votre compte n''est pas encore relié à une fiche client.' using errcode = 'PN030';
  end if;
  if p_nouvelles_recompenses is null or jsonb_typeof(p_nouvelles_recompenses) <> 'array' then
    raise exception 'Le contenu de la commande est invalide.' using errcode = 'PN010';
  end if;
  if length(p_notes) > 500 then
    raise exception 'Message trop long (500 caractères au plus).' using errcode = 'PN010';
  end if;

  select actif, secteur_id, parrain_id into v_actif, v_secteur, v_parrain
  from public.clients where id = v_client;
  if not v_actif then
    raise exception 'Votre compte est suspendu : contactez-nous pour commander.' using errcode = 'PN031';
  end if;

  select commandes_ouvertes into v_ouvertes from public.parametres_commandes;
  if not v_ouvertes then
    raise exception 'Les commandes en ligne sont fermées pour le moment.' using errcode = 'PN032';
  end if;

  v_date := prive.prochaine_livraison(v_secteur);
  if v_date is null then
    raise exception 'Aucune livraison n''est prévue prochainement pour votre secteur.' using errcode = 'PN033';
  end if;

  -- Commande déjà passée pour cette semaine (par le client ou par l'équipe) ?
  select id, statut, date_livraison into v_commande, v_statut, v_date_commande
  from public.commandes
  where client_id = v_client
    and semaine = date_trunc('week', v_date::timestamp)::date
    and statut <> 'annulee'
  for update;

  if v_commande is not null then
    if v_statut <> 'a_livrer' then
      raise exception 'Votre commande de cette semaine a déjà été livrée.' using errcode = 'PN034';
    end if;
    if now() >= prive.cloture_commandes(v_date_commande) then
      raise exception 'Les commandes de cette livraison sont closes : contactez-nous pour toute modification.'
        using errcode = 'PN036';
    end if;
    v_date := v_date_commande;

    -- Récompenses déjà sur la commande : les cadeaux de parrainage restent,
    -- les autres seulement si le client les garde (sinon, tampons rendus)
    for v_u in
      select ru.id, ru.recompense_id, ru.type
      from public.recompenses_utilisees ru
      where ru.commande_id = v_commande
    loop
      if v_u.type <> 'tampons' or v_u.id = any (coalesce(p_recompenses_gardees, '{}')) then
        v_recompenses := v_recompenses || jsonb_build_array(jsonb_build_object(
          'id', v_u.id,
          'recompense_id', v_u.recompense_id,
          'articles', coalesce((
            select jsonb_agg(jsonb_build_object('article_id', ca.article_id, 'quantite', ca.quantite))
            from public.cadeaux ca where ca.utilisation_id = v_u.id
          ), '[]'::jsonb)
        ));
      end if;
    end loop;
  end if;

  -- Nouvelles récompenses : seulement celles payées en tampons, avec ce que
  -- la règle autorise (l'article imposé, ou N suppléments au choix)
  for v_r in select value from jsonb_array_elements(p_nouvelles_recompenses)
  loop
    select * into v_rec from public.recompenses
    where id = nullif(v_r ->> 'recompense_id', '')::uuid;
    if not found or not v_rec.actif or v_rec.type <> 'tampons' then
      raise exception 'Cette récompense n''est plus proposée.' using errcode = 'PN024';
    end if;

    if v_rec.article_id is not null then
      v_articles := jsonb_build_array(jsonb_build_object('article_id', v_rec.article_id, 'quantite', 1));
    else
      select coalesce(jsonb_agg(jsonb_build_object('article_id', s.article_id, 'quantite', s.quantite)), '[]'::jsonb)
      into v_articles
      from (
        select (x ->> 'article_id')::uuid as article_id, sum((x ->> 'quantite')::integer)::integer as quantite
        from jsonb_array_elements(coalesce(v_r -> 'articles', '[]'::jsonb)) x
        group by 1
        having sum((x ->> 'quantite')::integer) > 0
      ) s;

      if coalesce((select sum((a ->> 'quantite')::integer) from jsonb_array_elements(v_articles) a), 0)
           <> v_rec.nb_offerts
         or exists (
           select 1 from jsonb_array_elements(v_articles) a
           left join public.articles ar on ar.id = (a ->> 'article_id')::uuid
           where ar.id is null or not ar.actif or ar.categorie <> 'supplement'
         ) then
        raise exception using
          message = format('« %s » : choisissez %s supplément%s parmi ceux proposés.',
                           v_rec.nom, v_rec.nb_offerts, case when v_rec.nb_offerts > 1 then 's' else '' end),
          errcode = 'PN035';
      end if;
    end if;

    v_recompenses := v_recompenses || jsonb_build_array(
      jsonb_build_object('recompense_id', v_rec.id, 'articles', v_articles)
    );
  end loop;

  -- Cadeaux de parrainage dus, s'ils ne sont pas déjà sur la commande
  select parrainage_cadeaux_debut into v_debut from public.parametres_fidelite;
  for v_rec in
    select * from public.recompenses
    where type <> 'tampons' and actif and article_id is not null
    order by ordre
  loop
    continue when exists (
      select 1 from jsonb_array_elements(v_recompenses) x where x ->> 'recompense_id' = v_rec.id::text
    );
    if v_rec.type = 'bienvenue_filleul' then
      continue when v_parrain is null or v_date < v_debut;
      continue when exists (
        select 1 from public.commandes co
        where co.client_id = v_client and co.statut <> 'annulee'
          and co.id is distinct from v_commande and co.date_livraison < v_date
      );
      continue when exists (
        select 1 from public.recompenses_utilisees ru
        join public.commandes co on co.id = ru.commande_id
        where ru.type = 'bienvenue_filleul' and ru.filleul_id = v_client and co.statut <> 'annulee'
      );
    else
      continue when not exists (select 1 from public.confitures_parrain_dues d where d.client_id = v_client);
    end if;
    v_recompenses := v_recompenses || jsonb_build_array(jsonb_build_object(
      'recompense_id', v_rec.id,
      'articles', jsonb_build_array(jsonb_build_object('article_id', v_rec.article_id, 'quantite', 1))
    ));
  end loop;

  v_id := public.enregistrer_commande(v_client, v_date, p_lignes, p_notes, v_commande, v_recompenses);

  if v_commande is null then
    update public.commandes set source = 'client' where id = v_id;
  end if;

  return jsonb_build_object('commande_id', v_id, 'nouvelle', v_commande is null, 'date_livraison', v_date);
end;
$$;

-- Annuler sa commande, jusqu'à la clôture
create function prive.annuler_ma_commande(p_commande_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := prive.mon_client_id();
  v_proprietaire uuid;
  v_statut public.statut_commande;
  v_date date;
begin
  select client_id, statut, date_livraison into v_proprietaire, v_statut, v_date
  from public.commandes where id = p_commande_id
  for update;

  if not found or v_client is null or v_proprietaire <> v_client then
    raise exception 'Commande introuvable.' using errcode = 'PN006';
  end if;
  if v_statut <> 'a_livrer' then
    raise exception 'Seule une commande « à livrer » peut être annulée.' using errcode = 'PN005';
  end if;
  if now() >= prive.cloture_commandes(v_date) then
    raise exception 'Les commandes de cette livraison sont closes : contactez-nous pour toute modification.'
      using errcode = 'PN036';
  end if;

  update public.commandes set statut = 'annulee', livree_le = null where id = p_commande_id;
end;
$$;

-- Téléphone et consignes de livraison du client connecté
create function prive.modifier_mes_coordonnees(p_telephone text, p_notes_livraison text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client uuid := prive.mon_client_id();
begin
  if v_client is null then
    raise exception 'Votre compte n''est pas encore relié à une fiche client.' using errcode = 'PN030';
  end if;
  if length(p_notes_livraison) > 500 then
    raise exception 'Consignes trop longues (500 caractères au plus).' using errcode = 'PN010';
  end if;
  update public.clients
  set telephone = nullif(btrim(p_telephone), ''),
      notes_livraison = nullif(btrim(p_notes_livraison), '')
  where id = v_client;
end;
$$;

-- Inscription (ou correction de l'inscription en attente) d'un nouveau client
create function prive.envoyer_inscription(
  p_prenom text,
  p_nom text,
  p_telephone text,
  p_adresse text,
  p_complement_adresse text,
  p_code_postal text,
  p_commune text,
  p_code_insee text,
  p_lat double precision,
  p_lng double precision,
  p_notes_livraison text,
  p_parrain text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_lignes integer;
begin
  if v_uid is null then
    raise exception 'Connexion nécessaire.' using errcode = '42501';
  end if;
  if (select prive.est_equipe()) or prive.mon_client_id() is not null then
    raise exception 'Votre compte est déjà actif.' using errcode = 'PN043';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.inscriptions as i (
    user_id, email, prenom, nom, telephone, adresse, complement_adresse, code_postal, commune,
    code_insee, lat, lng, notes_livraison, parrain
  ) values (
    v_uid, v_email, coalesce(btrim(p_prenom), ''), btrim(p_nom), p_telephone, btrim(p_adresse),
    nullif(btrim(p_complement_adresse), ''), p_code_postal, btrim(p_commune), nullif(p_code_insee, ''),
    p_lat, p_lng, nullif(btrim(p_notes_livraison), ''), nullif(btrim(p_parrain), '')
  )
  on conflict (user_id) do update set
    email = excluded.email,
    prenom = excluded.prenom,
    nom = excluded.nom,
    telephone = excluded.telephone,
    adresse = excluded.adresse,
    complement_adresse = excluded.complement_adresse,
    code_postal = excluded.code_postal,
    commune = excluded.commune,
    code_insee = excluded.code_insee,
    lat = excluded.lat,
    lng = excluded.lng,
    notes_livraison = excluded.notes_livraison,
    parrain = excluded.parrain
  where i.statut = 'en_attente';

  get diagnostics v_lignes = row_count;
  if v_lignes = 0 then
    raise exception 'Votre inscription n''a pas été acceptée : contactez-nous.' using errcode = 'PN044';
  end if;
end;
$$;

-- Validation d'une inscription par l'administrateur : nouvelle fiche (dans le
-- secteur choisi) ou fiche existante. Renvoie l'id de la fiche.
create function prive.valider_inscription(
  p_user_id uuid,
  p_secteur_id uuid default null,
  p_client_id uuid default null,
  p_parrain_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_i public.inscriptions;
  v_client uuid;
begin
  if not (select prive.est_admin()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select * into v_i from public.inscriptions where user_id = p_user_id for update;
  if not found then
    raise exception 'Inscription introuvable.' using errcode = 'PN040';
  end if;
  if exists (select 1 from public.comptes_clients where user_id = p_user_id) then
    raise exception 'Ce compte est déjà relié à une fiche client.' using errcode = 'PN041';
  end if;

  if p_client_id is not null then
    if exists (select 1 from public.comptes_clients where client_id = p_client_id) then
      raise exception 'Cette fiche est déjà reliée à un autre compte.' using errcode = 'PN042';
    end if;
    update public.clients set email = coalesce(email, v_i.email) where id = p_client_id
    returning id into v_client;
    if v_client is null then
      raise exception 'Client introuvable.' using errcode = 'PN011';
    end if;
  else
    if p_secteur_id is null then
      raise exception 'Choisissez le secteur du client.' using errcode = 'PN045';
    end if;
    insert into public.clients (
      nom, prenom, telephone, email, adresse, complement_adresse, code_postal, commune, code_insee,
      lat, lng, source_position, secteur_id, notes_livraison, parrain_id
    ) values (
      v_i.nom, v_i.prenom, v_i.telephone, v_i.email, v_i.adresse, v_i.complement_adresse, v_i.code_postal,
      v_i.commune, v_i.code_insee, v_i.lat, v_i.lng,
      case when v_i.lat is not null then 'adresse'::public.source_position end,
      p_secteur_id, v_i.notes_livraison, p_parrain_id
    )
    returning id into v_client;
  end if;

  insert into public.comptes_clients (user_id, client_id) values (p_user_id, v_client);
  delete from public.inscriptions where user_id = p_user_id;
  return v_client;
end;
$$;

-- Suppression de son compte et de toutes ses données (RGPD)
create function prive.supprimer_mon_compte()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_client uuid := prive.mon_client_id();
begin
  if v_uid is null then
    raise exception 'Connexion nécessaire.' using errcode = '42501';
  end if;
  if (select prive.est_equipe()) then
    raise exception 'Un compte de l''équipe se supprime depuis Supabase.' using errcode = 'PN046';
  end if;
  if v_client is not null then
    delete from public.clients where id = v_client;
  end if;
  delete from auth.users where id = v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Tournées : logique déplacée dans le schéma privé
-- -----------------------------------------------------------------------------
create function prive.enregistrer_ordre_tournee(p_commandes uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update public.commandes c
  set ordre_tournee = o.position - 1
  from unnest(p_commandes) with ordinality as o(id, position)
  where c.id = o.id and c.ordre_tournee is distinct from (o.position - 1)::integer;
end;
$$;

create function prive.marquer_livraison(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut public.statut_commande;
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select statut into v_statut from public.commandes where id = p_commande_id for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'PN006';
  end if;
  if v_statut = 'annulee' then
    raise exception 'Cette commande a été annulée.' using errcode = 'PN027';
  end if;

  update public.commandes
  set statut = case when p_livree then 'livree'::public.statut_commande else 'a_livrer'::public.statut_commande end,
      livree_le = case
        when p_livree then coalesce(livree_le, least(coalesce(p_livree_le, now()), now()))
        else null
      end
  where id = p_commande_id;
end;
$$;

create or replace function public.enregistrer_ordre_tournee(p_commandes uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform prive.enregistrer_ordre_tournee(p_commandes);
end;
$$;

create or replace function public.marquer_livraison(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform prive.marquer_livraison(p_commande_id, p_livree, p_livree_le);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Fonctions exposées par l'API (SECURITY INVOKER, elles appellent le privé)
-- -----------------------------------------------------------------------------
create function public.ma_situation()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  return prive.ma_situation();
end;
$$;

create function public.ma_fidelite()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return prive.ma_fidelite();
end;
$$;

create function public.passer_commande(
  p_lignes jsonb,
  p_recompenses_gardees uuid[] default '{}',
  p_nouvelles_recompenses jsonb default '[]'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  return prive.passer_commande(p_lignes, p_recompenses_gardees, p_nouvelles_recompenses, p_notes);
end;
$$;

create function public.annuler_ma_commande(p_commande_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform prive.annuler_ma_commande(p_commande_id);
end;
$$;

create function public.modifier_mes_coordonnees(p_telephone text, p_notes_livraison text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform prive.modifier_mes_coordonnees(p_telephone, p_notes_livraison);
end;
$$;

create function public.envoyer_inscription(
  p_prenom text,
  p_nom text,
  p_telephone text,
  p_adresse text,
  p_complement_adresse text,
  p_code_postal text,
  p_commune text,
  p_code_insee text,
  p_lat double precision,
  p_lng double precision,
  p_notes_livraison text,
  p_parrain text
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform prive.envoyer_inscription(
    p_prenom, p_nom, p_telephone, p_adresse, p_complement_adresse, p_code_postal, p_commune,
    p_code_insee, p_lat, p_lng, p_notes_livraison, p_parrain
  );
end;
$$;

create function public.valider_inscription(
  p_user_id uuid,
  p_secteur_id uuid default null,
  p_client_id uuid default null,
  p_parrain_id uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  return prive.valider_inscription(p_user_id, p_secteur_id, p_client_id, p_parrain_id);
end;
$$;

create function public.supprimer_mon_compte()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform prive.supprimer_mon_compte();
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RLS
-- -----------------------------------------------------------------------------
alter table public.parametres_commandes enable row level security;
alter table public.compositions enable row level security;
alter table public.comptes_clients enable row level security;
alter table public.inscriptions enable row level security;

-- Paramètres et composition : lisibles par tout compte connecté, modifiés par l'admin
create policy parametres_commandes_lecture on public.parametres_commandes
  for select to authenticated using (true);
create policy parametres_commandes_modif_admin on public.parametres_commandes
  for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()));

create policy compositions_lecture on public.compositions
  for select to authenticated using (true);
create policy compositions_ajout_admin on public.compositions
  for insert to authenticated with check ((select prive.est_admin()));
create policy compositions_modif_admin on public.compositions
  for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()));
create policy compositions_suppr_admin on public.compositions
  for delete to authenticated using ((select prive.est_admin()));

-- Comptes : chacun voit le sien, l'admin voit et délie tout (création par fonctions)
create policy comptes_clients_lecture on public.comptes_clients
  for select to authenticated using (user_id = (select auth.uid()) or (select prive.est_admin()));
create policy comptes_clients_suppr_admin on public.comptes_clients
  for delete to authenticated using ((select prive.est_admin()));

-- Inscriptions : chacun voit la sienne ; l'admin voit, refuse et supprime
-- (création et correction par la fonction envoyer_inscription)
create policy inscriptions_lecture on public.inscriptions
  for select to authenticated using (user_id = (select auth.uid()) or (select prive.est_admin()));
create policy inscriptions_modif_admin on public.inscriptions
  for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()));
create policy inscriptions_suppr_admin on public.inscriptions
  for delete to authenticated using ((select prive.est_admin()));

-- Le client lit ses propres données
create policy clients_lecture_client on public.clients
  for select to authenticated using (id = (select prive.mon_client_id()));
create policy commandes_lecture_client on public.commandes
  for select to authenticated using (client_id = (select prive.mon_client_id()));
create policy lignes_commande_lecture_client on public.lignes_commande
  for select to authenticated using (
    commande_id in (select c.id from public.commandes c where c.client_id = (select prive.mon_client_id()))
  );
create policy recompenses_utilisees_lecture_client on public.recompenses_utilisees
  for select to authenticated using (
    commande_id in (select c.id from public.commandes c where c.client_id = (select prive.mon_client_id()))
  );
create policy cadeaux_lecture_client on public.cadeaux
  for select to authenticated using (
    utilisation_id in (
      select ru.id from public.recompenses_utilisees ru
      join public.commandes c on c.id = ru.commande_id
      where c.client_id = (select prive.mon_client_id())
    )
  );
create policy tampons_lecture_client on public.tampons
  for select to authenticated using (client_id = (select prive.mon_client_id()));
create policy secteurs_lecture_client on public.secteurs
  for select to authenticated using (id = (select prive.mon_secteur_id()));

-- Catalogue, récompenses et règles : visibles de tout compte connecté
-- (y compris une inscription en attente)
create policy articles_lecture_catalogue on public.articles
  for select to authenticated using (actif);
create policy recompenses_lecture_catalogue on public.recompenses
  for select to authenticated using (actif);
create policy parametres_fidelite_lecture on public.parametres_fidelite
  for select to authenticated using (true);

-- -----------------------------------------------------------------------------
-- 10. Droits
-- -----------------------------------------------------------------------------
revoke all on table public.parametres_commandes, public.compositions, public.comptes_clients,
  public.inscriptions from anon;
grant select, insert, update, delete on table public.parametres_commandes, public.compositions,
  public.comptes_clients, public.inscriptions to authenticated;

revoke execute on function
  prive.mon_client_id(),
  prive.mon_secteur_id(),
  prive.cloture_commandes(date),
  prive.prochaine_livraison(uuid),
  prive.ma_situation(),
  prive.ma_fidelite(),
  prive.passer_commande(jsonb, uuid[], jsonb, text),
  prive.annuler_ma_commande(uuid),
  prive.modifier_mes_coordonnees(text, text),
  prive.envoyer_inscription(text, text, text, text, text, text, text, text, double precision, double precision, text, text),
  prive.valider_inscription(uuid, uuid, uuid, uuid),
  prive.supprimer_mon_compte(),
  prive.enregistrer_ordre_tournee(uuid[]),
  prive.marquer_livraison(uuid, boolean, timestamptz)
from public, anon;

grant execute on function
  prive.mon_client_id(),
  prive.mon_secteur_id(),
  prive.cloture_commandes(date),
  prive.prochaine_livraison(uuid),
  prive.ma_situation(),
  prive.ma_fidelite(),
  prive.passer_commande(jsonb, uuid[], jsonb, text),
  prive.annuler_ma_commande(uuid),
  prive.modifier_mes_coordonnees(text, text),
  prive.envoyer_inscription(text, text, text, text, text, text, text, text, double precision, double precision, text, text),
  prive.valider_inscription(uuid, uuid, uuid, uuid),
  prive.supprimer_mon_compte(),
  prive.enregistrer_ordre_tournee(uuid[]),
  prive.marquer_livraison(uuid, boolean, timestamptz)
to authenticated;

revoke execute on function
  public.ma_situation(),
  public.ma_fidelite(),
  public.passer_commande(jsonb, uuid[], jsonb, text),
  public.annuler_ma_commande(uuid),
  public.modifier_mes_coordonnees(text, text),
  public.envoyer_inscription(text, text, text, text, text, text, text, text, double precision, double precision, text, text),
  public.valider_inscription(uuid, uuid, uuid, uuid),
  public.supprimer_mon_compte()
from public, anon;

grant execute on function
  public.ma_situation(),
  public.ma_fidelite(),
  public.passer_commande(jsonb, uuid[], jsonb, text),
  public.annuler_ma_commande(uuid),
  public.modifier_mes_coordonnees(text, text),
  public.envoyer_inscription(text, text, text, text, text, text, text, text, double precision, double precision, text, text),
  public.valider_inscription(uuid, uuid, uuid, uuid),
  public.supprimer_mon_compte()
to authenticated;
