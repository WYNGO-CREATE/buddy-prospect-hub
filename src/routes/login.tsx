import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Connexion — Wyngo Workspace" },
      { name: "description", content: "Connectez-vous à votre espace de travail" },
    ],
  }),
});

const schema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  password: z.string().min(6, "6 caractères minimum").max(72),
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [session, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[radial-gradient(ellipse_at_top,_oklch(0.52_0.24_263/0.15),_transparent_60%),radial-gradient(ellipse_at_bottom,_oklch(0.16_0.02_265/0.08),_transparent_60%)] bg-muted/30">
      <Card className="w-full max-w-md border-border/60 shadow-xl">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <BrandLogo size={56} showWordmark={false} />
          </div>
          <div className="text-center space-y-1">
            <CardTitle className="text-2xl">Connexion</CardTitle>
            <CardDescription>Accédez à votre espace Wyngo Workspace</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Connexion…" : "Se connecter"}
            </Button>
            {/* Pas de lien d'inscription publique : les comptes sont créés
                par l'admin (Hugo) qui invite les collaborateurs depuis
                /admin → "Inviter un collaborateur". */}
            <p className="text-xs text-center text-muted-foreground">
              Accès réservé aux collaborateurs invités · contact@wyngo.fr
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
