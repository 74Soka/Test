-- =============================================================================
-- Page publique « Les paniers de la semaine » (fraisetfrancais.fr/paniers),
-- ouverte sans compte : lien envoyé par SMS aux clients.
--
-- Une seule fonction lisible sans compte, qui ne renvoie que des informations
-- publiques : composition des paniers, suppléments proposés et leurs prix,
-- jours de livraison et communes des secteurs, heure limite, message aux
-- clients, début de l'offre de parrainage. Aucune donnée de client.
-- =============================================================================

create function prive.paniers_publics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  -- Comme l'écran Composition : la semaine en cours du lundi au vendredi,
  -- la suivante le week-end (celle qu'on peut encore commander)
  v_base date;
  v_semaine date;
  v_p public.parametres_commandes;
begin
  v_base := (date_trunc('week', v_aujourdhui::timestamp))::date
    + case when extract(isodow from v_aujourdhui) >= 6 then 7 else 0 end;

  select min(semaine) into v_semaine from public.compositions where semaine >= v_base;
  select * into v_p from public.parametres_commandes;

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
    'parrainage_debut', (select f.parrainage_cadeaux_debut from public.parametres_fidelite f)
  );
end;
$$;

create function public.paniers_publics()
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$ begin return prive.paniers_publics(); end; $$;

-- Ouverte sans compte : c'est le but de la page (rien de personnel n'en sort)
revoke execute on function prive.paniers_publics() from public;
revoke execute on function public.paniers_publics() from public;
grant usage on schema prive to anon;
grant execute on function prive.paniers_publics() to anon, authenticated;
grant execute on function public.paniers_publics() to anon, authenticated;
