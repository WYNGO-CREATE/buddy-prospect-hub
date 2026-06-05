-- ╭─────────────────────────────────────────────────────────────────────────╮
-- │ Feature : "Aperçu Instantané"                                            │
-- │                                                                          │
-- │ Pour chaque prospect, on génère un site web preview personnalisé en     │
-- │ ~15s (photos Google Places + IA pour le copy + template par secteur).  │
-- │ On envoie le lien au prospect par SMS, il voit SON site avec SES infos.│
-- ╰─────────────────────────────────────────────────────────────────────────╯

create table if not exists prospect_previews (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  -- Slug court et lisible pour l'URL : "boulangerie-dupont-x7f"
  slug text not null unique,
  -- URL publique du fichier HTML sur Supabase Storage
  html_url text not null,
  -- Snapshot des champs utilisés (debug + regénération sans refetch APIs)
  source_data jsonb not null default '{}'::jsonb,
  -- Secteur deviné (boulangerie/restaurant/coiffure/commerce/service)
  sector text,
  -- Template utilisé (template_artisan, template_resto, etc.)
  template text not null,
  -- IA et modèle utilisés pour le copy
  model text,
  -- Tracking de l'ouverture par le prospect
  opened_at timestamptz,
  view_count integer not null default 0,
  -- Métadonnées
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);

create index if not exists idx_prospect_previews_prospect on prospect_previews(prospect_id);
create index if not exists idx_prospect_previews_slug on prospect_previews(slug);

alter table prospect_previews enable row level security;

-- Lecture : owner du prospect ou admin
create policy "preview_select"
  on prospect_previews for select
  using (
    exists (
      select 1 from prospects p
      where p.id = prospect_previews.prospect_id
        and (p.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
    )
  );

-- Création : owner du prospect uniquement
create policy "preview_insert"
  on prospect_previews for insert
  with check (
    exists (
      select 1 from prospects p
      where p.id = prospect_previews.prospect_id
        and p.owner_id = auth.uid()
    )
  );

-- Update (pour le tracking opened_at / view_count) : tout authentifié OK
-- (le ping vient d'un edge function avec service role, on s'en fout)
create policy "preview_update"
  on prospect_previews for update
  using (auth.uid() is not null);

-- Bucket Storage public pour les HTML générés
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('previews', 'previews', true, 5242880, array['text/html', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = true;

-- Storage policies : lecture publique (le but du jeu), écriture authentifiée
create policy "previews_public_read"
  on storage.objects for select
  using (bucket_id = 'previews');

create policy "previews_authenticated_write"
  on storage.objects for insert
  with check (bucket_id = 'previews' and auth.uid() is not null);

create policy "previews_authenticated_update"
  on storage.objects for update
  using (bucket_id = 'previews' and auth.uid() is not null);
