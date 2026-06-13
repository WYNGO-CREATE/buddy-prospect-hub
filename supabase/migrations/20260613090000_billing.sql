-- ─── Facturation — Devis & Factures (Wyngo) ───────────────────────────
-- 3e univers, backend partagé. Conformité FR : numérotation séquentielle,
-- mentions légales, TVA selon régime.

-- ── Réglages de facturation (singleton, infos légales du vendeur) ──────
create table if not exists public.billing_settings (
  id              boolean primary key default true,
  legal_name      text,                 -- raison sociale
  legal_form      text,                 -- micro, EI, SARL, SAS…
  address         text,
  postal_code     text,
  city            text,
  siret           text,
  vat_number      text,                 -- TVA intracom (si assujetti)
  -- Régime TVA : 'franchise' = micro/auto (pas de TVA) · 'normal' = assujetti
  vat_regime      text not null default 'franchise' check (vat_regime in ('franchise','normal')),
  default_vat_rate numeric not null default 20,   -- si régime normal
  iban            text,
  bic             text,
  payment_terms_days int not null default 30,     -- délai de paiement
  late_penalty    text,                 -- texte pénalités de retard
  custom_mentions text,                 -- mentions additionnelles
  logo_url        text,
  email           text,
  phone           text,
  updated_at      timestamptz not null default now(),
  constraint billing_settings_singleton check (id)
);

alter table public.billing_settings enable row level security;
drop policy if exists "billing_settings_rw" on public.billing_settings;
create policy "billing_settings_rw" on public.billing_settings
  for all to authenticated using (true) with check (true);

-- ── Documents (devis & factures) ──────────────────────────────────────
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  type            text not null check (type in ('devis','facture')),
  number          text,                 -- attribué à l'émission (séquentiel)
  prospect_id     uuid references public.prospects(id) on delete set null,

  -- Snapshot client (gelé sur le document)
  client_name     text,
  client_address  text,
  client_postal_code text,
  client_city     text,
  client_siret    text,
  client_email    text,

  status          text not null default 'brouillon'
    check (status in ('brouillon','envoye','accepte','refuse','paye','en_retard','annule')),

  issue_date      date,                 -- date d'émission
  due_date        date,                 -- échéance (facture) / validité (devis)

  -- Lignes : [{ description, quantity, unit_price_ht, vat_rate }]
  lines           jsonb not null default '[]'::jsonb,
  total_ht        numeric not null default 0,
  total_vat       numeric not null default 0,
  total_ttc       numeric not null default 0,

  notes           text,                 -- mot perso / conditions
  converted_from  uuid references public.documents(id) on delete set null, -- devis → facture

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  sent_at         timestamptz,
  paid_at         timestamptz
);

create index if not exists documents_owner_idx on public.documents(owner_id);
create index if not exists documents_prospect_idx on public.documents(prospect_id);
create index if not exists documents_status_idx on public.documents(owner_id, status);

alter table public.documents enable row level security;
drop policy if exists "documents_owner_all" on public.documents;
create policy "documents_owner_all" on public.documents
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ── Numérotation séquentielle continue (obligation légale FR) ──────────
create table if not exists public.document_counters (
  type   text not null,
  year   int  not null,
  last_no int not null default 0,
  primary key (type, year)
);
alter table public.document_counters enable row level security;
-- (écrite uniquement via la fonction SECURITY DEFINER ci-dessous)

create or replace function public.next_document_number(p_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
  prefix text := case when p_type = 'facture' then 'FAC' else 'DEV' end;
begin
  insert into public.document_counters(type, year, last_no)
    values (p_type, y, 1)
  on conflict (type, year) do update set last_no = public.document_counters.last_no + 1
  returning last_no into n;
  return prefix || '-' || y || '-' || lpad(n::text, 4, '0');
end;
$$;

grant execute on function public.next_document_number(text) to authenticated;
