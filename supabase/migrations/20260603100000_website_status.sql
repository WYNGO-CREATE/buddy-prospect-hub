-- ─── Détecteur de TPE sans site web ───
-- Ajoute un champ qui classifie le statut du site web d'un prospect.
-- Cœur du modèle Wyngo : on cible les TPE sans site (ou avec un vieux site)
-- pour leur vendre la création/refonte d'un site moderne.

-- Statut du site web (text libre pour rester souple)
--   'no_website'  → Pas de site = CIBLE PRIME 🔥
--   'outdated'    → Site obsolète = CIBLE SECONDAIRE 🟡
--   'has_website' → Site OK = à skip
--   'unknown'     → Pas encore vérifié
alter table public.prospects
  add column if not exists website_status text default 'unknown',
  add column if not exists website_checked_at timestamptz,
  add column if not exists website_score int,                    -- 0-100 (qualité du site si présent)
  add column if not exists siret text;                            -- pour dédup contre Pappers

create index if not exists prospects_website_status_idx
  on public.prospects(owner_id, website_status)
  where website_status is not null;

create unique index if not exists prospects_owner_siret_uniq
  on public.prospects(owner_id, siret)
  where siret is not null;
