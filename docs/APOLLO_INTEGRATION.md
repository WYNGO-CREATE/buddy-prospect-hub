# Intégration Apollo.io — État & guide

> Mémo de référence pour reprendre l'intégration Apollo. Mis à jour 2026-05-30.

---

## ✅ Phase 1 — livrée (commit `d82ba10`)

**Recherche de prospects Apollo + ajout 1-clic au CRM.**

### Fichiers créés
- `supabase/migrations/20260527100000_apollo_integration.sql`
  - Ajoute sur `prospects` : `apollo_id, title, linkedin_url, website, company_domain, company_size, industry, seniority, location, photo_url, apollo_synced_at`
  - Index unique `(owner_id, apollo_id)` pour dédup
- `supabase/functions/apollo-proxy/index.ts`
  - Edge function unique, dispatch par champ `action` du body
  - Actions : `test`, `search_people`, `enrich_person`
  - Clé Apollo lue dans `Deno.env.get("APOLLO_API_KEY")` — JAMAIS exposée au front
  - Endpoint : `POST https://api.apollo.io/v1/mixed_people/search` (recherche), `POST /v1/people/match` (enrich), `GET /v1/auth/health` (test)
- `src/routes/_authenticated.apollo.tsx`
  - Page `/apollo` : badge connexion en haut, formulaire (titres, lieu, domaine, keywords), résultats paginés, bouton "Ajouter" par personne
  - Dédup côté UI : si `apollo_id` déjà dans la table `prospects`, le bouton devient "Dans le CRM" (disabled)
  - Tous les appels vont via `supabase.functions.invoke("apollo-proxy", ...)`
- `src/components/app-sidebar.tsx` : nouvelle entrée "Apollo" (icône `Target`)

### Décision archi
- **Clé partagée pour tout le CRM** (secret Supabase global, pas par utilisateur). Choix utilisateur le 2026-05-27.

---

## 🔧 Setup à faire (une fois, par l'utilisateur)

### 1. Récupérer la clé Apollo
Apollo → Settings → Integrations → API → "Create New Key" → nommer `Wyngo CRM` → copier.

### 2. Ajouter le secret Supabase
Supabase Dashboard → projet → Edge Functions → onglet "Secrets" → Add new secret :
- Name : `APOLLO_API_KEY` (exactement)
- Value : la clé

### 3. Déployer
```bash
cd ~/Projects/buddy-prospect-hub
supabase functions deploy apollo-proxy --no-verify-jwt
supabase db push
```

### 4. Tester
http://localhost:8080/apollo → badge vert "Connecté à Apollo" attendu.

---

## 🚧 Phases suivantes (pas encore codées)

### Phase 2 — Enrichissement d'un prospect existant
Sur la fiche prospect (`/prospects/$id`) : bouton "Enrichir via Apollo" qui :
- appelle `apollo-proxy` action `enrich_person` avec l'email ou le LinkedIn
- complète les champs manquants (email pro/perso, tél, photo, LinkedIn, taille société…)
- update la row prospect, met `apollo_synced_at = now()`

### Phase 3 — Import en masse
- Lister les "saved searches" Apollo (`GET /v1/saved_searches`)
- Importer une liste entière en arrière-plan (background job ou pagination + boucle)
- Suivi de progression dans l'UI

### Phase 4 — Sync séquences/activités
- Récupérer les emails envoyés via Apollo sequences (`GET /v1/emailer_messages/search`)
- Les pousser dans la table `messages` du CRM avec `channel = "apollo_email"`
- Match auto par email avec un prospect existant

---

## 🧠 Pièges connus / notes pour Claude
- Les types Supabase générés (`src/integrations/supabase/types.ts`) ne connaissent pas encore les nouvelles colonnes Apollo tant que la migration n'a pas tourné + types re-générés. Workaround actuel dans `_authenticated.apollo.tsx` : `(supabase as any)` sur l'insert et le select des colonnes neuves. À nettoyer après `supabase gen types`.
- Apollo plan Pro : OK pour endpoints People Search + People Match. Vérifier quota mensuel (visible dans Apollo → Settings → Plan → Credits used).
- Si erreur "limit exceeded" → revérifier le plan ; le free tier bloque People Search.
- L'edge function est déployée avec `--no-verify-jwt` pour qu'elle accepte les appels même si le JWT a expiré côté client (cohérent avec le reste des functions du projet).
