-- =============================================================================
-- « Livré et payé » en deux lignes : le livreur note ce qu'il a reçu en chèque
-- ET ce qu'il a reçu en espèces (ex. le chèque du panier, préparé d'avance, et
-- les compléments payés en espèces).
--
-- Commande : recu_cheque_centimes et recu_especes_centimes ; montant_recu_centimes
-- reste le total reçu et mode_paiement vaut 'cheque', 'especes' ou 'mixte'.
-- Compte du client : un mouvement « paiement » par mode (chèque, espèces).
-- L'ancienne fonction marquer_livraison (montant + mode) continue de marcher.
-- =============================================================================

alter table public.commandes
  add column recu_cheque_centimes integer check (recu_cheque_centimes between 0 and 1000000),
  add column recu_especes_centimes integer check (recu_especes_centimes between 0 and 1000000);
comment on column public.commandes.recu_cheque_centimes is 'Reçu en chèque à la livraison (« Livré et payé »), null si non saisi.';
comment on column public.commandes.recu_especes_centimes is 'Reçu en espèces à la livraison (« Livré et payé »), null si non saisi.';

alter table public.commandes drop constraint commandes_mode_paiement_check;
alter table public.commandes
  add constraint commandes_mode_paiement_check check (mode_paiement in ('especes', 'cheque', 'mixte'));
comment on column public.commandes.mode_paiement is 'especes, cheque ou mixte (chèque + espèces), avec le montant reçu.';

-- Montants et mode n'ont de sens que pour une commande livrée et payée
create or replace function prive.preparer_paiement_commande()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.statut <> 'livree' then
    new.payee := null;
  end if;
  if new.payee is not true then
    new.montant_recu_centimes := null;
    new.mode_paiement := null;
    new.recu_cheque_centimes := null;
    new.recu_especes_centimes := null;
  end if;
  return new;
end;
$$;

create or replace function prive.compte_apres_livraison()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_solde integer;
begin
  if tg_op = 'UPDATE'
     and old.statut is not distinct from new.statut
     and old.payee is not distinct from new.payee
     and old.montant_recu_centimes is not distinct from new.montant_recu_centimes
     and old.mode_paiement is not distinct from new.mode_paiement
     and old.recu_cheque_centimes is not distinct from new.recu_cheque_centimes
     and old.recu_especes_centimes is not distinct from new.recu_especes_centimes then
    return null;
  end if;

  -- On repart de zéro pour cette commande (nouvel appui, livraison annulée…)
  delete from public.mouvements_compte where commande_id = new.id;

  if new.statut = 'livree' then
    select coalesce(sum(l.quantite * l.prix_unitaire_centimes), 0) into v_total
    from public.lignes_commande l where l.commande_id = new.id;
    if v_total > 0 then
      insert into public.mouvements_compte (client_id, commande_id, montant_centimes, motif, par)
      values (new.client_id, new.id, v_total, 'livraison', (select auth.uid()));
    end if;

    if coalesce(new.payee, true) then
      if new.recu_cheque_centimes is not null or new.recu_especes_centimes is not null then
        -- Reçu en chèque et/ou en espèces : un paiement par mode ; la différence reste sur le compte
        if coalesce(new.recu_cheque_centimes, 0) > 0 then
          insert into public.mouvements_compte (client_id, commande_id, montant_centimes, motif, mode_paiement, par)
          values (new.client_id, new.id, -new.recu_cheque_centimes, 'paiement', 'cheque', (select auth.uid()));
        end if;
        if coalesce(new.recu_especes_centimes, 0) > 0 then
          insert into public.mouvements_compte (client_id, commande_id, montant_centimes, motif, mode_paiement, par)
          values (new.client_id, new.id, -new.recu_especes_centimes, 'paiement', 'especes', (select auth.uid()));
        end if;
      elsif new.montant_recu_centimes is not null then
        -- Livraisons notées avant les deux lignes : montant et mode uniques
        if new.montant_recu_centimes > 0 then
          insert into public.mouvements_compte (client_id, commande_id, montant_centimes, motif, mode_paiement, par)
          values (new.client_id, new.id, -new.montant_recu_centimes, 'paiement',
                  case when new.mode_paiement in ('especes', 'cheque') then new.mode_paiement end, (select auth.uid()));
        end if;
      else
        -- Sans montant saisi : le client règle tout ce qu'il doit
        select coalesce(sum(montant_centimes), 0) into v_solde
        from public.mouvements_compte where client_id = new.client_id;
        if v_solde > 0 then
          insert into public.mouvements_compte (client_id, commande_id, montant_centimes, motif, par)
          values (new.client_id, new.id, -v_solde, 'paiement', (select auth.uid()));
        end if;
      end if;
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function prive.preparer_paiement_commande(), prive.compte_apres_livraison() from public, anon;

