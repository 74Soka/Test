-- =============================================================================
-- « Compléments » à la livraison : le livreur (ou l'administrateur) ajoute ou
-- retire des suppléments du catalogue sur une commande encore à livrer, au
-- prix du catalogue. Le montant à encaisser suit ; au « Livré », le compte du
-- client reçoit la commande ainsi ajustée.
--
-- Un livreur n'écrit toujours rien directement dans les tables : seulement par
-- cette fonction, pour une commande de ses tournées (veille → 7 jours).
-- =============================================================================

create function prive.modifier_complement(p_commande_id uuid, p_article_id uuid, p_ecart integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut public.statut_commande;
  v_article public.articles;
  v_quantite integer;
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if not (select prive.est_admin()) and not prive.commande_en_tournee(p_commande_id) then
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

  select quantite into v_quantite
  from public.lignes_commande where commande_id = p_commande_id and article_id = p_article_id;

  if v_quantite is null then
    if p_ecart > 0 then
      insert into public.lignes_commande (commande_id, article_id, libelle, categorie, quantite, prix_unitaire_centimes)
      values (p_commande_id, p_article_id, v_article.nom, v_article.categorie, p_ecart, v_article.prix_centimes);
    end if;
  elsif v_quantite + p_ecart <= 0 then
    delete from public.lignes_commande where commande_id = p_commande_id and article_id = p_article_id;
  elsif v_quantite + p_ecart > 99 then
    raise exception 'Quantité trop élevée (99 maximum par article).' using errcode = 'PN010';
  else
    update public.lignes_commande set quantite = v_quantite + p_ecart
    where commande_id = p_commande_id and article_id = p_article_id;
  end if;

  return (
    select coalesce(sum(quantite * prix_unitaire_centimes), 0)::integer
    from public.lignes_commande where commande_id = p_commande_id
  );
end;
$$;

create function public.modifier_complement(p_commande_id uuid, p_article_id uuid, p_ecart integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return prive.modifier_complement(p_commande_id, p_article_id, p_ecart);
end;
$$;

revoke execute on function prive.modifier_complement(uuid, uuid, integer), public.modifier_complement(uuid, uuid, integer)
  from public, anon;
grant execute on function prive.modifier_complement(uuid, uuid, integer), public.modifier_complement(uuid, uuid, integer)
  to authenticated;
