-- =============================================================================
-- Droits des livreurs resserrés au strict nécessaire pour livrer.
--
-- Avant : un livreur pouvait lire toutes les tables de l'équipe (toutes les
-- fiches clients, la fidélité, les avis, les comptes…). Maintenant il ne lit
-- que ce que la tournée affiche, et seulement pour les livraisons de la veille
-- aux 7 jours à venir (tous secteurs) : ces commandes, leurs lignes et cadeaux,
-- les fiches de ces clients et leur compte (montant à encaisser).
-- Fidélité, avis, recettes, rappels, annonces, historique : administrateur seul.
-- Les secteurs, le catalogue et les tournées restent lisibles par l'équipe.
-- =============================================================================

create function prive.est_livreur()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profils where id = (select auth.uid()) and role = 'livreur');
$$;

-- Commande d'une tournée en cours ou proche (veille → 7 jours, heure de Paris)
create function prive.commande_en_tournee(p_commande_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.commandes c
    where c.id = p_commande_id
      and c.statut <> 'annulee'
      and c.date_livraison between (now() at time zone 'Europe/Paris')::date - 1
                               and (now() at time zone 'Europe/Paris')::date + 7
  );
$$;

-- Client livré dans une de ces tournées
create function prive.client_en_tournee(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.commandes c
    where c.client_id = p_client_id
      and c.statut <> 'annulee'
      and c.date_livraison between (now() at time zone 'Europe/Paris')::date - 1
                               and (now() at time zone 'Europe/Paris')::date + 7
  );
$$;

revoke execute on function prive.est_livreur(), prive.commande_en_tournee(uuid), prive.client_en_tournee(uuid)
  from public, anon;
grant execute on function prive.est_livreur(), prive.commande_en_tournee(uuid), prive.client_en_tournee(uuid)
  to authenticated;

-- 1. Lectures réservées désormais à l'administrateur
alter policy clients_lecture_equipe on public.clients using ((select prive.est_admin()));
alter policy commandes_lecture_equipe on public.commandes using ((select prive.est_admin()));
alter policy lignes_commande_lecture_equipe on public.lignes_commande using ((select prive.est_admin()));
alter policy recompenses_utilisees_lecture_equipe on public.recompenses_utilisees using ((select prive.est_admin()));
alter policy cadeaux_lecture_equipe on public.cadeaux using ((select prive.est_admin()));
alter policy mouvements_compte_lecture_equipe on public.mouvements_compte using ((select prive.est_admin()));
alter policy notifications_envoyees_lecture_equipe on public.notifications_envoyees using ((select prive.est_admin()));
alter policy tampons_lecture_equipe on public.tampons using ((select prive.est_admin()));
alter policy recompenses_lecture_equipe on public.recompenses using ((select prive.est_admin()));
alter policy parametres_fidelite_lecture_equipe on public.parametres_fidelite using ((select prive.est_admin()));
alter policy recettes_lecture_equipe on public.recettes using ((select prive.est_admin()));
alter policy rappels_envoyes_lecture_equipe on public.rappels_envoyes using ((select prive.est_admin()));
alter policy annonces_composition_lecture_equipe on public.annonces_composition using ((select prive.est_admin()));
alter policy avis_livraison_lecture on public.avis_livraison using (
  (select prive.est_admin())
  or commande_id in (select c.id from public.commandes c where c.client_id = (select prive.mon_client_id()))
);

-- 2. Ce que la tournée affiche, pour les livreurs
create policy commandes_lecture_livreur on public.commandes
  for select to authenticated using ((select prive.est_livreur()) and prive.commande_en_tournee(id));
create policy lignes_commande_lecture_livreur on public.lignes_commande
  for select to authenticated using ((select prive.est_livreur()) and prive.commande_en_tournee(commande_id));
create policy recompenses_utilisees_lecture_livreur on public.recompenses_utilisees
  for select to authenticated using ((select prive.est_livreur()) and prive.commande_en_tournee(commande_id));
create policy cadeaux_lecture_livreur on public.cadeaux
  for select to authenticated using (
    (select prive.est_livreur())
    and utilisation_id in (select ru.id from public.recompenses_utilisees ru where prive.commande_en_tournee(ru.commande_id))
  );
create policy clients_lecture_livreur on public.clients
  for select to authenticated using ((select prive.est_livreur()) and prive.client_en_tournee(id));
create policy mouvements_compte_lecture_livreur on public.mouvements_compte
  for select to authenticated using ((select prive.est_livreur()) and prive.client_en_tournee(client_id));
create policy notifications_envoyees_lecture_livreur on public.notifications_envoyees
  for select to authenticated using ((select prive.est_livreur()) and prive.commande_en_tournee(commande_id));

-- 3. Téléphones abonnés : un livreur ne prévient que les clients de ses tournées ;
--    l'envoi à tous les clients (annonce, message libre) est réservé à l'administrateur
create or replace function prive.abonnements_du_client(p_client_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not ((select prive.est_admin()) or ((select prive.est_livreur()) and prive.client_en_tournee(p_client_id))) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
    select a.endpoint, a.p256dh, a.auth
    from public.abonnements_push a
    join public.comptes_clients cc on cc.user_id = a.user_id
    where cc.client_id = p_client_id;
end;
$$;

create or replace function prive.abonnements_clients_actifs()
returns table (client_id uuid, endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_admin()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
    select c.id, a.endpoint, a.p256dh, a.auth
    from public.abonnements_push a
    join public.comptes_clients cc on cc.user_id = a.user_id
    join public.clients c on c.id = cc.client_id
    where c.actif;
end;
$$;
