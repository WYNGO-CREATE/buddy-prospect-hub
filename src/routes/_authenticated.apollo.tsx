/**
 * ─── /apollo — page MASQUÉE du menu (mais conservée en git history) ─────
 *
 * Apollo a été retiré du menu latéral car pas utilisé en pratique.
 * L'edge function `apollo-proxy` reste déployée et le code original
 * complet (recherche prospects via API Apollo.io, ajout en 1 clic au
 * CRM, 482 lignes) est conservé en git history pour réactivation future.
 *
 * Si quelqu'un atterrit ici via un vieux lien, on redirige vers /prospects.
 *
 * ═══ POUR RESTAURER LA PAGE COMPLÈTE ═══
 * Récupérer la version d'origine depuis git :
 *   git show d82ba10:src/routes/_authenticated.apollo.tsx > src/routes/_authenticated.apollo.tsx
 *
 * Puis remettre l'item dans la sidebar (src/components/app-sidebar.tsx) :
 *   import { ExternalLink } from "lucide-react";
 *   { title: "Apollo", url: "/apollo", icon: ExternalLink, badge: 0 }
 *
 * Le code utilise l'edge fn `apollo-proxy` (toujours déployée côté Supabase)
 * + la table `prospects` pour la dédup SIREN/email.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/apollo")({
  beforeLoad: () => {
    throw redirect({ to: "/prospects" });
  },
  component: () => null,
});
