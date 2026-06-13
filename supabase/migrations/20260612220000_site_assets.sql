-- ─── Bucket public pour les images des sites Studio (photos + logos) ───
-- Les images uploadées dans l'éditeur (vraies photos du commerce, logo)
-- doivent être publiques pour être servies sur le site final.

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- Lecture publique
drop policy if exists "site_assets_public_read" on storage.objects;
create policy "site_assets_public_read" on storage.objects
  for select using (bucket_id = 'site-assets');

-- Upload réservé aux utilisateurs authentifiés
drop policy if exists "site_assets_auth_insert" on storage.objects;
create policy "site_assets_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-assets');
