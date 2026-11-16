-- =============================================================================
-- « Supplément panier » en complément : à la livraison, le livreur ajoute un
-- panier vendu en plus, à 20 € ou 30 €. Ligne hors catalogue (les clients ne
-- la voient pas au catalogue), comptée comme complément : le livreur ne retire
-- que ce qu'il a ajouté. Montant à encaisser et compte du client suivent.
-- =============================================================================

create function prive.modifier_supplement_panier(p_commande_id uuid, p_prix_centimes integer, p_ecart integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut public.statut_commande;
  v_libelle text;
  v_ligne uuid;
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
  if p_prix_centimes not in (2000, 3000) then
    raise exception 'Supplément panier : 20 € ou 30 €.' using errcode = 'PN010';
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

  v_libelle := 'Supplément panier ' || (p_prix_centimes / 100) || ' €';
  select id, quantite, least(quantite_complement, quantite) into v_ligne, v_quantite, v_ajoute
  from public.lignes_commande
  where commande_id = p_commande_id and article_id is null and libelle = v_libelle
    and prix_unitaire_centimes = p_prix_centimes
  order by quantite_complement desc
  limit 1;

  if p_ecart < 0 and not v_admin and coalesce(v_ajoute, 0) < -p_ecart then
    raise exception 'Seuls les compléments ajoutés à la livraison peuvent être retirés.' using errcode = 'PN056';
  end if;

  if v_ligne is null then
    if p_ecart > 0 then
      insert into public.lignes_commande
        (commande_id, article_id, libelle, categorie, quantite, prix_unitaire_centimes, quantite_complement)
      values (p_commande_id, null, v_libelle, 'supplement', p_ecart, p_prix_centimes, p_ecart);
    end if;
  elsif v_quantite + p_ecart <= 0 then
    delete from public.lignes_commande where id = v_ligne;
  elsif v_quantite + p_ecart > 99 then
    raise exception 'Quantité trop élevée (99 maximum par article).' using errcode = 'PN010';
  else
    update public.lignes_commande
    set quantite = v_quantite + p_ecart,
        quantite_complement = greatest(0, least(v_ajoute + p_ecart, v_quantite + p_ecart))
    where id = v_ligne;
  end if;

  return (
    select coalesce(sum(quantite * prix_unitaire_centimes), 0)::integer
    from public.lignes_commande where commande_id = p_commande_id
  );
end;
$$;

create function public.modifier_supplement_panier(p_commande_id uuid, p_prix_centimes integer, p_ecart integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return prive.modifier_supplement_panier(p_commande_id, p_prix_centimes, p_ecart);
end;
$$;

revoke execute on function
  prive.modifier_supplement_panier(uuid, integer, integer),
  public.modifier_supplement_panier(uuid, integer, integer)
from public, anon;
grant execute on function
  prive.modifier_supplement_panier(uuid, integer, integer),
  public.modifier_supplement_panier(uuid, integer, integer)
to authenticated;
