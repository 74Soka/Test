-- =============================================================================
-- « Livré et payé » avec le montant reçu et le mode de paiement (espèces ou
-- chèque), saisis par le livreur.
--
-- Le compte du client reçoit le panier (+) et le montant réellement reçu (−) :
-- s'il a donné moins que ce qu'il devait, le reste s'ajoute à ce qu'il doit ;
-- s'il a donné plus, c'est un avoir. Sans montant saisi (ancien appui, ou
-- l'équipe depuis la commande), « payé » règle tout ce qu'il devait, comme avant.
-- =============================================================================

alter table public.commandes
  add column montant_recu_centimes integer check (montant_recu_centimes between 0 and 1000000),
  add column mode_paiement text check (mode_paiement in ('especes', 'cheque'));
comment on column public.commandes.montant_recu_centimes is
  'Montant reçu à la livraison (« Livré et payé »), null si non saisi.';
comment on column public.commandes.mode_paiement is 'especes ou cheque, avec le montant reçu.';

alter table public.mouvements_compte
  add column mode_paiement text check (mode_paiement in ('especes', 'cheque'));

-- Montant et mode n'ont de sens que pour une commande livrée et payée
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
     and old.mode_paiement is not distinct from new.mode_paiement then
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
      if new.montant_recu_centimes is not null then
        -- Montant réellement reçu : la différence reste sur le compte du client
        if new.montant_recu_centimes > 0 then
          insert into public.mouvements_compte (client_id, commande_id, montant_centimes, motif, mode_paiement, par)
          values (new.client_id, new.id, -new.montant_recu_centimes, 'paiement', new.mode_paiement, (select auth.uid()));
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
  before insert or update of statut, payee, montant_recu_centimes, mode_paiement on public.commandes
  for each row execute function prive.preparer_paiement_commande();
create trigger commandes_compte_apres_livraison
  after update of statut, payee, montant_recu_centimes, mode_paiement on public.commandes
  for each row execute function prive.compte_apres_livraison();

-- -----------------------------------------------------------------------------
-- « Livré et payé » : avec le montant reçu et le mode (facultatifs)
-- -----------------------------------------------------------------------------
drop function public.marquer_livraison(uuid, boolean, timestamptz, boolean);
drop function prive.marquer_livraison(uuid, boolean, timestamptz, boolean);

create function prive.marquer_livraison(
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
  v_statut public.statut_commande;
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
      montant_recu_centimes = case when v_payee then p_montant_recu_centimes end,
      mode_paiement = case when v_payee and coalesce(p_montant_recu_centimes, 0) > 0 then p_mode_paiement end
  where id = p_commande_id;
end;
$$;

create function public.marquer_livraison(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null,
  p_payee boolean default true,
  p_montant_recu_centimes integer default null,
  p_mode_paiement text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform prive.marquer_livraison(p_commande_id, p_livree, p_livree_le, p_payee, p_montant_recu_centimes, p_mode_paiement);
end;
$$;

revoke execute on function
  prive.marquer_livraison(uuid, boolean, timestamptz, boolean, integer, text),
  public.marquer_livraison(uuid, boolean, timestamptz, boolean, integer, text)
from public, anon;

grant execute on function
  prive.marquer_livraison(uuid, boolean, timestamptz, boolean, integer, text),
  public.marquer_livraison(uuid, boolean, timestamptz, boolean, integer, text)
to authenticated;
