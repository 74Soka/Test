-- =============================================================================
-- Réveil du site : toutes les 5 minutes de 7 h à 21 h (heure de Paris, été
-- comme hiver), le planificateur appelle /api/reveil pour que le serveur de
-- Netlify ne s'endorme pas pendant la journée. Coût : quelques crédits par mois.
-- Pour l'arrêter : select cron.unschedule('reveil-site');
-- =============================================================================

create function prive.reveiller_site()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_heure int := extract(hour from (now() at time zone 'Europe/Paris'));
begin
  if v_heure < 7 or v_heure >= 21 then
    return;
  end if;
  select url_site into v_url from prive.parametres_robot;
  if v_url is null then
    return;
  end if;
  perform net.http_get(url := v_url || '/api/reveil', timeout_milliseconds := 20000);
end;
$$;

revoke execute on function prive.reveiller_site() from public, anon, authenticated;

-- Absent des bases de test (sans pg_cron ni pg_net) : rien n'est planifié.
-- Le planificateur compte en UTC : 5 h à 20 h couvre 7 h à 21 h à Paris toute
-- l'année, la fonction écarte les heures en trop.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('reveil-site', '*/5 5-20 * * *', 'select prive.reveiller_site()');
  end if;
end;
$$;
