/**
 * ─── /logs — fusionné dans /tableau (Vue équipe) ──────────────────────
 *
 * Le Journal d'activité a été intégré au Tableau de bord. La page /logs
 * existe encore comme redirect pour les anciens liens (favoris, emails,
 * etc.) → on bascule sur /tableau.
 *
 * Le code original (~183 lignes) est conservé en git history si besoin.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/logs")({
  beforeLoad: () => {
    throw redirect({ to: "/tableau" });
  },
  component: () => null,
});
