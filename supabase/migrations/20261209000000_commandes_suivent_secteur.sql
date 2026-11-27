-- =============================================================================
-- Changer le secteur d'un client change aussi le jour de ses livraisons à venir
-- (demande du propriétaire) : ex. passé au Secteur 3 (dimanche matin), sa
-- commande du samedi après-midi passe au dimanche de la même semaine.
--
-- Concerne les commandes encore à livrer, d'aujourd'hui ou plus tard, livrées
-- dans le secteur habituel du client (pas celles mises « dans un autre secteur
-- cette fois »). Jamais dans le passé : si le jour du nouveau secteur est déjà
-- passé cette semaine-là, la commande garde sa date. Changer seulement la date
-- d'une commande reste libre.
-- =============================================================================

create function prive.commandes_suivent_secteur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jour smallint;
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  if new.secteur_id is not distinct from old.secteur_id then
    return null;
  end if;
  select s.jour into v_jour from public.secteurs s where s.id = new.secteur_id;
  if v_jour is null then
    return null;
  end if;

  -- Une livraison « autre secteur cette fois » dans le nouveau secteur habituel n'est plus ponctuelle
  update public.commandes
  set secteur_id = null
  where client_id = new.id and statut = 'a_livrer' and secteur_id = new.secteur_id;

  -- Les livraisons habituelles à venir passent au jour du nouveau secteur, même semaine
  update public.commandes co
  set date_livraison = d.nouvelle,
      ordre_tournee = null
  from (
    select c.id, (date_trunc('week', c.date_livraison::timestamp))::date + (v_jour - 1) as nouvelle
    from public.commandes c
    where c.client_id = new.id
      and c.statut = 'a_livrer'
      and c.secteur_id is null
      and c.date_livraison >= v_aujourdhui
  ) d
  where co.id = d.id
    and d.nouvelle <> co.date_livraison
    and d.nouvelle >= v_aujourdhui;

  return null;
end;
$$;

revoke execute on function prive.commandes_suivent_secteur() from public, anon, authenticated;

create trigger clients_commandes_suivent_secteur
  after update of secteur_id on public.clients
  for each row execute function prive.commandes_suivent_secteur();
