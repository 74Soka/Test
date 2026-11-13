-- =============================================================================
-- Inscription en ligne reliée à une fiche existante : la fiche est complétée
-- avec ce que le client a saisi, sans rien écraser (e-mail, prénom, téléphone,
-- complément, consignes de livraison, code commune) ; et si la fiche n'a pas
-- encore de repère sur la carte, l'adresse localisée par le client est reprise
-- (même code postal seulement).
-- =============================================================================

create or replace function prive.valider_inscription(
  p_user_id uuid,
  p_secteur_id uuid default null,
  p_client_id uuid default null,
  p_parrain_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_i public.inscriptions;
  v_client uuid;
begin
  if not (select prive.est_admin()) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select * into v_i from public.inscriptions where user_id = p_user_id for update;
  if not found then
    raise exception 'Inscription introuvable.' using errcode = 'PN040';
  end if;
  if exists (select 1 from public.comptes_clients where user_id = p_user_id) then
    raise exception 'Ce compte est déjà relié à une fiche client.' using errcode = 'PN041';
  end if;

  if p_client_id is not null then
    if exists (select 1 from public.comptes_clients where client_id = p_client_id) then
      raise exception 'Cette fiche est déjà reliée à un autre compte.' using errcode = 'PN042';
    end if;
    -- Fiche existante : on complète ce qui manque avec ce que le client a saisi
    update public.clients c set
      email = coalesce(c.email, v_i.email),
      prenom = case when btrim(c.prenom) = '' then v_i.prenom else c.prenom end,
      telephone = coalesce(nullif(btrim(c.telephone), ''), v_i.telephone),
      complement_adresse = coalesce(nullif(btrim(c.complement_adresse), ''), v_i.complement_adresse),
      notes_livraison = coalesce(nullif(btrim(c.notes_livraison), ''), v_i.notes_livraison),
      code_insee = coalesce(c.code_insee, v_i.code_insee)
    where c.id = p_client_id
    returning c.id into v_client;
    -- Pas encore de repère sur la carte : on reprend l'adresse localisée par le
    -- client, si elle est dans la même commune (sinon l'équipe vérifie)
    update public.clients c set
      adresse = v_i.adresse,
      code_postal = v_i.code_postal,
      commune = v_i.commune,
      code_insee = coalesce(v_i.code_insee, c.code_insee),
      lat = v_i.lat,
      lng = v_i.lng,
      source_position = 'adresse'
    where c.id = v_client
      and c.lat is null
      and v_i.lat is not null
      and c.code_postal = v_i.code_postal;
    if v_client is null then
      raise exception 'Client introuvable.' using errcode = 'PN011';
    end if;
  else
    if p_secteur_id is null then
      raise exception 'Choisissez le secteur du client.' using errcode = 'PN045';
    end if;
    insert into public.clients (
      nom, prenom, telephone, email, adresse, complement_adresse, code_postal, commune, code_insee,
      lat, lng, source_position, secteur_id, notes_livraison, parrain_id
    ) values (
      v_i.nom, v_i.prenom, v_i.telephone, v_i.email, v_i.adresse, v_i.complement_adresse, v_i.code_postal,
      v_i.commune, v_i.code_insee, v_i.lat, v_i.lng,
      case when v_i.lat is not null then 'adresse'::public.source_position end,
      p_secteur_id, v_i.notes_livraison, p_parrain_id
    )
    returning id into v_client;
  end if;

  insert into public.comptes_clients (user_id, client_id) values (p_user_id, v_client);
  delete from public.inscriptions where user_id = p_user_id;
  return v_client;
end;
$$;
