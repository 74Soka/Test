-- =============================================================================
-- Inscription : « Comment nous avez-vous connu ? » (facultatif), sous le code
-- de parrainage. Le client le précise lui-même sur son inscription en attente.
-- =============================================================================

alter table public.inscriptions
  add column connu_par text check (length(connu_par) <= 100);

create function prive.preciser_connu_par(p_texte text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion nécessaire.' using errcode = '42501';
  end if;
  update public.inscriptions
  set connu_par = nullif(left(btrim(coalesce(p_texte, '')), 100), '')
  where user_id = (select auth.uid()) and statut = 'en_attente';
end;
$$;

create function public.preciser_connu_par(p_texte text)
returns void language plpgsql volatile security invoker set search_path = ''
as $$ begin perform prive.preciser_connu_par(p_texte); end; $$;

revoke execute on function prive.preciser_connu_par(text), public.preciser_connu_par(text) from public, anon;
grant execute on function prive.preciser_connu_par(text), public.preciser_connu_par(text) to authenticated;
