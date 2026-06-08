import { createFileRoute, redirect } from "@tanstack/react-router";

// La page "Prospects froids" a été fusionnée dans le cockpit /relances :
// une section dédiée y liste les prospects sans interaction depuis >30j,
// et le smart-tag "Froid" est affiché automatiquement sur la fiche prospect.
export const Route = createFileRoute("/_authenticated/froids")({
  beforeLoad: () => {
    throw redirect({ to: "/relances" });
  },
  component: () => null,
});
