-- =============================================================================
-- Recette de la semaine, saisie avec la composition des paniers et affichée
-- sur la page publique /paniers.
-- Textes « une ligne par ingrédient / par étape », comme la composition.
-- =============================================================================

create table public.recettes (
  semaine date primary key check (extract(isodow from semaine) = 1),
  titre text not null check (length(btrim(titre)) between 1 and 200),
  -- Ex. « 4 personnes · 35 min · Facile »
  infos text check (length(infos) <= 200),
  ingredients text not null check (length(btrim(ingredients)) between 1 and 3000),
  etapes text not null check (length(btrim(etapes)) between 1 and 6000),
  astuce text check (length(astuce) <= 1000),
  updated_at timestamptz not null default now()
);

create trigger recettes_updated_at before update on public.recettes
  for each row execute function public.maj_updated_at();

alter table public.recettes enable row level security;

create policy recettes_lecture_equipe on public.recettes
  for select to authenticated using ((select prive.est_equipe()));
create policy recettes_ajout_admin on public.recettes
  for insert to authenticated with check ((select prive.est_admin()));
create policy recettes_modif_admin on public.recettes
  for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()));
create policy recettes_suppr_admin on public.recettes
  for delete to authenticated using ((select prive.est_admin()));

revoke all on table public.recettes from anon;
grant select, insert, update, delete on table public.recettes to authenticated;

-- La page publique renvoie aussi la recette (informations publiques seulement)
create or replace function prive.paniers_publics()
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
  v_r public.recettes;
begin
  v_base := (date_trunc('week', v_aujourdhui::timestamp))::date
    + case when extract(isodow from v_aujourdhui) >= 6 then 7 else 0 end;

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
