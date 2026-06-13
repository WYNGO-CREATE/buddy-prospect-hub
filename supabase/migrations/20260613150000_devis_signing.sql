-- ─── Devis signable en ligne + orchestration + paiement en ligne ──────
-- Le client reçoit un lien, signe « Bon pour accord ». À la signature :
--   1. le devis passe « accepté » (signature + date horodatées)
--   2. une facture brouillon est créée automatiquement (converted_from)
--   3. le prospect passe « converti » → apparaît dans Studio Production
-- Tout s'enchaîne entre les 3 univers, proprement.

alter table public.documents
  add column if not exists share_token         uuid not null default gen_random_uuid(),
  add column if not exists viewed_at           timestamptz,   -- 1re ouverture par le client
  add column if not exists accepted_at         timestamptz,   -- horodatage de la signature
  add column if not exists refused_at          timestamptz,
  add column if not exists signed_by_name      text,          -- nom du signataire
  add column if not exists signer_ip           text,          -- trace (preuve)
  -- Paiement en ligne (Stripe)
  add column if not exists payment_url          text,         -- lien de paiement généré
  add column if not exists payment_provider_id  text,         -- id Stripe (session / payment link)
  add column if not exists payment_enabled      boolean not null default false;

create unique index if not exists documents_share_token_idx on public.documents(share_token);
