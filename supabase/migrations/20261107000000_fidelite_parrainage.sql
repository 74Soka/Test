-- =============================================================================
-- Fidélité et parrainage
-- =============================================================================
-- Gains (journal `tampons`, jamais un simple compteur) :
--   * création d'un client ............................ bienvenue (paramétrable)
--   * client rattaché à un parrain .................... parrainage, pour le parrain
--   * commande livrée ................................. somme des tampons des
--     articles achetés (Panier 30 € = 1, Panier 50 € = 2 ; réglé dans le catalogue)
--   * commande livrée d'un filleul .................... commande_filleul, pour le parrain
--   * correction manuelle ............................. ajustement (+ ou -)
-- Dépenses : une récompense utilisée est rattachée à une commande ; ses tampons
-- sont rendus si la commande est annulée ou supprimée.
-- Solde = tampons gagnés - récompenses utilisées (vue `fidelite_clients`).
-- Niveaux : VIP / Ultra selon le nombre de filleuls (paramétrable).
-- Les tampons d'une commande sont posés à la livraison, une seule fois (index
-- uniques), et retirés si la livraison est annulée.
-- =============================================================================

create type public.motif_tampon as enum ('bienvenue', 'parrainage', 'commande', 'commande_filleul', 'ajustement');
create type public.niveau_fidelite as enum ('standard', 'vip', 'ultra');

-- -----------------------------------------------------------------------------
-- Paramètres (une seule ligne)
-- -----------------------------------------------------------------------------
create table public.parametres_fidelite (
  id boolean primary key default true check (id),
  tampons_bienvenue integer not null default 1 check (tampons_bienvenue between 0 and 100),
  tampons_parrainage integer not null default 1 check (tampons_parrainage between 0 and 100),
  tampons_parrain_par_commande integer not null default 1 check (tampons_parrain_par_commande between 0 and 100),
  filleuls_vip integer not null default 5 check (filleuls_vip between 1 and 1000),
  filleuls_ultra integer not null default 10 check (filleuls_ultra between 1 and 1000),
  -- Ne compter, pour VIP / Ultra, que les filleuls déjà livrés au moins une fois
  filleuls_livres_seulement boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint parametres_ultra_apres_vip check (filleuls_ultra >= filleuls_vip)
);

insert into public.parametres_fidelite default values;

create trigger parametres_fidelite_updated_at before update on public.parametres_fidelite
  for each row execute function public.maj_updated_at();

-- -----------------------------------------------------------------------------
-- Tampons gagnés par unité achetée
-- -----------------------------------------------------------------------------
alter table public.articles
  add column tampons integer not null default 0 check (tampons between 0 and 100);

update public.articles set tampons = 1 where nom = 'Panier 30 €';
update public.articles set tampons = 2 where nom = 'Panier 50 €';

