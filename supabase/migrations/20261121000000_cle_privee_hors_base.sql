-- =============================================================================
-- Clé privée des notifications : rangée dans Netlify (VAPID_CLE_PRIVEE), elle
-- n'a plus à être lisible depuis la base. Ici :
--   * lecture des clés complètes et création : administrateur seulement (un
--     livreur ne peut plus les lire) ;
--   * la clé privée peut être effacée de la base (colonne facultative) : en
--     production, elle l'est une fois la variable Netlify en place.
-- La clé publique reste lisible (elle sert à abonner les téléphones).
-- =============================================================================

alter table prive.cles_push alter column privee drop not null;

create or replace function prive.cles_push()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_admin()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return (select jsonb_build_object('publique', publique, 'privee', privee) from prive.cles_push);
end;
$$;

create or replace function prive.enregistrer_cles_push(p_publique text, p_privee text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select prive.est_admin()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  insert into prive.cles_push (publique, privee) values (p_publique, p_privee)
  on conflict (id) do nothing;
end;
$$;
