-- =============================================================================
-- Codes de parrainage : 2 premières lettres du prénom + 2 premières lettres du
-- nom + 4 derniers chiffres du téléphone. Evan Capel, 06 35 16 96 16 → EVCA9616
-- (affiché « EVCA 9616 »). Sans prénom, les 4 lettres viennent du nom ; sans
-- téléphone, pas de code. Deux codes identiques : le second reçoit un chiffre
-- (EVCA96162).
-- Le filleul saisit le code à son inscription : la base dit s'il est valide,
-- sans dévoiler à qui il appartient ; l'équipe retrouve le parrain à la validation.
-- =============================================================================

-- Lettres A-Z seulement, sans accents
create function prive.lettres_code(p_texte text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(upper(coalesce(p_texte, '')),
              'ÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸÆŒ',
              'AAAAAACEEEEIIIINOOOOOUUUUYYAO'),
    '[^A-Z]', '', 'g');
$$;

-- Code de base, sans le chiffre ajouté en cas de doublon (null sans téléphone)
create function prive.code_parrainage_base(p_prenom text, p_nom text, p_telephone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_prenom text := prive.lettres_code(p_prenom);
  v_nom text := prive.lettres_code(p_nom);
  v_chiffres text := regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g');
  v_lettres text;
begin
  if length(v_chiffres) < 4 then
    return null;
  end if;
  v_lettres := case
    when length(v_prenom) >= 2 and length(v_nom) >= 2 then left(v_prenom, 2) || left(v_nom, 2)
    else left(v_prenom || v_nom, 4)
  end;
  if length(v_lettres) < 4 then
    v_lettres := rpad(v_lettres, 4, 'X');
  end if;
  return v_lettres || right(v_chiffres, 4);
end;
$$;

-- Ce que tape le filleul : « evca 9616 », « EVCA-9616 » → « EVCA9616 »
create function prive.normaliser_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
$$;

alter table public.clients add column code_parrainage text;
create unique index clients_code_parrainage_idx on public.clients (code_parrainage);

-- Calcul à la création et quand le prénom, le nom ou le téléphone change
create function prive.attribuer_code_parrainage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := prive.code_parrainage_base(new.prenom, new.nom, new.telephone);
  v_code text;
  v_n int := 1;
begin
  if v_base is null then
    new.code_parrainage := null;
    return new;
  end if;
  -- Même base qu'avant : le code ne change pas
  if tg_op = 'UPDATE' and old.code_parrainage is not null
     and (old.code_parrainage = v_base or old.code_parrainage ~ ('^' || v_base || '[0-9]+$')) then
    new.code_parrainage := old.code_parrainage;
    return new;
  end if;
  v_code := v_base;
  while exists (select 1 from public.clients c where c.code_parrainage = v_code and c.id <> new.id) loop
    v_n := v_n + 1;
    v_code := v_base || v_n;
  end loop;
  new.code_parrainage := v_code;
  return new;
end;
$$;

revoke execute on function prive.attribuer_code_parrainage() from public, anon;

create trigger clients_code_parrainage
  before insert or update of prenom, nom, telephone on public.clients
  for each row execute function prive.attribuer_code_parrainage();

-- Codes des clients existants (les plus anciens d'abord)
do $$
declare
  v_c record;
begin
  for v_c in select id from public.clients order by created_at, id loop
    update public.clients set telephone = telephone where id = v_c.id;
  end loop;
end;
$$;

-- Le code tapé par un filleul est-il celui d'un client actif ? (oui / non, rien d'autre)
create function prive.verifier_code_parrainage(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := prive.normaliser_code(p_code);
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion nécessaire.' using errcode = '42501';
  end if;
  if length(v_code) < 8 or length(v_code) > 12 then
    return false;
  end if;
  return exists (select 1 from public.clients c where c.code_parrainage = v_code and c.actif);
end;
$$;

create function public.verifier_code_parrainage(p_code text)
returns boolean language plpgsql stable security invoker set search_path = ''
as $$ begin return prive.verifier_code_parrainage(p_code); end; $$;

revoke execute on function
  prive.lettres_code(text),
  prive.code_parrainage_base(text, text, text),
  prive.normaliser_code(text),
  prive.verifier_code_parrainage(text),
  public.verifier_code_parrainage(text)
from public, anon;

grant execute on function
  prive.lettres_code(text),
  prive.code_parrainage_base(text, text, text),
  prive.normaliser_code(text),
  prive.verifier_code_parrainage(text),
  public.verifier_code_parrainage(text)
to authenticated;