-- -----------------------------------------------------------------------------
-- Récompenses proposées
-- -----------------------------------------------------------------------------
create table public.recompenses (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (length(btrim(nom)) > 0),
  description text,
  cout_tampons integer not null check (cout_tampons between 1 and 1000),
  niveau public.niveau_fidelite not null default 'standard',
  -- Article proposé par défaut au moment d'offrir (ex. le Panier 30 €)
  article_id uuid references public.articles (id) on delete set null,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recompenses_article_idx on public.recompenses (article_id);

create trigger recompenses_updated_at before update on public.recompenses
  for each row execute function public.maj_updated_at();

insert into public.recompenses (nom, description, cout_tampons, niveau, article_id, ordre) values
  ('Supplément offert', '1 supplément au choix', 5, 'standard', null, 1),
  ('Confiture + supplément offerts', '1 confiture artisanale et 1 supplément au choix', 10, 'standard', null, 2),
  ('Panier 30 € offert', 'Réservé aux clients VIP', 20, 'vip',
    (select id from public.articles where nom = 'Panier 30 €'), 3),
  ('Panier 50 € offert', 'Réservé aux clients Ultra', 30, 'ultra',
    (select id from public.articles where nom = 'Panier 50 €'), 4);

-- -----------------------------------------------------------------------------
-- Journal des tampons gagnés
-- -----------------------------------------------------------------------------
create table public.tampons (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  quantite integer not null check (quantite <> 0),
  motif public.motif_tampon not null,
  -- Commande d'origine (motifs commande / commande_filleul)
  commande_id uuid references public.commandes (id) on delete set null,
  -- Filleul concerné (motifs parrainage / commande_filleul)
  filleul_id uuid references public.clients (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  constraint tampons_negatif_si_ajustement check (quantite > 0 or motif = 'ajustement')
);

create index tampons_client_idx on public.tampons (client_id);
create index tampons_commande_idx on public.tampons (commande_id);
create index tampons_filleul_idx on public.tampons (filleul_id);

-- Une seule fois chacun : jamais deux tampons pour le même événement
create unique index tampons_bienvenue_unique on public.tampons (client_id) where motif = 'bienvenue';
create unique index tampons_parrainage_unique on public.tampons (filleul_id) where motif = 'parrainage';
create unique index tampons_commande_unique on public.tampons (commande_id) where motif = 'commande';
create unique index tampons_commande_filleul_unique on public.tampons (commande_id) where motif = 'commande_filleul';

-- -----------------------------------------------------------------------------
-- Récompenses utilisées (dépenses) et ce qui est offert
-- -----------------------------------------------------------------------------
create table public.recompenses_utilisees (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes (id) on delete cascade,
  recompense_id uuid references public.recompenses (id) on delete set null,
  -- Nom et coût figés au moment de l'utilisation
  nom text not null,
  cout_tampons integer not null check (cout_tampons > 0),
  created_at timestamptz not null default now()
);

create index recompenses_utilisees_commande_idx on public.recompenses_utilisees (commande_id);
create index recompenses_utilisees_recompense_idx on public.recompenses_utilisees (recompense_id);

create table public.cadeaux (
  utilisation_id uuid not null references public.recompenses_utilisees (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete restrict,
  libelle text not null,
  categorie public.categorie_article not null,
  quantite integer not null check (quantite between 1 and 99),
  primary key (utilisation_id, article_id)
);

create index cadeaux_article_idx on public.cadeaux (article_id);

-- -----------------------------------------------------------------------------
-- Solde et niveau de chaque client
-- -----------------------------------------------------------------------------
create view public.fidelite_clients
with (security_invoker = true)
as
select
  c.id as client_id,
  coalesce(g.gagnes, 0)::integer as tampons_gagnes,
  coalesce(u.utilises, 0)::integer as tampons_utilises,
  (coalesce(g.gagnes, 0) - coalesce(u.utilises, 0))::integer as solde,
  coalesce(f.total, 0)::integer as filleuls,
  coalesce(f.livres, 0)::integer as filleuls_livres,
  (case when p.filleuls_livres_seulement then coalesce(f.livres, 0) else coalesce(f.total, 0) end)::integer
    as filleuls_comptes,
  (case
     when (case when p.filleuls_livres_seulement then coalesce(f.livres, 0) else coalesce(f.total, 0) end)
          >= p.filleuls_ultra then 'ultra'
     when (case when p.filleuls_livres_seulement then coalesce(f.livres, 0) else coalesce(f.total, 0) end)
          >= p.filleuls_vip then 'vip'
     else 'standard'
   end)::public.niveau_fidelite as niveau
from public.clients c
cross join public.parametres_fidelite p
left join lateral (
  select sum(t.quantite) as gagnes from public.tampons t where t.client_id = c.id
) g on true
left join lateral (
  select sum(ru.cout_tampons) as utilises
  from public.recompenses_utilisees ru
  join public.commandes co on co.id = ru.commande_id
  where co.client_id = c.id and co.statut <> 'annulee'
) u on true
left join lateral (
  select
    count(*) as total,
    count(*) filter (
      where exists (select 1 from public.commandes x where x.client_id = fi.id and x.statut = 'livree')
    ) as livres
  from public.clients fi
  where fi.parrain_id = c.id
) f on true;

-- -----------------------------------------------------------------------------
-- Déclencheurs : pose automatique des tampons
-- (schéma privé + SECURITY DEFINER : ils écrivent dans le journal quel que soit
-- le compte qui déclenche l'événement)
-- -----------------------------------------------------------------------------

-- Nouveau client : bienvenue, et parrainage pour son parrain éventuel
create function prive.tampons_nouveau_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parametres_fidelite;
begin
  select * into p from public.parametres_fidelite;

  if p.tampons_bienvenue > 0 then
    insert into public.tampons (client_id, quantite, motif)
    values (new.id, p.tampons_bienvenue, 'bienvenue')
    on conflict do nothing;
  end if;

  if new.parrain_id is not null and p.tampons_parrainage > 0 then
    insert into public.tampons (client_id, quantite, motif, filleul_id)
    values (new.parrain_id, p.tampons_parrainage, 'parrainage', new.id)
    on conflict do nothing;
  end if;

  return null;
end;
$$;

create trigger clients_tampons_nouveau_client
  after insert on public.clients
  for each row execute function prive.tampons_nouveau_client();

-- Parrain ajouté, changé ou retiré : le tampon de parrainage suit
create function prive.tampons_changement_parrain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parametres_fidelite;
begin
  if new.parrain_id is not distinct from old.parrain_id then
    return null;
  end if;

  select * into p from public.parametres_fidelite;

  delete from public.tampons where filleul_id = new.id and motif = 'parrainage';

  if new.parrain_id is not null and p.tampons_parrainage > 0 then
    insert into public.tampons (client_id, quantite, motif, filleul_id)
    values (new.parrain_id, p.tampons_parrainage, 'parrainage', new.id)
    on conflict do nothing;
  end if;

  return null;
end;
$$;

create trigger clients_tampons_changement_parrain
  after update of parrain_id on public.clients
  for each row execute function prive.tampons_changement_parrain();

-- Commande : les tampons suivent le statut « livrée » (contrôle en fin de
-- transaction, quand les lignes de la commande sont écrites)
create function prive.synchroniser_tampons_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.parametres_fidelite;
  v_statut public.statut_commande;
  v_client uuid;
  v_parrain uuid;
  v_livree_le timestamptz;
  v_total integer;
begin
  select statut, client_id, livree_le into v_statut, v_client, v_livree_le
  from public.commandes where id = new.id;

  if not found then
    return null;
  end if;

  if v_statut = 'livree' then
    select * into p from public.parametres_fidelite;

    -- Seuls les articles achetés comptent (les cadeaux ne rapportent rien)
    select coalesce(sum(l.quantite * a.tampons), 0) into v_total
    from public.lignes_commande l
    join public.articles a on a.id = l.article_id
    where l.commande_id = new.id;

    if v_total > 0 then
      insert into public.tampons (client_id, quantite, motif, commande_id, created_at)
      values (v_client, v_total, 'commande', new.id, coalesce(v_livree_le, now()))
      on conflict do nothing;
    end if;

    select parrain_id into v_parrain from public.clients where id = v_client;
    if v_parrain is not null and p.tampons_parrain_par_commande > 0 then
      insert into public.tampons (client_id, quantite, motif, commande_id, filleul_id, created_at)
      values (v_parrain, p.tampons_parrain_par_commande, 'commande_filleul', new.id, v_client, coalesce(v_livree_le, now()))
      on conflict do nothing;
    end if;
  else
    delete from public.tampons
    where commande_id = new.id and motif in ('commande', 'commande_filleul');
  end if;

  return null;
end;
$$;

create constraint trigger commandes_synchroniser_tampons
  after insert or update of statut on public.commandes
  deferrable initially deferred
  for each row execute function prive.synchroniser_tampons_commande();

-- Commande supprimée : ses tampons disparaissent. Exception : si c'est le client
-- qui est supprimé (RGPD), le parrain garde les tampons gagnés grâce à lui.
create function prive.tampons_commande_supprimee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.clients where id = old.client_id) then
    delete from public.tampons where commande_id = old.id;
  end if;
  return old;
end;
$$;

create trigger commandes_tampons_suppression
  before delete on public.commandes
  for each row execute function prive.tampons_commande_supprimee();

revoke execute on function prive.tampons_nouveau_client() from public;
revoke execute on function prive.tampons_changement_parrain() from public;
revoke execute on function prive.synchroniser_tampons_commande() from public;
revoke execute on function prive.tampons_commande_supprimee() from public;

-- -----------------------------------------------------------------------------
-- « Au moins un panier » : un panier offert compte aussi
-- -----------------------------------------------------------------------------
create or replace function public.verifier_commande_a_un_panier()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_commande_id uuid;
begin
  if tg_table_name = 'commandes' then
    v_commande_id := new.id;
  elsif tg_table_name = 'recompenses_utilisees' then
    v_commande_id := old.commande_id;
  elsif tg_op = 'DELETE' then
    v_commande_id := old.commande_id;
  else
    v_commande_id := new.commande_id;
  end if;

  if exists (select 1 from public.commandes where id = v_commande_id)
     and not exists (
       select 1 from public.lignes_commande
       where commande_id = v_commande_id and categorie = 'panier'
     )
     and not exists (
       select 1 from public.cadeaux ca
       join public.recompenses_utilisees ru on ru.id = ca.utilisation_id
       where ru.commande_id = v_commande_id and ca.categorie = 'panier'
     ) then
    raise exception 'Une commande doit contenir au moins un panier.'
      using errcode = 'PN002';
  end if;

  return null;
end;
$$;

create constraint trigger recompenses_au_moins_un_panier
  after delete on public.recompenses_utilisees
  deferrable initially deferred
  for each row execute function public.verifier_commande_a_un_panier();

-- -----------------------------------------------------------------------------
-- Enregistrer une commande, avec ses récompenses éventuelles
-- -----------------------------------------------------------------------------
-- p_recompenses : liste COMPLÈTE des récompenses de la commande :
--   [{"id": "<uuid existant ou null>", "recompense_id": "<uuid>",
--     "articles": [{"article_id": "<uuid>", "quantite": 1}, …]}, …]
-- Une récompense absente de la liste est retirée (tampons rendus).
drop function public.enregistrer_commande(uuid, date, jsonb, text, uuid);

create function public.enregistrer_commande(
  p_client_id uuid,
  p_date_livraison date,
  p_lignes jsonb,
  p_notes text default null,
  p_commande_id uuid default null,
  p_recompenses jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_statut public.statut_commande;
  v_client_actuel uuid;
  v_client_actif boolean;
  v_demande jsonb;
  v_contrainte text;
  v_r jsonb;
  v_rec public.recompenses;
  v_util_id uuid;
  v_solde integer;
  v_niveau public.niveau_fidelite;
  v_gardees uuid[];
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or p_recompenses is null or jsonb_typeof(p_recompenses) <> 'array' then
    raise exception 'Le contenu de la commande est invalide.' using errcode = 'PN010';
  end if;

  -- Verrou sur le client : deux récompenses ne peuvent pas dépenser les mêmes tampons
  select actif into v_client_actif from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client introuvable.' using errcode = 'PN011';
  end if;

  -- Quantités achetées, regroupées par article (les quantités nulles sont ignorées)
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
  ) or exists (
    select 1
    from jsonb_array_elements(p_recompenses) r
    cross join jsonb_array_elements(coalesce(r -> 'articles', '[]'::jsonb)) x
    left join public.articles a on a.id = (x ->> 'article_id')::uuid
    where a.id is null
  ) then
    raise exception 'Un article de la commande n''existe plus.' using errcode = 'PN004';
  end if;

  -- Au moins un panier, acheté ou offert
  if not exists (
    select 1 from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
    join public.articles a on a.id = d.article_id
    where a.categorie = 'panier'
  ) and not exists (
    select 1
    from jsonb_array_elements(p_recompenses) r
    cross join jsonb_array_elements(coalesce(r -> 'articles', '[]'::jsonb)) x
    join public.articles a on a.id = (x ->> 'article_id')::uuid
    where a.categorie = 'panier' and (x ->> 'quantite')::integer > 0
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
    select statut, client_id into v_statut, v_client_actuel
    from public.commandes where id = p_commande_id
    for update;

    if not found then
      raise exception 'Commande introuvable.' using errcode = 'PN006';
    end if;
    if v_statut <> 'a_livrer' then
      raise exception 'Seule une commande « à livrer » peut être modifiée.' using errcode = 'PN005';
    end if;
    if v_client_actuel <> p_client_id
       and exists (select 1 from public.recompenses_utilisees where commande_id = p_commande_id) then
      raise exception 'Cette commande contient des récompenses : on ne peut pas la passer à un autre client.'
        using errcode = 'PN023';
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

  -- Récompenses : on retire celles qui ne sont plus dans la liste (tampons rendus)…
  select coalesce(array_agg((r ->> 'id')::uuid), '{}')
  into v_gardees
  from jsonb_array_elements(p_recompenses) r
  where nullif(r ->> 'id', '') is not null;

  delete from public.recompenses_utilisees
  where commande_id = v_id and not (id = any (v_gardees));

  -- … puis on met à jour les autres et on ajoute les nouvelles
  for v_r in select value from jsonb_array_elements(p_recompenses)
  loop
    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_r -> 'articles', '[]'::jsonb)) x
      where (x ->> 'quantite')::integer > 0
    ) then
      raise exception 'Choisissez ce qui est offert pour chaque récompense.' using errcode = 'PN022';
    end if;

    if nullif(v_r ->> 'id', '') is not null then
      v_util_id := (v_r ->> 'id')::uuid;
      if not exists (
        select 1 from public.recompenses_utilisees where id = v_util_id and commande_id = v_id
      ) then
        raise exception 'Récompense introuvable sur cette commande.' using errcode = 'PN010';
      end if;
      delete from public.cadeaux where utilisation_id = v_util_id;
    else
      select * into v_rec from public.recompenses where id = (v_r ->> 'recompense_id')::uuid;
      if not found or not v_rec.actif then
        raise exception 'Cette récompense n''est plus proposée.' using errcode = 'PN024';
      end if;

      select f.solde, f.niveau into v_solde, v_niveau
      from public.fidelite_clients f where f.client_id = p_client_id;

      if (v_rec.niveau = 'vip' and v_niveau = 'standard')
         or (v_rec.niveau = 'ultra' and v_niveau <> 'ultra') then
        raise exception using
          message = format('« %s » est réservé aux clients %s.', v_rec.nom,
                           case v_rec.niveau when 'vip' then 'VIP' else 'Ultra' end),
          errcode = 'PN021';
      end if;

      if v_solde < v_rec.cout_tampons then
        raise exception using
          message = format('Pas assez de tampons pour « %s » : %s disponible(s), %s nécessaires.',
                           v_rec.nom, v_solde, v_rec.cout_tampons),
          errcode = 'PN020';
      end if;

      insert into public.recompenses_utilisees (commande_id, recompense_id, nom, cout_tampons)
      values (v_id, v_rec.id, v_rec.nom, v_rec.cout_tampons)
      returning id into v_util_id;
    end if;

    insert into public.cadeaux (utilisation_id, article_id, libelle, categorie, quantite)
    select v_util_id, a.id, a.nom, a.categorie, least(sum(s.quantite), 99)::integer
    from (
      select (x ->> 'article_id')::uuid as article_id, (x ->> 'quantite')::integer as quantite
      from jsonb_array_elements(coalesce(v_r -> 'articles', '[]'::jsonb)) x
    ) s
    join public.articles a on a.id = s.article_id
    where s.quantite > 0
    group by a.id, a.nom, a.categorie;
  end loop;

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
-- Sécurité
-- -----------------------------------------------------------------------------
alter table public.parametres_fidelite enable row level security;
alter table public.recompenses enable row level security;
alter table public.tampons enable row level security;
alter table public.recompenses_utilisees enable row level security;
alter table public.cadeaux enable row level security;

-- Paramètres : lecture équipe, modification admin (la ligne unique existe déjà)
create policy parametres_fidelite_lecture_equipe on public.parametres_fidelite
  for select to authenticated using ((select prive.est_equipe()));
create policy parametres_fidelite_modif_admin on public.parametres_fidelite
  for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()));

