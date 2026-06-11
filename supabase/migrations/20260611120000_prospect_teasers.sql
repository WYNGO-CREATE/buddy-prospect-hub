-- ─── Téasers vidéo (Higgsfield) — bande-annonce du commerce/site ───────
--
-- Pour un prospect, on génère un clip cinématique de 5s à partir de sa
-- photo de devanture (Google Places), via l'API Higgsfield DoP. Le job
-- est asynchrone → on stocke l'état + l'id de génération + l'URL finale.

create table if not exists public.prospect_teasers (
  id               uuid primary key default gen_random_uuid(),
  prospect_id      uuid not null references public.prospects(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  status           text not null default 'processing' check (status in ('processing','done','failed')),
  provider         text not null default 'higgsfield',
  generation_id    text,                 -- id du job côté Higgsfield
  source_image_url text,                 -- image animée (devanture ré-hébergée)
  video_url        text,                 -- URL du clip final
  prompt           text,
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists prospect_teasers_prospect_idx on public.prospect_teasers(prospect_id);
create index if not exists prospect_teasers_owner_idx on public.prospect_teasers(owner_id);

alter table public.prospect_teasers enable row level security;

drop policy if exists "teasers_owner_select" on public.prospect_teasers;
create policy "teasers_owner_select" on public.prospect_teasers
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists "teasers_owner_insert" on public.prospect_teasers;
create policy "teasers_owner_insert" on public.prospect_teasers
  for insert to authenticated with check (owner_id = auth.uid());

-- ─── Bucket public pour les images sources + vidéos cachées ──────────
insert into storage.buckets (id, name, public)
values ('teasers', 'teasers', true)
on conflict (id) do nothing;

-- Lecture publique du bucket (les vidéos/images doivent être visibles par
-- le prospect quand on lui envoie le lien).
drop policy if exists "teasers_public_read" on storage.objects;
create policy "teasers_public_read" on storage.objects
  for select using (bucket_id = 'teasers');
