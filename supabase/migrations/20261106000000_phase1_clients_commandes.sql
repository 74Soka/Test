-- =============================================================================
-- Phase 1 : secteurs, clients, catalogue, commandes
-- =============================================================================
-- Conventions :
--   * montants en centimes (integer) pour éviter les erreurs d'arrondi ;
--   * erreurs métier levées avec un code SQLSTATE « PNxxx » et un message en
--     français directement affichable dans l'application ;
--   * RLS activée sur toutes les tables : seuls les comptes présents dans
--     `profils` ont accès aux données (admin = lecture/écriture,
--     livreur = lecture). Un compte Supabase sans profil ne voit rien.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.role_utilisateur as enum ('admin', 'livreur');
create type public.creneau_livraison as enum ('matin', 'apres_midi', 'journee');
create type public.statut_commande as enum ('a_livrer', 'livree', 'annulee');
create type public.categorie_article as enum ('panier', 'supplement');
create type public.source_position as enum ('adresse', 'manuelle');

-- -----------------------------------------------------------------------------
-- Utilitaire : mise à jour automatique de updated_at
-- -----------------------------------------------------------------------------
create function public.maj_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profils (rôle de chaque compte)
-- -----------------------------------------------------------------------------
create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.role_utilisateur not null,
  nom text,
  created_at timestamptz not null default now()
);

comment on table public.profils is
  'Comptes autorisés à utiliser l''application. Un compte sans profil n''a accès à rien.';

-- Fonctions d'autorisation utilisées par les règles RLS.
-- Rangées dans un schéma privé, non exposé par l'API de Supabase : on ne peut
-- pas les appeler directement depuis l'extérieur.
-- SECURITY DEFINER : elles lisent `profils` sans dépendre de ses propres règles,
-- et ne renseignent que sur l'utilisateur qui fait la requête (auth.uid()).
create schema if not exists prive;
revoke all on schema prive from public;
grant usage on schema prive to authenticated;

create function prive.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profils
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create function prive.est_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profils where id = (select auth.uid())
  );
$$;

revoke execute on function prive.est_admin() from public;
revoke execute on function prive.est_equipe() from public;
grant execute on function prive.est_admin() to authenticated;
grant execute on function prive.est_equipe() to authenticated;

-- -----------------------------------------------------------------------------
-- Secteurs : une zone livrée sur un jour et un créneau donnés
-- -----------------------------------------------------------------------------
create table public.secteurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(btrim(nom)) > 0),
  -- Jour ISO : 1 = lundi … 6 = samedi, 7 = dimanche
  jour smallint not null check (jour between 1 and 7),
  creneau public.creneau_livraison not null default 'matin',
  depart_adresse text not null check (length(btrim(depart_adresse)) > 0),
  depart_lat double precision not null check (depart_lat between -90 and 90),
  depart_lng double precision not null check (depart_lng between -180 and 180),
  couleur text not null default '#15803d' check (couleur ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger secteurs_updated_at before update on public.secteurs
  for each row execute function public.maj_updated_at();

-- Communes couvertes, identifiées par leur code INSEE (renvoyé par le
-- géocodeur), ce qui permet de proposer automatiquement le secteur d'un client.
create table public.secteur_communes (
  secteur_id uuid not null references public.secteurs (id) on delete cascade,
  code_insee text not null check (code_insee ~ '^[0-9][0-9AB][0-9]{3}$'),
  nom text not null,
  primary key (secteur_id, code_insee)
);

create index secteur_communes_code_insee_idx on public.secteur_communes (code_insee);

-- -----------------------------------------------------------------------------
-- Clients
-- -----------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (length(btrim(nom)) > 0),
  prenom text not null default '',
  -- Format international E.164 (+33612345678)
  telephone text check (telephone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Adresse : « 12 Rue des Lilas » + code postal + commune
  adresse text not null check (length(btrim(adresse)) > 0),
  complement_adresse text,
  code_postal text not null check (code_postal ~ '^[0-9]{5}$'),
  commune text not null check (length(btrim(commune)) > 0),
  code_insee text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  source_position public.source_position,
  secteur_id uuid not null references public.secteurs (id) on delete restrict,
  notes_livraison text,
  parrain_id uuid references public.clients (id) on delete set null,
  actif boolean not null default true,
  date_inscription date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_pas_auto_parrainage check (parrain_id is null or parrain_id <> id),
  constraint clients_position_complete check (
    (lat is null) = (lng is null) and (lat is null) = (source_position is null)
  )
);

create index clients_secteur_idx on public.clients (secteur_id);
create index clients_parrain_idx on public.clients (parrain_id);

create trigger clients_updated_at before update on public.clients
  for each row execute function public.maj_updated_at();

-- Interdit les boucles de parrainage (A parraine B qui parraine A, etc.).
create function public.verifier_parrainage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parrain_id is null then
    return new;
  end if;

  if exists (
    with recursive chaine (id, profondeur) as (
      select new.parrain_id, 1
      union all
      select c.parrain_id, chaine.profondeur + 1
      from public.clients c
      join chaine on c.id = chaine.id
      where c.parrain_id is not null and chaine.profondeur < 10000
    )
    select 1 from chaine where id = new.id
  ) then
    raise exception 'Parrainage impossible : ce client est déjà, directement ou indirectement, le parrain du parrain choisi.'
      using errcode = 'PN001';
  end if;

  return new;
end;
$$;

create trigger clients_verifier_parrainage
  before insert or update of parrain_id on public.clients
  for each row execute function public.verifier_parrainage();

-- -----------------------------------------------------------------------------
-- Catalogue : paniers et suppléments (saisonniers : on les active/désactive)
-- -----------------------------------------------------------------------------
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(btrim(nom)) > 0),
  categorie public.categorie_article not null,
  prix_centimes integer not null check (prix_centimes >= 0),
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger articles_updated_at before update on public.articles
  for each row execute function public.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Commandes : une livraison, pour un client, à une date
