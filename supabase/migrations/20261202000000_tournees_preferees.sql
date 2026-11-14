-- =============================================================================
-- Ordre préféré des tournées : pour chaque secteur, l'ordre des clients de la
-- dernière tournée organisée par le livreur (« Réorganiser » ou « Optimiser »).
-- Une tournée pas encore organisée reprend cet ordre ; les nouveaux clients y
-- sont insérés là où ils allongent le moins la route (côté site).
-- Chaque nouvel ordre enregistré met la préférence à jour : il fixe l'ordre de
-- ses clients, et les clients absents ce jour-là gardent leur place relative.
-- =============================================================================

create table public.tournees_preferees (
  secteur_id uuid primary key references public.secteurs (id) on delete cascade,
  clients uuid[] not null default '{}',
  mise_a_jour timestamptz not null default now()
);

comment on table public.tournees_preferees is
  'Ordre de passage préféré des clients, par secteur (dernière tournée organisée).';

alter table public.tournees_preferees enable row level security;
create policy tournees_preferees_lecture_equipe on public.tournees_preferees
  for select to authenticated using ((select prive.est_equipe()));
revoke all on table public.tournees_preferees from anon;
grant select on table public.tournees_preferees to authenticated;

-- Fusion : le nouvel ordre d'abord ; chaque ancien client absent du nouvel
-- ordre est replacé juste après son prédécesseur d'avant
create function prive.fusionner_ordre(p_ancien uuid[], p_nouveau uuid[])
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_res uuid[] := coalesce(p_nouveau, '{}');
  v_pos integer;
  i integer;
  j integer;
begin
  for i in 1 .. coalesce(array_length(p_ancien, 1), 0) loop
    continue when p_ancien[i] = any (v_res);
    v_pos := 0;
    for j in reverse i - 1 .. 1 loop
      if p_ancien[j] = any (v_res) then
        v_pos := array_position(v_res, p_ancien[j]);
        exit;
      end if;
    end loop;
    v_res := v_res[1:v_pos] || p_ancien[i] || v_res[v_pos + 1:];
  end loop;
  return v_res;
end;
$$;

create or replace function prive.enregistrer_ordre_tournee(p_commandes uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s record;
begin
  if not (select prive.est_equipe()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update public.commandes c
  set ordre_tournee = o.position - 1
  from unnest(p_commandes) with ordinality as o(id, position)
  where c.id = o.id and c.ordre_tournee is distinct from (o.position - 1)::integer;

  -- Ordre préféré de chaque secteur concerné
  for v_s in
    select coalesce(co.secteur_id, cl.secteur_id) as secteur_id,
           array_agg(co.client_id order by o.position) as clients
    from unnest(p_commandes) with ordinality as o(id, position)
    join public.commandes co on co.id = o.id
    join public.clients cl on cl.id = co.client_id
    group by 1
  loop
    insert into public.tournees_preferees as t (secteur_id, clients)
    values (v_s.secteur_id, v_s.clients)
    on conflict (secteur_id) do update
      set clients = prive.fusionner_ordre(t.clients, excluded.clients), mise_a_jour = now();
  end loop;
end;
$$;

revoke execute on function prive.fusionner_ordre(uuid[], uuid[]) from public, anon, authenticated;

-- Départ : la dernière tournée entièrement organisée de chaque secteur
insert into public.tournees_preferees (secteur_id, clients)
select distinct on (t.secteur_id) t.secteur_id, t.clients
from (
  select coalesce(co.secteur_id, cl.secteur_id) as secteur_id, co.date_livraison,
         array_agg(co.client_id order by co.ordre_tournee) as clients,
         bool_and(co.ordre_tournee is not null) as complete
  from public.commandes co
  join public.clients cl on cl.id = co.client_id
  where co.statut <> 'annulee'
  group by 1, 2
) t
where t.complete
order by t.secteur_id, t.date_livraison desc
on conflict (secteur_id) do nothing;
