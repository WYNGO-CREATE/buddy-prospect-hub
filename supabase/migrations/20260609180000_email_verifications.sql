-- ─── Cache de vérification d'emails (mutualisé entre tous les users) ───
--
-- Stocke le résultat des vérifications Captain Verify pour économiser des
-- crédits API. Chaque email vérifié est partagé entre tous les utilisateurs
-- Wyngo pendant 30 jours (TTL). Au-delà, on re-vérifie automatiquement
-- (les emails meurent : salariés qui partent, domaines abandonnés, etc.).
--
-- Statuts normalisés (depuis Captain Verify) :
--   valid    : email existe et accepte le mail
--   risky    : catch-all ou role-based (contact@, info@…) — envoi à risque
--   invalid  : email n'existe pas, ne pas envoyer
--   unknown  : le serveur refuse de répondre, on ne sait pas

create table if not exists public.email_verifications (
  email            text primary key,
  status           text not null check (status in ('valid','risky','invalid','unknown')),
  provider         text not null default 'captain_verify',
  raw_result       text,                     -- réponse brute du provider (debug)
  details          jsonb,                    -- payload complet pour audit
  verified_at      timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '30 days')
);

create index if not exists email_verifications_expires_idx
  on public.email_verifications (expires_at);

-- ─── RLS ────────────────────────────────────────────────────────────
-- Lecture autorisée à tous les users authentifiés (cache mutualisé).
-- Écriture uniquement via edge function (service_role), donc on n'expose
-- pas de policy d'insert/update au client.

alter table public.email_verifications enable row level security;

drop policy if exists "email_verifications_read_all" on public.email_verifications;
create policy "email_verifications_read_all"
  on public.email_verifications
  for select
  to authenticated
  using (true);