-- -----------------------------------------------------------------------------
create table public.commandes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  date_livraison date not null,
  -- Lundi de la semaine de livraison (sert à la règle « une commande par semaine »)
  semaine date generated always as ((date_trunc('week', date_livraison::timestamp))::date) stored,
  statut public.statut_commande not null default 'a_livrer',
  livree_le timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commandes_horodatage_livraison check ((statut = 'livree') = (livree_le is not null))
);

-- Une seule commande (non annulée) par client et par semaine.
create unique index commandes_une_par_semaine
  on public.commandes (client_id, semaine)
  where statut <> 'annulee';

create index commandes_date_idx on public.commandes (date_livraison);

create trigger commandes_updated_at before update on public.commandes
  for each row execute function public.maj_updated_at();

-- Lignes : libellé, catégorie et prix sont figés au moment de la commande.
create table public.lignes_commande (
  commande_id uuid not null references public.commandes (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete restrict,
  libelle text not null,
  categorie public.categorie_article not null,
  quantite integer not null check (quantite between 1 and 99),
  prix_unitaire_centimes integer not null check (prix_unitaire_centimes >= 0),
  primary key (commande_id, article_id)
);

create index lignes_commande_article_idx on public.lignes_commande (article_id);

-- Garde-fou en base : toute commande contient au moins un panier.
-- Contrôle différé en fin de transaction, pour permettre d'écrire la commande
-- puis ses lignes.
create function public.verifier_commande_a_un_panier()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_commande_id uuid;
begin
  if tg_table_name = 'commandes' then
    v_commande_id := new.id;
  elsif tg_op = 'DELETE' then
    v_commande_id := old.commande_id;
  else
    v_commande_id := new.commande_id;
  end if;

  if exists (select 1 from public.commandes where id = v_commande_id)
     and not exists (
       select 1 from public.lignes_commande
       where commande_id = v_commande_id and categorie = 'panier'
     ) then
    raise exception 'Une commande doit contenir au moins un panier.'
      using errcode = 'PN002';
  end if;

  return null;
end;
$$;

create constraint trigger commandes_au_moins_un_panier
  after insert on public.commandes
  deferrable initially deferred
  for each row execute function public.verifier_commande_a_un_panier();

create constraint trigger lignes_au_moins_un_panier
  after update or delete on public.lignes_commande
  deferrable initially deferred
  for each row execute function public.verifier_commande_a_un_panier();

-- -----------------------------------------------------------------------------
-- Enregistrer une commande (création ou modification) en une seule transaction
-- -----------------------------------------------------------------------------
-- p_lignes : [{"article_id": "<uuid>", "quantite": 2}, …]
-- Prix : une ligne déjà présente garde son prix figé ; une nouvelle ligne prend
-- le prix actuel du catalogue.
create function public.enregistrer_commande(
  p_client_id uuid,
  p_date_livraison date,
  p_lignes jsonb,
  p_notes text default null,
  p_commande_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_statut public.statut_commande;
  v_client_actif boolean;
  v_demande jsonb;
  v_contrainte text;
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'Le contenu de la commande est invalide.' using errcode = 'PN010';
  end if;

  select actif into v_client_actif from public.clients where id = p_client_id;
  if not found then
    raise exception 'Client introuvable.' using errcode = 'PN011';
  end if;

  -- Quantités demandées, regroupées par article (les quantités nulles sont ignorées)
  select coalesce(jsonb_agg(jsonb_build_object('article_id', article_id, 'quantite', quantite)), '[]'::jsonb)
  into v_demande
  from (
    select (e ->> 'article_id')::uuid as article_id, sum((e ->> 'quantite')::integer)::integer as quantite
    from jsonb_array_elements(p_lignes) e
    group by 1
    having sum((e ->> 'quantite')::integer) > 0
  ) regroupe;

  if exists (
    select 1 from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
    where d.quantite > 99
  ) then
    raise exception 'Quantité trop élevée (99 maximum par article).' using errcode = 'PN010';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
    left join public.articles a on a.id = d.article_id
    where a.id is null
  ) then
    raise exception 'Un article de la commande n''existe plus.' using errcode = 'PN004';
  end if;

  if not exists (
    select 1 from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
    join public.articles a on a.id = d.article_id
    where a.categorie = 'panier'
  ) then
    raise exception 'Une commande doit contenir au moins un panier.' using errcode = 'PN002';
  end if;

  if p_commande_id is null then
    if not v_client_actif then
      raise exception 'Ce client est inactif : réactivez-le pour lui créer une commande.'
        using errcode = 'PN007';
    end if;

    insert into public.commandes (client_id, date_livraison, notes)
    values (p_client_id, p_date_livraison, nullif(btrim(p_notes), ''))
    returning id into v_id;
  else
    select statut into v_statut
    from public.commandes where id = p_commande_id
    for update;

    if not found then
      raise exception 'Commande introuvable.' using errcode = 'PN006';
    end if;
    if v_statut <> 'a_livrer' then
      raise exception 'Seule une commande « à livrer » peut être modifiée.' using errcode = 'PN005';
    end if;

    update public.commandes
    set client_id = p_client_id,
        date_livraison = p_date_livraison,
        notes = nullif(btrim(p_notes), '')
    where id = p_commande_id;

    v_id := p_commande_id;
  end if;

  -- Un article désactivé ne peut pas être ajouté (une ligne existante le garde)
  if exists (
    select 1 from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
    join public.articles a on a.id = d.article_id
    where not a.actif
      and not exists (
        select 1 from public.lignes_commande l
        where l.commande_id = v_id and l.article_id = d.article_id
      )
  ) then
    raise exception 'Un article de la commande n''est plus proposé au catalogue.' using errcode = 'PN004';
  end if;

  delete from public.lignes_commande l
  where l.commande_id = v_id
    and not exists (
      select 1 from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
      where d.article_id = l.article_id
    );

  update public.lignes_commande l
  set quantite = d.quantite
  from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
  where l.commande_id = v_id and l.article_id = d.article_id and l.quantite <> d.quantite;

  insert into public.lignes_commande (commande_id, article_id, libelle, categorie, quantite, prix_unitaire_centimes)
  select v_id, a.id, a.nom, a.categorie, d.quantite, a.prix_centimes
  from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
  join public.articles a on a.id = d.article_id
  where not exists (
    select 1 from public.lignes_commande l
    where l.commande_id = v_id and l.article_id = d.article_id
  );

  return v_id;
exception
  when unique_violation then
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte = 'commandes_une_par_semaine' then
      raise exception 'Ce client a déjà une commande cette semaine-là. Modifiez-la plutôt que d''en créer une nouvelle.'
        using errcode = 'PN003';
    end if;
    raise;
end;
$$;

-- -----------------------------------------------------------------------------
-- Changer le statut d'une commande (point d'entrée unique : la Phase 3 y
-- ajoutera l'attribution et le retrait des tampons de fidélité)
-- -----------------------------------------------------------------------------
create function public.changer_statut_commande(
  p_commande_id uuid,
  p_statut public.statut_commande
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contrainte text;
begin
  update public.commandes
  set statut = p_statut,
      livree_le = case when p_statut = 'livree' then coalesce(livree_le, now()) else null end
  where id = p_commande_id;

  if not found then
    raise exception 'Commande introuvable.' using errcode = 'PN006';
  end if;
exception
  when unique_violation then
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte = 'commandes_une_par_semaine' then
      raise exception 'Impossible de rétablir cette commande : le client a déjà une autre commande cette semaine-là.'
        using errcode = 'PN003';
    end if;
    raise;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sécurité : RLS sur toutes les tables
-- -----------------------------------------------------------------------------
alter table public.profils enable row level security;
alter table public.secteurs enable row level security;
alter table public.secteur_communes enable row level security;
alter table public.clients enable row level security;
alter table public.articles enable row level security;
alter table public.commandes enable row level security;
alter table public.lignes_commande enable row level security;

-- Profils : chacun lit le sien, l'admin lit tout. Aucune écriture via l'API :
-- les comptes sont créés par le script `npm run creer-admin` ou dans Supabase.
create policy "profils_lecture" on public.profils
  for select to authenticated
  using (id = (select auth.uid()) or (select prive.est_admin()));

-- Données métier : lecture pour l'équipe (admin + livreurs), écriture admin.
do $$
declare
  t text;
begin
  foreach t in array array['secteurs', 'secteur_communes', 'clients', 'articles', 'commandes', 'lignes_commande']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select prive.est_equipe()))',
      t || '_lecture_equipe', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select prive.est_admin()))',
      t || '_ajout_admin', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()))',
      t || '_modif_admin', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select prive.est_admin()))',
      t || '_suppr_admin', t);
  end loop;
end;
$$;

-- Droits : rien pour les visiteurs anonymes, accès via RLS pour les comptes connectés.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.enregistrer_commande(uuid, date, jsonb, text, uuid) to authenticated;
grant execute on function public.changer_statut_commande(uuid, public.statut_commande) to authenticated;