-- Récompenses proposées : lecture équipe, gestion admin
create policy recompenses_lecture_equipe on public.recompenses
  for select to authenticated using ((select prive.est_equipe()));
create policy recompenses_ajout_admin on public.recompenses
  for insert to authenticated with check ((select prive.est_admin()));
create policy recompenses_modif_admin on public.recompenses
  for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()));
create policy recompenses_suppr_admin on public.recompenses
  for delete to authenticated using ((select prive.est_admin()));

-- Journal : lecture équipe ; à la main, l'admin ne peut que poser ou retirer
-- des ajustements (le reste est écrit par les déclencheurs)
create policy tampons_lecture_equipe on public.tampons
  for select to authenticated using ((select prive.est_equipe()));
create policy tampons_ajout_ajustement_admin on public.tampons
  for insert to authenticated with check ((select prive.est_admin()) and motif = 'ajustement');
create policy tampons_suppr_ajustement_admin on public.tampons
  for delete to authenticated using ((select prive.est_admin()) and motif = 'ajustement');

-- Récompenses utilisées et cadeaux : lecture équipe, écriture admin
-- (en pratique via enregistrer_commande)
create policy recompenses_utilisees_lecture_equipe on public.recompenses_utilisees
  for select to authenticated using ((select prive.est_equipe()));
