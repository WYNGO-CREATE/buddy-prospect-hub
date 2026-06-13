-- ─── Captation de leads entrants (formulaire site web / réseaux) ──────
-- Chaque utilisateur a un jeton unique. Un formulaire public à ce jeton
-- crée un prospect "entrant" dans SA base. À mettre sur son site, sa bio,
-- sa signature mail…

alter table public.profiles
  add column if not exists lead_token text unique default replace(gen_random_uuid()::text, '-', '');

-- Backfill pour les profils existants
update public.profiles
  set lead_token = replace(gen_random_uuid()::text, '-', '')
  where lead_token is null;
