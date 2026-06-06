-- ╭─────────────────────────────────────────────────────────────────────────╮
-- │ Archivage de collaborateur                                              │
-- │                                                                          │
-- │ Quand un admin retire un collaborateur de l'équipe, on ne supprime PAS  │
-- │ son profile : on le marque comme archivé (archived_at = now()) et on   │
-- │ supprime juste son compte auth (pour qu'il ne puisse plus se connecter).│
-- │                                                                          │
-- │ Avantages :                                                              │
-- │  • Ses prospects gardent SON nom comme propriétaire dans l'historique   │
-- │  • L'équipe peut éviter le double prospecting ("déjà contacté par X")  │
-- │  • Les stats historiques restent cohérentes                             │
-- │  • La table equipe le filtre par défaut (toggle pour les voir)         │
-- ╰─────────────────────────────────────────────────────────────────────────╯

alter table profiles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists idx_profiles_archived on profiles(archived_at)
  where archived_at is not null;
