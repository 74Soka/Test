-- =============================================================================
-- Supplément libre : sur une commande, l'équipe ajoute un supplément hors
-- catalogue (ex. « Fraises ») avec le prix qu'elle saisit.
--
-- Une ligne libre n'a pas d'article (article_id vide) : nom, quantité et prix
-- sont ceux saisis. Elle compte dans le total, le compte du client et les
-- 30 € sans panier ; elle ne rapporte pas de graines. Plusieurs par commande.
-- Le client qui modifie sa commande en ligne ne peut pas y toucher : elles
-- restent (p_libres null = on les garde).
-- =============================================================================

alter table public.lignes_commande add column id uuid not null default gen_random_uuid();
alter table public.lignes_commande drop constraint lignes_commande_pkey;
alter table public.lignes_commande add primary key (id);
alter table public.lignes_commande alter column article_id drop not null;
-- Un article du catalogue n'apparaît qu'une fois par commande (les lignes libres, sans article, peuvent être plusieurs)
create unique index lignes_commande_article_unique on public.lignes_commande (commande_id, article_id);
alter table public.lignes_commande add constraint lignes_commande_libre check (
  article_id is not null or (categorie = 'supplement' and length(btrim(libelle)) between 1 and 60)
);

drop function public.enregistrer_commande(uuid, date, jsonb, text, uuid, jsonb);

create function public.enregistrer_commande(
  p_client_id uuid,
  p_date_livraison date,
  p_lignes jsonb,
  p_notes text default null,
  p_commande_id uuid default null,
  p_recompenses jsonb default '[]'::jsonb,
  p_libres jsonb default null
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
  v_libres jsonb;
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or p_recompenses is null or jsonb_typeof(p_recompenses) <> 'array' then
    raise exception 'Le contenu de la commande est invalide.' using errcode = 'PN010';
  end if;

  -- Suppléments libres (nom et prix saisis par l'équipe) : null = on garde ceux
  -- déjà sur la commande (c'est le cas quand le client modifie en ligne)
  if p_libres is not null then
    if jsonb_typeof(p_libres) <> 'array' then
      raise exception 'Le contenu de la commande est invalide.' using errcode = 'PN010';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'libelle', btrim(x ->> 'libelle'),
             'quantite', (x ->> 'quantite')::integer,
             'prix', (x ->> 'prix_unitaire_centimes')::integer)), '[]'::jsonb)
    into v_libres
    from jsonb_array_elements(p_libres) x;
    if exists (
      select 1 from jsonb_array_elements(v_libres) x
      where coalesce(length(x ->> 'libelle'), 0) not between 1 and 60
         or coalesce((x ->> 'quantite')::integer, 0) not between 1 and 99
         or coalesce((x ->> 'prix')::integer, -1) not between 0 and 50000
    ) then
      raise exception 'Supplément libre : indiquez un nom (60 caractères maximum), une quantité et un prix (500 € maximum).'
        using errcode = 'PN053';
    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object('libelle', l.libelle, 'quantite', l.quantite, 'prix', l.prix_unitaire_centimes)), '[]'::jsonb)
    into v_libres
    from public.lignes_commande l
    where l.commande_id = p_commande_id and l.article_id is null;
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

  -- Au moins un panier (acheté ou offert), ou sans panier 30 € de suppléments
  -- achetés (prix figé d'une ligne déjà présente, sinon prix du catalogue)
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
  ) and (
    select coalesce(sum(d.quantite * coalesce(l.prix_unitaire_centimes, a.prix_centimes)), 0)
    from jsonb_to_recordset(v_demande) d(article_id uuid, quantite integer)
    join public.articles a on a.id = d.article_id
    left join public.lignes_commande l on l.commande_id = p_commande_id and l.article_id = d.article_id
  ) + (
    select coalesce(sum((x ->> 'quantite')::integer * (x ->> 'prix')::integer), 0)
    from jsonb_array_elements(v_libres) x
  ) < prive.minimum_sans_panier_centimes() then
    raise exception 'Choisissez au moins un panier, ou 30 € de suppléments.' using errcode = 'PN002';
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
    and l.article_id is not null
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

  if p_libres is not null then
    delete from public.lignes_commande where commande_id = v_id and article_id is null;
    insert into public.lignes_commande (commande_id, article_id, libelle, categorie, quantite, prix_unitaire_centimes)
    select v_id, null, x ->> 'libelle', 'supplement', (x ->> 'quantite')::integer, (x ->> 'prix')::integer
    from jsonb_array_elements(v_libres) x;
  end if;

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

revoke execute on function public.enregistrer_commande(uuid, date, jsonb, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.enregistrer_commande(uuid, date, jsonb, text, uuid, jsonb, jsonb) to authenticated;
