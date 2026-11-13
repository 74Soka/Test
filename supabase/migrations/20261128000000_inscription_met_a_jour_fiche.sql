-- =============================================================================
-- Inscription en ligne reliée à une fiche existante : les informations saisies
-- par le client (plus récentes) remplacent celles de la fiche quand elles sont
-- différentes ; ce qu'il a laissé vide garde la valeur de la fiche. Le secteur
-- et le parrain de la fiche ne changent pas.
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
    -- Fiche existante : les informations saisies par le client à l'inscription
    -- sont les plus récentes ; elles remplacent celles de la fiche. Ce qu'il a
    -- laissé vide garde la valeur de la fiche.
    update public.clients c set
      email = v_i.email,
      nom = coalesce(nullif(btrim(v_i.nom), ''), c.nom),
      prenom = coalesce(nullif(btrim(v_i.prenom), ''), c.prenom),
      telephone = coalesce(nullif(btrim(v_i.telephone), ''), c.telephone),
      adresse = coalesce(nullif(btrim(v_i.adresse), ''), c.adresse),
      complement_adresse = coalesce(nullif(btrim(v_i.complement_adresse), ''), c.complement_adresse),
      code_postal = coalesce(v_i.code_postal, c.code_postal),
      commune = coalesce(nullif(btrim(v_i.commune), ''), c.commune),
      code_insee = coalesce(v_i.code_insee, c.code_insee),
      notes_livraison = coalesce(nullif(btrim(v_i.notes_livraison), ''), c.notes_livraison),
      -- Repère : celui de l'adresse localisée par le client ; sans repère
      -- (adresse saisie à la main), on garde l'ancien seulement si l'adresse
      -- n'a pas changé, sinon il sera replacé d'après la nouvelle adresse
      lat = case
        when v_i.lat is not null then v_i.lat
        when lower(btrim(v_i.adresse)) = lower(btrim(c.adresse)) and v_i.code_postal = c.code_postal then c.lat
      end,
      lng = case
        when v_i.lat is not null then v_i.lng
        when lower(btrim(v_i.adresse)) = lower(btrim(c.adresse)) and v_i.code_postal = c.code_postal then c.lng
      end,
      source_position = case
        when v_i.lat is not null then 'adresse'::public.source_position
        when lower(btrim(v_i.adresse)) = lower(btrim(c.adresse)) and v_i.code_postal = c.code_postal then c.source_position
      end
    where c.id = p_client_id
    returning c.id into v_client;
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
