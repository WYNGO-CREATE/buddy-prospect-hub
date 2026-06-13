-- Nom commercial (marque) du vendeur, en plus de l'identité légale.
alter table public.billing_settings add column if not exists trade_name text;
