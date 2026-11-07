-- =============================================================================
-- 1. Cadeaux de parrainage (en plus des tampons)
--    * le filleul : 6 œufs BIO offerts dans son premier panier ;
--    * le parrain : 1 confiture offerte quand son filleul commande pour la
--      première fois (à remettre lors d'une de ses livraisons).
--    Réservé aux nouveaux clients : la première commande du filleul doit dater
--    d'après le début de l'offre (paramètre, 1er janvier 2027 par défaut).
-- 2. Tournées : ordre de passage et bouton « Livré » (admin et livreurs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Cadeaux de parrainage
-- -----------------------------------------------------------------------------
create type public.type_recompense as enum ('tampons', 'bienvenue_filleul', 'cadeau_parrain');

alter table public.recompenses
  add column type public.type_recompense not null default 'tampons';

-- Les cadeaux de parrainage ne coûtent pas de tampons
alter table public.recompenses drop constraint recompenses_cout_tampons_check;
alter table public.recompenses add constraint recompenses_cout_selon_type check (
  (type = 'tampons' and cout_tampons between 1 and 1000) or (type <> 'tampons' and cout_tampons = 0)
);
-- Un seul cadeau de chaque sorte
create unique index recompenses_un_cadeau_par_type on public.recompenses (type) where type <> 'tampons';

alter table public.recompenses_utilisees
  add column type public.type_recompense not null default 'tampons',
  add column filleul_id uuid references public.clients (id) on delete set null;
alter table public.recompenses_utilisees drop constraint recompenses_utilisees_cout_tampons_check;
alter table public.recompenses_utilisees add constraint recompenses_utilisees_cout_positif check (cout_tampons >= 0);
create index recompenses_utilisees_filleul_idx on public.recompenses_utilisees (filleul_id);

alter table public.parametres_fidelite
  add column parrainage_cadeaux_debut date not null default date '2027-01-01';

insert into public.recompenses (nom, description, cout_tampons, niveau, type, article_id, ordre) values
  ('Œufs offerts au filleul', '6 œufs BIO offerts dans son premier panier', 0, 'standard', 'bienvenue_filleul',
    (select id from public.articles where nom = 'Œufs BIO (6)'), 50),
  ('Confiture offerte au parrain', '1 pot de confiture artisanale au choix, quand son filleul commande pour la première fois',
    0, 'standard', 'cadeau_parrain', null, 51);

-- Confitures dues aux parrains : une par filleul dont la première commande
-- (non annulée) date d'après le début de l'offre, et pas encore offerte
create view public.confitures_parrain_dues
with (security_invoker = true)
as
select
  fi.parrain_id as client_id,
  fi.id as filleul_id,
  fi.prenom as filleul_prenom,
  fi.nom as filleul_nom,
  premiere.date_livraison as premiere_commande
from public.clients fi
cross join public.parametres_fidelite p
join lateral (
  select min(co.date_livraison) as date_livraison
  from public.commandes co
  where co.client_id = fi.id and co.statut <> 'annulee'
) premiere on premiere.date_livraison is not null
where fi.parrain_id is not null
  and premiere.date_livraison >= p.parrainage_cadeaux_debut
  and not exists (
    select 1
    from public.recompenses_utilisees ru
    join public.commandes co on co.id = ru.commande_id
    where ru.type = 'cadeau_parrain' and ru.filleul_id = fi.id and co.statut <> 'annulee'
  );

-- Le solde exposé gagne trois informations utiles à la saisie
create or replace view public.fidelite_clients
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
   end)::public.niveau_fidelite as niveau,
  c.parrain_id,
  coalesce(n.commandes, 0)::integer as commandes_non_annulees,
  coalesce(d.confitures, 0)::integer as confitures_dues
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
) f on true
left join lateral (
  select count(*) as commandes from public.commandes co where co.client_id = c.id and co.statut <> 'annulee'
) n on true
left join lateral (
  select count(*) as confitures from public.confitures_parrain_dues d where d.client_id = c.id
) d on true;

