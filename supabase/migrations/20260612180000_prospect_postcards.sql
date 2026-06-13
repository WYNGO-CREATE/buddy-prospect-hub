-- ─── Cartes postales physiques (Merci Facteur / La Poste) ─────────────
-- Envoi d'une vraie carte postale au commerce, avec la maquette de son
-- futur site + un QR vers l'aperçu en ligne. Pont physique → digital.

create table if not exists public.prospect_postcards (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null references public.prospects(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,

  -- Destinataire (adresse postale nettoyée)
  recipient_name  text,
  address_line    text,
  postal_code     text,
  city            text,
  country         text not null default 'France',

  -- Contenu
  message         text,                 -- verso (mot perso)
  recto_image_url text,                 -- recto (visuel)
  preview_url     text,                 -- lien aperçu pointé par le QR

  -- Suivi d'envoi
  status          text not null default 'draft' check (status in ('draft','queued','sent','delivered','error')),
  provider        text not null default 'merci_facteur',
  provider_id     text,                 -- id de l'envoi côté Merci Facteur
  error           text,

  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists prospect_postcards_prospect_idx on public.prospect_postcards(prospect_id);
create index if not exists prospect_postcards_owner_idx on public.prospect_postcards(owner_id);

alter table public.prospect_postcards enable row level security;

drop policy if exists "postcards_owner_all" on public.prospect_postcards;
create policy "postcards_owner_all" on public.prospect_postcards
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
