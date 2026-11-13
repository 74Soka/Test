-- =============================================================================
-- Livraison le jour de la clôture (Secteur V, vendredi après-midi) : elle se
-- clôture le jour même à l'heure de clôture (vendredi 12 h), et non plus une
-- semaine avant. Les autres jours ne changent pas (samedi, dimanche : le
-- vendredi 12 h qui précède).
-- =============================================================================

create or replace function prive.cloture_commandes(p_date date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_date - ((extract(isodow from p_date)::integer - p.cloture_jour + 7) % 7)) + p.cloture_heure)
         at time zone 'Europe/Paris'
  from public.parametres_commandes p;
$$;
