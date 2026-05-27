-- ─── Apollo.io integration ───
-- Ajoute les colonnes nécessaires pour stocker les données enrichies Apollo
-- sur les prospects (identifiant Apollo, titre, LinkedIn, infos société, etc.)

alter table public.prospects
  add column if not exists apollo_id text,
  add column if not exists title text,
  add column if not exists linkedin_url text,
  add column if not exists website text,
  add column if not exists company_domain text,
  add column if not exists company_size text,
  add column if not exists industry text,
  add column if not exists seniority text,
  add column if not exists location text,
  add column if not exists photo_url text,
  add column if not exists apollo_synced_at timestamptz;

-- Dédup : un même contact Apollo ne peut être ajouté qu'une fois par owner
create unique index if not exists prospects_owner_apollo_uniq
  on public.prospects (owner_id, apollo_id)
  where apollo_id is not null;

-- Index pour retrouver vite les prospects venus d'Apollo
create index if not exists prospects_apollo_id_idx
  on public.prospects (apollo_id)
  where apollo_id is not null;