-- Enregistrer une commande : mêmes règles, plus les cadeaux de parrainage
create or replace function public.enregistrer_commande(
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
  v_parrain uuid;
  v_debut date;
  v_demande jsonb;
  v_contrainte text;
  v_r jsonb;
  v_rec public.recompenses;
  v_util_id uuid;
  v_filleul uuid;
  v_solde integer;
  v_niveau public.niveau_fidelite;
  v_gardees uuid[];
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or p_recompenses is null or jsonb_typeof(p_recompenses) <> 'array' then
    raise exception 'Le contenu de la commande est invalide.' using errcode = 'PN010';
  end if;

  -- Verrou sur le client : deux récompenses ne peuvent pas dépenser les mêmes tampons
  select actif, parrain_id into v_client_actif, v_parrain
  from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client introuvable.' using errcode = 'PN011';
  end if;

  select parrainage_cadeaux_debut into v_debut from public.parametres_fidelite;

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

      v_filleul := null;

      if v_rec.type = 'tampons' then
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

      elsif v_rec.type = 'bienvenue_filleul' then
        -- Première commande (non annulée) d'un filleul, à partir du début de l'offre
        if v_parrain is null
           or p_date_livraison < v_debut
           or exists (
             select 1 from public.commandes co
             where co.client_id = p_client_id and co.id <> v_id and co.statut <> 'annulee'
               and co.date_livraison < p_date_livraison
           )
           or exists (
             select 1 from public.recompenses_utilisees ru
             join public.commandes co on co.id = ru.commande_id
             where ru.type = 'bienvenue_filleul' and ru.filleul_id = p_client_id and co.statut <> 'annulee'
           ) then
          raise exception using
            message = format('« %s » : réservé à la première commande d''un filleul, à partir du %s.',
                             v_rec.nom, to_char(v_debut, 'DD/MM/YYYY')),
            errcode = 'PN025';
        end if;
        v_filleul := p_client_id;

      else
        -- Confiture du parrain : pour le plus ancien filleul qui y donne droit
        select d.filleul_id into v_filleul
        from public.confitures_parrain_dues d
        where d.client_id = p_client_id
        order by d.premiere_commande, d.filleul_id
        limit 1;

        if v_filleul is null then
          raise exception using
            message = format('« %s » : aucun filleul de ce client n''y donne droit pour le moment.', v_rec.nom),
            errcode = 'PN026';
        end if;
      end if;

      insert into public.recompenses_utilisees (commande_id, recompense_id, nom, cout_tampons, type, filleul_id)
      values (v_id, v_rec.id, v_rec.nom, v_rec.cout_tampons, v_rec.type, v_filleul)
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
-- 2. Tournées
-- -----------------------------------------------------------------------------
alter table public.commandes
  add column ordre_tournee integer check (ordre_tournee >= 0);

create index commandes_tournee_idx on public.commandes (date_livraison, ordre_tournee);

-- Ordre de passage : les commandes dans l'ordre donné (admin et livreurs)
create function public.enregistrer_ordre_tournee(p_commandes uuid[])
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

-- Livré / pas livré, depuis la tournée (admin et livreurs). L'heure de
-- livraison peut être fournie : appui fait hors connexion, envoyé plus tard.
create function public.marquer_livraison(
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

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
revoke all on table public.confitures_parrain_dues from anon;
grant select on table public.confitures_parrain_dues to authenticated;
revoke all on table public.fidelite_clients from anon;
grant select on table public.fidelite_clients to authenticated;

revoke execute on function public.enregistrer_ordre_tournee(uuid[]) from public, anon;
grant execute on function public.enregistrer_ordre_tournee(uuid[]) to authenticated;
revoke execute on function public.marquer_livraison(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.marquer_livraison(uuid, boolean, timestamptz) to authenticated;
