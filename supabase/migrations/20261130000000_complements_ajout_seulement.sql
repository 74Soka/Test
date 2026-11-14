-- =============================================================================
-- Compléments : le livreur ajoute des suppléments, et ne peut retirer que ce
-- qu'il a lui-même ajouté à la livraison (les suppléments et paniers commandés
-- restent intacts). La quantité ajoutée est retenue sur la ligne.
-- =============================================================================

alter table public.lignes_commande
  add column quantite_complement integer not null default 0 check (quantite_complement >= 0);
comment on column public.lignes_commande.quantite_complement is
  'Quantité ajoutée à la livraison (compléments du livreur), comprise dans quantite.';

create or replace function prive.modifier_complement(p_commande_id uuid, p_article_id uuid, p_ecart integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut public.statut_commande;
  v_article public.articles;
  v_quantite integer;
  v_ajoute integer;
  v_admin boolean := (select prive.est_admin());
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if not v_admin and not prive.commande_en_tournee(p_commande_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_ecart is null or p_ecart = 0 or p_ecart not between -99 and 99 then
    raise exception 'Quantité invalide.' using errcode = 'PN010';
  end if;

  select statut into v_statut from public.commandes where id = p_commande_id for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'PN006';
  end if;
  if v_statut <> 'a_livrer' then
    raise exception 'Commande déjà livrée (ou annulée) : annulez la livraison pour ajouter un complément.'
      using errcode = 'PN055';
  end if;

  select * into v_article from public.articles where id = p_article_id;
  if not found or v_article.categorie <> 'supplement' or not v_article.actif then
    raise exception 'Ce supplément n''est plus proposé au catalogue.' using errcode = 'PN004';
  end if;

  select quantite, least(quantite_complement, quantite) into v_quantite, v_ajoute
  from public.lignes_commande where commande_id = p_commande_id and article_id = p_article_id;

  -- Le livreur ne retire que ce qu'il a lui-même ajouté à la livraison :
  -- les suppléments et paniers commandés restent intacts
  if p_ecart < 0 and not v_admin and coalesce(v_ajoute, 0) < -p_ecart then
    raise exception 'Seuls les compléments ajoutés à la livraison peuvent être retirés.' using errcode = 'PN056';
  end if;

  if v_quantite is null then
    if p_ecart > 0 then
      insert into public.lignes_commande
        (commande_id, article_id, libelle, categorie, quantite, prix_unitaire_centimes, quantite_complement)
      values (p_commande_id, p_article_id, v_article.nom, v_article.categorie, p_ecart, v_article.prix_centimes, p_ecart);
    end if;
  elsif v_quantite + p_ecart <= 0 then
    delete from public.lignes_commande where commande_id = p_commande_id and article_id = p_article_id;
  elsif v_quantite + p_ecart > 99 then
    raise exception 'Quantité trop élevée (99 maximum par article).' using errcode = 'PN010';
  else
    update public.lignes_commande
    set quantite = v_quantite + p_ecart,
        quantite_complement = greatest(0, least(v_ajoute + p_ecart, v_quantite + p_ecart))
    where commande_id = p_commande_id and article_id = p_article_id;
  end if;

  return (
    select coalesce(sum(quantite * prix_unitaire_centimes), 0)::integer
    from public.lignes_commande where commande_id = p_commande_id
  );
end;
$$;
