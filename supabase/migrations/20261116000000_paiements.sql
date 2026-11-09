-- =============================================================================
-- Paiement à la livraison et compte de chaque client.
--
-- À la livraison, deux choix :
--   « Livré et payé » : le client règle ce panier et tout ce qu'il devait ;
--   « Livré » (non payé) : le montant du panier s'ajoute à ce qu'il doit, et
--   sera à encaisser avec la prochaine livraison.
-- Le compte est un journal (mouvements_compte) : + = dû par le client,
-- − = réglé (ou avoir). Solde = somme. Annuler une livraison retire ses
-- mouvements. L'équipe peut aussi noter un paiement reçu à part ou corriger.
-- =============================================================================

alter table public.commandes add column payee boolean;
comment on column public.commandes.payee is
  'Livrée et payée (true), livrée sans paiement (false), pas encore livrée (null).';

create table public.mouvements_compte (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  commande_id uuid references public.commandes (id) on delete cascade,
  montant_centimes integer not null check (montant_centimes <> 0),
  motif text not null check (motif in ('livraison', 'paiement', 'ajustement')),
  note text check (length(note) <= 200),
  par uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Les livraisons sont liées à leur commande ; un paiement noté à la main ne l'est pas
  constraint mouvements_compte_livraison check (motif <> 'livraison' or commande_id is not null)
);

create index mouvements_compte_client_idx on public.mouvements_compte (client_id, created_at);
create index mouvements_compte_commande_idx on public.mouvements_compte (commande_id);

alter table public.mouvements_compte enable row level security;

create policy mouvements_compte_lecture_equipe on public.mouvements_compte
  for select to authenticated using ((select prive.est_equipe()));
create policy mouvements_compte_lecture_client on public.mouvements_compte
  for select to authenticated using (client_id = (select prive.mon_client_id()));
-- Saisie à la main par l'administrateur : paiement reçu ou correction, sans commande
create policy mouvements_compte_ajout_admin on public.mouvements_compte
  for insert to authenticated with check (
    (select prive.est_admin()) and motif in ('paiement', 'ajustement') and commande_id is null
  );
create policy mouvements_compte_suppr_admin on public.mouvements_compte
  for delete to authenticated using ((select prive.est_admin()) and commande_id is null);

revoke all on table public.mouvements_compte from anon;
grant select, insert, delete on table public.mouvements_compte to authenticated;

-- Solde de chaque client (vue « invoker » : la RLS ci-dessus s'applique)
create view public.soldes_clients with (security_invoker = true) as
  select client_id, sum(montant_centimes)::integer as solde_centimes
  from public.mouvements_compte
  group by client_id;

grant select on public.soldes_clients to authenticated;
revoke all on public.soldes_clients from anon;

-- -----------------------------------------------------------------------------
-- Le compte suit la commande : à chaque changement de statut ou de paiement
-- -----------------------------------------------------------------------------
create function prive.preparer_paiement_commande()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.statut <> 'livree' then
    new.payee := null;
  end if;
  return new;
end;
$$;

create function prive.compte_apres_livraison()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_solde integer;
begin
  if tg_op = 'UPDATE' and old.statut is not distinct from new.statut and old.payee is not distinct from new.payee then
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

    -- Payé (ou livré sans précision) : le client règle tout ce qu'il doit
    if coalesce(new.payee, true) then
      select coalesce(sum(montant_centimes), 0) into v_solde
      from public.mouvements_compte where client_id = new.client_id;
      if v_solde > 0 then
        insert into public.mouvements_compte (client_id, commande_id, montant_centimes, motif, par)
        values (new.client_id, new.id, -v_solde, 'paiement', (select auth.uid()));
      end if;
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function prive.preparer_paiement_commande(), prive.compte_apres_livraison() from public, anon;

create trigger commandes_preparer_paiement
  before insert or update of statut, payee on public.commandes
  for each row execute function prive.preparer_paiement_commande();

create trigger commandes_compte_apres_livraison
  after update of statut, payee on public.commandes
  for each row execute function prive.compte_apres_livraison();

-- -----------------------------------------------------------------------------
-- « Livré » de la tournée : avec le paiement (vrai par défaut, comme avant)
-- -----------------------------------------------------------------------------
drop function public.marquer_livraison(uuid, boolean, timestamptz);
drop function prive.marquer_livraison(uuid, boolean, timestamptz);

create function prive.marquer_livraison(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null,
  p_payee boolean default true
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
      end,
      payee = case when p_livree then coalesce(p_payee, true) else null end
  where id = p_commande_id;
end;
$$;

create function public.marquer_livraison(
  p_commande_id uuid,
  p_livree boolean,
  p_livree_le timestamptz default null,
  p_payee boolean default true
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform prive.marquer_livraison(p_commande_id, p_livree, p_livree_le, p_payee);
end;
$$;

revoke execute on function
  prive.marquer_livraison(uuid, boolean, timestamptz, boolean),
  public.marquer_livraison(uuid, boolean, timestamptz, boolean)
from public, anon;

grant execute on function
  prive.marquer_livraison(uuid, boolean, timestamptz, boolean),
  public.marquer_livraison(uuid, boolean, timestamptz, boolean)
to authenticated;
