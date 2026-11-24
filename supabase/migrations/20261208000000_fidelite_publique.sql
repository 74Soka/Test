-- =============================================================================
-- Page publique « Parrainage et fidélité » (fraisetfrancais.fr/parrainage),
-- sans compte : les règles des graines, le parrainage et les récompenses,
-- lues dans les réglages (toujours à jour). Uniquement des informations
-- publiques : aucun client, aucun compte.
-- =============================================================================

create function prive.fidelite_publique()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'graines_bienvenue', p.tampons_bienvenue,
    'graines_parrainage', p.tampons_parrainage,
    'graines_par_commande_filleul', p.tampons_parrain_par_commande,
    'filleuls_vip', p.filleuls_vip,
    'filleuls_ultra', p.filleuls_ultra,
    'filleuls_livres_seulement', p.filleuls_livres_seulement,
    'cadeaux_debut', p.parrainage_cadeaux_debut,
    'paniers', coalesce((
      select jsonb_agg(jsonb_build_object('nom', a.nom, 'prix_centimes', a.prix_centimes, 'graines', a.tampons)
                       order by a.prix_centimes, a.nom)
      from public.articles a
      where a.actif and a.categorie = 'panier' and a.tampons > 0
    ), '[]'::jsonb),
    'recompenses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nom', r.nom, 'description', r.description, 'graines', r.cout_tampons,
               'niveau', r.niveau, 'type', r.type)
             order by r.ordre, r.cout_tampons)
      from public.recompenses r
      where r.actif
    ), '[]'::jsonb)
  )
  from public.parametres_fidelite p;
$$;

create function public.fidelite_publique()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select prive.fidelite_publique(); $$;

revoke execute on function prive.fidelite_publique(), public.fidelite_publique() from public, anon, authenticated;
grant execute on function prive.fidelite_publique(), public.fidelite_publique() to anon, authenticated;
