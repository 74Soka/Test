-- =============================================================================
-- Secteur ponctuel : une commande peut être livrée, pour cette fois, dans un
-- autre secteur que celui du client (ex. dimanche matin au lieu du samedi).
--
-- commandes.secteur_id : vide = secteur habituel du client. Renseigné, la
-- livraison passe dans ce secteur et sa date suit le jour de ce secteur, dans
-- la même semaine (la règle « une commande par semaine » reste donc vraie,
-- même si le client modifie ensuite sa commande depuis son espace).
-- =============================================================================

alter table public.commandes
  add column secteur_id uuid references public.secteurs (id) on delete set null;

comment on column public.commandes.secteur_id is
  'Secteur de livraison choisi pour cette commande seulement ; vide = secteur du client.';

create index commandes_secteur_idx on public.commandes (secteur_id);

create function prive.aligner_secteur_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour smallint;
begin
  -- Le secteur habituel du client n'est pas un changement ponctuel
  if new.secteur_id is not null
     and new.secteur_id = (select c.secteur_id from public.clients c where c.id = new.client_id) then
    new.secteur_id := null;
  end if;

  if new.secteur_id is not null then
    select s.jour into v_jour from public.secteurs s where s.id = new.secteur_id;
    -- Même semaine (lundi), jour du secteur choisi
    new.date_livraison := (date_trunc('week', new.date_livraison::timestamp))::date + (v_jour - 1);
  end if;

  return new;
end;
$$;

revoke execute on function prive.aligner_secteur_commande() from public, anon;

create trigger commandes_aligner_secteur
  before insert or update of secteur_id, date_livraison, client_id on public.commandes
  for each row execute function prive.aligner_secteur_commande();
