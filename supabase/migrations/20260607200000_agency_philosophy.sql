-- ╭─────────────────────────────────────────────────────────────────────────╮
-- │ Philosophie de l'agence (pour les scripts d'appel IA)                  │
-- │                                                                          │
-- │ Ce champ texte libre permet à l'admin d'écrire sa "voix" de vente :    │
-- │ ses convictions, sa posture face aux clients, ce qu'il ne veut JAMAIS  │
-- │ que ses commerciaux fassent, son angle de différenciation, ses          │
-- │ formules-signatures.                                                    │
-- │                                                                          │
-- │ Ce contenu est INJECTÉ dans le prompt système de script-generate, ce   │
-- │ qui rend les scripts générés ULTRA-fidèles à l'identité de l'agence,  │
-- │ pas des scripts génériques de coach télévente.                         │
-- ╰─────────────────────────────────────────────────────────────────────────╯

alter table agency_settings
  add column if not exists philosophy text,
  add column if not exists call_dos text,         -- "Toujours faire" (sens du métier)
  add column if not exists call_donts text;       -- "Ne JAMAIS faire" (rouges Wyngo)
