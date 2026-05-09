# Plateforme CRM interne

Une application web sécurisée où chaque collaborateur gère ses propres prospects, suit ses appels, planifie des relances et visualise ses performances. Un rôle admin supervise l'ensemble de l'équipe.

## Fonctionnalités

### Authentification
- Inscription libre par email + mot de passe (Lovable Cloud)
- Premier compte créé = admin automatiquement, les suivants = collaborateurs
- Page login / signup, déconnexion, route protégée pour tout le reste

### Gestion des prospects
- Liste des prospects (recherche, filtre par statut, tri)
- Création / édition d'un prospect : nom, prénom, société, email, téléphone, source, notes générales
- Statuts : Nouveau, En cours, Intéressé, Converti, Perdu, À relancer (badge coloré)
- Changement de statut rapide depuis la liste ou la fiche

### Fiche prospect
- Coordonnées complètes éditables
- Onglet "Appels / Échanges" : ajouter une note d'appel (date auto, durée, résumé, issue)
- Historique chronologique de tous les échanges et changements de statut
- Bouton "Programmer une relance" : date + heure + motif
- Liste des relances à venir mise en évidence

### Tableau de bord
- Cartes KPI : nombre de prospects, appels effectués, prospects intéressés, prospects convertis
- Vue "Mes chiffres" pour tout le monde
- Vue "Équipe" supplémentaire pour l'admin (totaux + classement par collaborateur)
- Section "Relances à venir" (7 prochains jours)

### Espace admin
- Liste des collaborateurs avec leurs stats
- Possibilité de consulter les prospects de n'importe quel collaborateur

## Structure des pages

```
/login            Connexion
/signup           Inscription
/                 Tableau de bord (perso + équipe si admin)
/prospects        Liste des prospects
/prospects/$id    Fiche prospect (coordonnées, appels, relances, historique)
/relances         Vue dédiée aux relances programmées
/equipe           Admin uniquement : collaborateurs et leurs stats
```

Layout principal avec sidebar (Dashboard, Prospects, Relances, Équipe) + header avec nom utilisateur et déconnexion.

## Détails techniques

**Backend** : Lovable Cloud activé (base de données + auth).

**Tables** :
- `profiles` (id ↔ auth.users, full_name, created_at) — créée auto via trigger au signup
- `user_roles` (user_id, role: 'admin' | 'collaborator') — table séparée + fonction `has_role()` SECURITY DEFINER ; premier inscrit promu admin via trigger
- `prospects` (id, owner_id, first_name, last_name, company, email, phone, source, notes, status, created_at, updated_at)
- `call_logs` (id, prospect_id, owner_id, called_at, duration_minutes, outcome, summary, created_at)
- `follow_ups` (id, prospect_id, owner_id, scheduled_at, reason, completed, created_at)
- `prospect_events` (id, prospect_id, owner_id, event_type, payload jsonb, created_at) — historique unifié (changements de statut, créations, etc.) alimenté par triggers SQL

**RLS** :
- Collaborateur : SELECT/INSERT/UPDATE/DELETE uniquement sur ses lignes (`owner_id = auth.uid()`)
- Admin : SELECT sur toutes les lignes via `has_role(auth.uid(), 'admin')`
- `profiles` lisible par tous les utilisateurs authentifiés (pour afficher noms dans la vue équipe)

**Frontend** : TanStack Start, route `_authenticated` avec `beforeLoad` qui redirige vers `/login`. Layout avec `SidebarProvider`. Lecture des données via `supabase` client direct (RLS gère la sécurité). Validation Zod sur tous les formulaires. Statuts en enum PostgreSQL avec couleurs dans le design system (tokens sémantiques dans `styles.css`).

**Dashboard** : requêtes agrégées côté client (count par statut, count appels du mois). Vue admin = mêmes requêtes sans filtre owner.
