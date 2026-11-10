-- =============================================================================
-- Page publique /paniers : elle change de semaine au même moment que l'espace
-- client, à la clôture des commandes (vendredi 12 h par défaut), et non plus le
-- samedi : jamais le panier d'une semaine qu'on ne peut plus commander.
-- Les semaines passées restent en base (historique), jamais montrées aux clients.
-- =============================================================================

create or replace function prive.paniers_publics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_base date;
  v_semaine date;
  v_p public.parametres_commandes;
  v_r public.recettes;
begin
  -- La semaine de la prochaine livraison encore ouverte aux commandes (comme
  -- l'espace client) : on passe à la semaine suivante dès la clôture (vendredi 12 h)
  select (date_trunc('week', min(prive.prochaine_livraison(s.id))::timestamp))::date into v_base
  from public.secteurs s;
  -- Sans secteur : la semaine en cours du lundi au vendredi, la suivante le week-end
  if v_base is null then
    v_base := (date_trunc('week', v_aujourdhui::timestamp))::date
      + case when extract(isodow from v_aujourdhui) >= 6 then 7 else 0 end;
  end if;

  select min(semaine) into v_semaine from public.compositions where semaine >= v_base;
  select * into v_p from public.parametres_commandes;
  -- Recette de la même semaine que les paniers affichés (ou de la semaine à venir)
  select * into v_r from public.recettes where semaine = coalesce(v_semaine, v_base);

  return jsonb_build_object(
    'semaine', v_semaine,
    'paniers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'nom', a.nom,
        'prix_centimes', a.prix_centimes,
        'contenu', c.contenu
      ) order by a.ordre, a.nom)
      from public.articles a
      left join public.compositions c on c.article_id = a.id and c.semaine = v_semaine
      where a.actif and a.categorie = 'panier'
    ), '[]'::jsonb),
    'supplements', coalesce((
      select jsonb_agg(jsonb_build_object('nom', a.nom, 'prix_centimes', a.prix_centimes) order by a.ordre, a.nom)
      from public.articles a
      where a.actif and a.categorie = 'supplement'
    ), '[]'::jsonb),
    'secteurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nom', s.nom,
        'jour', s.jour,
        'creneau', s.creneau,
        'communes', coalesce((
          select jsonb_agg(sc.nom order by sc.nom)
          from public.secteur_communes sc where sc.secteur_id = s.id
        ), '[]'::jsonb)
      ) order by s.jour, s.creneau, s.nom)
      from public.secteurs s
    ), '[]'::jsonb),
    'commandes_ouvertes', coalesce(v_p.commandes_ouvertes, true),
    'cloture_jour', v_p.cloture_jour,
    'cloture_heure', to_char(v_p.cloture_heure, 'HH24:MI'),
    'message', v_p.message_clients,
    'parrainage_debut', (select f.parrainage_cadeaux_debut from public.parametres_fidelite f),
    'recette', case when v_r.semaine is null then null else jsonb_build_object(
      'titre', v_r.titre,
      'infos', v_r.infos,
      'ingredients', v_r.ingredients,
      'etapes', v_r.etapes,
      'astuce', v_r.astuce
    ) end
  );
end;
$$;