drop trigger commandes_preparer_paiement on public.commandes;
drop trigger commandes_compte_apres_livraison on public.commandes;
create trigger commandes_preparer_paiement
  before insert or update of statut, payee, montant_recu_centimes, mode_paiement, recu_cheque_centimes, recu_especes_centimes
  on public.commandes
  for each row execute function prive.preparer_paiement_commande();
create trigger commandes_compte_apres_livraison
  after update of statut, payee, montant_recu_centimes, mode_paiement, recu_cheque_centimes, recu_especes_centimes
  on public.commandes
  for each row execute function prive.compte_apres_livraison();

-- -----------------------------------------------------------------------------
-- « Livré et payé » avec ce qui est reçu en chèque et en espèces (facultatifs ;
-- tous deux absents : le client règle tout ce qu'il doit)
-- -----------------------------------------------------------------------------
create function prive.marquer_livraison_paiements(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null,
  p_payee boolean default true,
  p_cheque_centimes integer default null,
  p_especes_centimes integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statut public.statut_commande;
  v_payee boolean := p_livree and coalesce(p_payee, true);
  v_saisi boolean := v_payee and (p_cheque_centimes is not null or p_especes_centimes is not null);
  v_cheque integer := case when v_saisi then coalesce(p_cheque_centimes, 0) end;
  v_especes integer := case when v_saisi then coalesce(p_especes_centimes, 0) end;
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if v_saisi and (v_cheque not between 0 and 1000000 or v_especes not between 0 and 1000000
                  or v_cheque + v_especes > 1000000) then
    raise exception 'Montant reçu invalide.' using errcode = 'PN054';
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
      end,
      payee = case when p_livree then coalesce(p_payee, true) else null end,
      recu_cheque_centimes = v_cheque,
      recu_especes_centimes = v_especes,
      montant_recu_centimes = v_cheque + v_especes,
      mode_paiement = case
        when v_cheque > 0 and v_especes > 0 then 'mixte'
        when v_cheque > 0 then 'cheque'
        when v_especes > 0 then 'especes'
      end
  where id = p_commande_id;
end;
$$;

create function public.marquer_livraison_paiements(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null,
  p_payee boolean default true,
  p_cheque_centimes integer default null,
  p_especes_centimes integer default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform prive.marquer_livraison_paiements(p_commande_id, p_livree, p_livree_le, p_payee, p_cheque_centimes, p_especes_centimes);
end;
$$;

-- L'ancienne forme (un montant, un mode) passe par la nouvelle
create or replace function prive.marquer_livraison(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null,
  p_payee boolean default true,
  p_montant_recu_centimes integer default null,
  p_mode_paiement text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payee boolean := p_livree and coalesce(p_payee, true);
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if v_payee and p_montant_recu_centimes is not null then
    if p_montant_recu_centimes not between 0 and 1000000 then
      raise exception 'Montant reçu invalide.' using errcode = 'PN054';
    end if;
    if p_montant_recu_centimes > 0 and coalesce(p_mode_paiement, '') not in ('especes', 'cheque') then
      raise exception 'Choisissez espèces ou chèque.' using errcode = 'PN054';
    end if;
  end if;

  perform prive.marquer_livraison_paiements(
    p_commande_id, p_livree, p_livree_le, p_payee,
    case when p_mode_paiement = 'cheque' then p_montant_recu_centimes end,
    case when p_montant_recu_centimes is not null and p_mode_paiement is distinct from 'cheque' then p_montant_recu_centimes end
  );
end;
$$;

revoke execute on function
  prive.marquer_livraison_paiements(uuid, boolean, timestamptz, boolean, integer, integer),
  public.marquer_livraison_paiements(uuid, boolean, timestamptz, boolean, integer, integer)
from public, anon;

grant execute on function
  prive.marquer_livraison_paiements(uuid, boolean, timestamptz, boolean, integer, integer),
  public.marquer_livraison_paiements(uuid, boolean, timestamptz, boolean, integer, integer)
to authenticated;
