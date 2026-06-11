-- ─── Wyngo Studio — Sites clients (maquette → site déployé) ────────────
--
-- Backend PARTAGÉ avec Wyngo : un site est rattaché à un prospect (devenu
-- client). Quand un prospect passe "converti" dans Wyngo, on peut créer
-- son site dans Studio. Source de vérité unique → les deux CRM connectés.
--
-- Cycle de vie :
--   draft      → site créé, pas encore en ligne
--   published  → en ligne (sous-domaine Wyngo + éventuel domaine perso)
--   offline    → dépublié
--
-- Hébergement en cascade :
--   1. slug → URL instantanée  (boulangerie-martin.wyngo.site)
--   2. custom_domain → domaine perso du client (via Cloudflare for SaaS)

create table if not exists public.client_sites (
  id              uuid primary key default gen_random_uuid(),
  prospect_id     uuid not null references public.prospects(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  preview_id      uuid references public.prospect_previews(id) on delete set null,

  -- Identité du site
  title           text,
  slug            text unique,                  -- sous-domaine instantané
  custom_domain   text unique,                  -- domaine perso (optionnel)
  domain_status   text check (domain_status in ('none','pending_dns','verifying','live','error')) default 'none',

  -- Contenu publié (snapshot HTML servi en prod)
  html_path       text,                         -- chemin dans le bucket "sites"
  status          text not null default 'draft' check (status in ('draft','published','offline')),
  published_at    timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists client_sites_prospect_idx on public.client_sites(prospect_id);
create index if not exists client_sites_owner_idx on public.client_sites(owner_id);
create index if not exists client_sites_custom_domain_idx on public.client_sites(lower(custom_domain));

alter table public.client_sites enable row level security;

drop policy if exists "client_sites_owner_all" on public.client_sites;
create policy "client_sites_owner_all" on public.client_sites
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Bucket privé pour les HTML publiés (le Worker de service y lit via service_role).
insert into storage.buckets (id, name, public)
values ('sites', 'sites', false)
on conflict (id) do nothing;
