/**
 * ─── /signup — Inscription DÉSACTIVÉE ─────────────────────────────────────
 *
 * Wyngo Workspace est un outil interne fermé. Les comptes ne se créent pas
 * publiquement : l'admin (Hugo) invite chaque collaborateur via
 * /admin → "Inviter un collaborateur" (qui appelle l'edge function
 * invite-collaborator, génère un magic link + crée le profil + assigne le
 * rôle).
 *
 * Cette route renvoie une page "Accès restreint" et propose un retour
 * vers /login. On garde le fichier (au lieu de le supprimer) pour que
 * d'éventuels anciens liens vers /signup ne mènent pas à une 404 et que
 * le message soit clair pour qui tomberait dessus.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { Mail, Lock } from "lucide-react";

export const Route = createFileRoute("/signup")({
  component: SignupClosed,
  head: () => ({
    meta: [{ title: "Inscription fermée — Wyngo Workspace" }],
  }),
});

function SignupClosed() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <BrandLogo />
          </div>
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <CardTitle>Accès réservé</CardTitle>
          <CardDescription>
            Wyngo Workspace est un outil interne fermé.
            L'inscription publique est désactivée.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="mb-2">Pour obtenir un accès collaborateur :</p>
            <a
              href="mailto:contact@wyngo.fr?subject=Demande%20d'acc%C3%A8s%20Wyngo%20Workspace"
              className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline"
            >
              <Mail className="w-4 h-4" />
              contact@wyngo.fr
            </a>
          </div>
          <Button asChild className="w-full">
            <Link to="/login">Retour à la connexion</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
