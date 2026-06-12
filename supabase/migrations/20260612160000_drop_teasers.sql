-- ─── Abandon de la fonctionnalité Téaser vidéo (Higgsfield) ────────────
-- On retire la table inutilisée pour garder une base propre. Le bucket
-- "teasers" (vide) est laissé tel quel (suppression via SQL interdite ;
-- il est inoffensif et ne sert plus).

drop table if exists public.prospect_teasers cascade;
