-- ─── Wyngo Studio — HTML de travail éditable du site ──────────────────
-- Copie de travail du site (issue de la maquette, puis modifiée via l'IA
-- de l'éditeur Studio). Servie en prod plus tard.

alter table public.client_sites
  add column if not exists html text;
