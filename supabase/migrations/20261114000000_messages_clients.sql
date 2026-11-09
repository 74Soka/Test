-- =============================================================================
-- Messages libres aux clients (nouveaux produits, information…) : envoyés par
-- un administrateur, n'importe quand, à tous les téléphones abonnés.
-- Historique gardé ici (qui, quand, combien de téléphones atteints).
-- =============================================================================

create table public.messages_clients (
  id uuid primary key default gen_random_uuid(),
  titre text not null check (length(btrim(titre)) between 1 and 60),
  corps text not null check (length(btrim(corps)) between 1 and 200),
  -- Page ouverte quand le client touche la notification
  lien text not null default '/paniers' check (lien in ('/paniers', '/espace', '/espace/commander')),
  envoye_par uuid references auth.users (id) on delete set null default auth.uid(),
  envoye_le timestamptz not null default now(),
  -- Téléphones atteints (rempli après l'envoi)
  telephones integer check (telephones >= 0)
);

create index messages_clients_date_idx on public.messages_clients (envoye_le desc);

alter table public.messages_clients enable row level security;

create policy messages_clients_lecture_admin on public.messages_clients
  for select to authenticated using ((select prive.est_admin()));
create policy messages_clients_ajout_admin on public.messages_clients
  for insert to authenticated with check ((select prive.est_admin()));
create policy messages_clients_modif_admin on public.messages_clients
  for update to authenticated using ((select prive.est_admin())) with check ((select prive.est_admin()));

revoke all on table public.messages_clients from anon;
grant select, insert, update on table public.messages_clients to authenticated;
