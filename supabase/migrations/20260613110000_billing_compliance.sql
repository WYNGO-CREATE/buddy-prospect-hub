-- ─── Facturation — champs de conformité (guide micro-entreprise EI) ────

-- Vendeur : statut EI + immatriculation RNE
alter table public.billing_settings
  add column if not exists is_ei boolean not null default true,
  add column if not exists rne_registered boolean not null default true;

-- Document : date/période de prestation (obligatoire, distincte de l'émission)
-- + adresse de livraison client (si différente) + flag client professionnel.
alter table public.documents
  add column if not exists service_date_text text,
  add column if not exists client_delivery_address text,
  add column if not exists client_is_pro boolean not null default true;
