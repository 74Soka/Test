-- =============================================================================
-- Fidélité : un « Supplément panier » (20 € ou 30 €, vendu par le livreur à la
-- livraison) rapporte une graine, comme un panier.
-- =============================================================================

create or replace function prive.synchroniser_tampons_commande()
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

    -- Seuls les articles achetés comptent (les cadeaux ne rapportent rien),
    -- plus une graine par « Supplément panier » vendu à la livraison
    select coalesce(sum(l.quantite * a.tampons), 0) into v_total
    from public.lignes_commande l
    join public.articles a on a.id = l.article_id
    where l.commande_id = new.id;
    v_total := v_total + (
      select coalesce(sum(l.quantite), 0)
      from public.lignes_commande l
      where l.commande_id = new.id and l.article_id is null and l.libelle like 'Supplément panier %'
    );

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
