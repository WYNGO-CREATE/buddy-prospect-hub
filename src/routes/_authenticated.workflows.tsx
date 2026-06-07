/**
 * /workflows — page DÉSACTIVÉE (commit "remove workflows").
 *
 * Cette feature d'automation séquentielle n'apportait pas de valeur réelle
 * vs le Pitch IA + Aperçu Instantané qui sont déjà ultra-personnalisés.
 * Si quelqu'un atterrit ici via un vieux lien, on redirige vers /prospects.
 *
 * Le code original (séquences email/linkedin/note/wait + branching) est
 * conservé en git history si on veut la rouvrir un jour.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/workflows")({
  beforeLoad: () => {
    throw redirect({ to: "/prospects" });
  },
  component: () => null,
});