create policy recompenses_utilisees_ajout_admin on public.recompenses_utilisees
  for insert to authenticated with check ((select prive.est_admin()));
create policy recompenses_utilisees_suppr_admin on public.recompenses_utilisees
  for delete to authenticated using ((select prive.est_admin()));

create policy cadeaux_lecture_equipe on public.cadeaux
  for select to authenticated using ((select prive.est_equipe()));
create policy cadeaux_ajout_admin on public.cadeaux
  for insert to authenticated with check ((select prive.est_admin()));
create policy cadeaux_suppr_admin on public.cadeaux
  for delete to authenticated using ((select prive.est_admin()));

revoke all on table public.parametres_fidelite, public.recompenses, public.tampons,
  public.recompenses_utilisees, public.cadeaux, public.fidelite_clients from anon;
grant select, insert, update, delete on table public.parametres_fidelite, public.recompenses,
  public.tampons, public.recompenses_utilisees, public.cadeaux to authenticated;
grant select on table public.fidelite_clients to authenticated;

revoke execute on function public.enregistrer_commande(uuid, date, jsonb, text, uuid, jsonb) from public, anon;
grant execute on function public.enregistrer_commande(uuid, date, jsonb, text, uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Rattrapage des données déjà présentes
-- -----------------------------------------------------------------------------
insert into public.tampons (client_id, quantite, motif, created_at)
select c.id, p.tampons_bienvenue, 'bienvenue', c.created_at
from public.clients c cross join public.parametres_fidelite p
where p.tampons_bienvenue > 0
on conflict do nothing;

insert into public.tampons (client_id, quantite, motif, filleul_id, created_at)
select c.parrain_id, p.tampons_parrainage, 'parrainage', c.id, c.created_at
from public.clients c cross join public.parametres_fidelite p
where c.parrain_id is not null and p.tampons_parrainage > 0
on conflict do nothing;

insert into public.tampons (client_id, quantite, motif, commande_id, created_at)
select co.client_id, sum(l.quantite * a.tampons), 'commande', co.id, coalesce(co.livree_le, now())
from public.commandes co
join public.lignes_commande l on l.commande_id = co.id
join public.articles a on a.id = l.article_id
where co.statut = 'livree'
group by co.id, co.client_id, co.livree_le
having sum(l.quantite * a.tampons) > 0
on conflict do nothing;

insert into public.tampons (client_id, quantite, motif, commande_id, filleul_id, created_at)
select c.parrain_id, p.tampons_parrain_par_commande, 'commande_filleul', co.id, c.id, coalesce(co.livree_le, now())
from public.commandes co
join public.clients c on c.id = co.client_id
cross join public.parametres_fidelite p
where co.statut = 'livree' and c.parrain_id is not null and p.tampons_parrain_par_commande > 0
on conflict do nothing;
