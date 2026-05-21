/**
 * ─── Route publique dédiée au callback OAuth Gmail ───
 *
 * Google redirige ici après autorisation. On échange le code
 * via l'edge function, puis on redirige vers /profil.
 *
 * Cette route est PUBLIQUE (pas sous _authenticated) pour éviter
 * les conflits de routing pendant le retour de Google.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/gmail-callback")({
  component: GmailCallbackPage,
  head: () => ({
    meta: [{ title: "Connexion Gmail — Wyngo Workspace" }],
  }),
});

type State = "processing" | "success" | "error";

function GmailCallbackPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("processing");
  const [message, setMessage] = useState("Initialisation…");
  const [debug, setDebug] = useState<string[]>([]);

  const log = (msg: string) => {
    console.log("[Gmail Callback]", msg);
    setDebug((d) => [...d, `${new Date().toLocaleTimeString()} — ${msg}`]);
  };

  useEffect(() => {
    (async () => {
      log("Composant monté");
      const url = new URL(window.location.href);
      log(`URL : ${url.pathname}${url.search}`);

      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        log(`❌ Google a refusé : ${errorParam}`);
        setState("error");
        setMessage(`Google a refusé la connexion : ${errorParam}`);
        return;
      }

      if (!code) {
        log("❌ Aucun code dans l'URL");
        setState("error");
        setMessage("Aucun code OAuth reçu de Google.");
        return;
      }

      if (stateParam !== "gmail_oauth") {
        log(`⚠ State inattendu : "${stateParam}"`);
        setState("error");
        setMessage("État de sécurité invalide. Réessayez.");
        return;
      }

      log(`Code reçu (longueur ${code.length})`);
      setMessage("Échange du code avec Google…");

      // Vérifie session
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        log("❌ Pas de session utilisateur — redirection vers login");
        setState("error");
        setMessage("Session expirée. Reconnectez-vous puis réessayez.");
        setTimeout(() => navigate({ to: "/login" }), 2000);
        return;
      }
      log(`✓ Session OK pour ${sessionData.session.user.email}`);

      const redirect_uri = `${window.location.origin}/auth/gmail-callback`;
      log(`Appel edge function avec redirect_uri=${redirect_uri}`);

      const { data, error } = await supabase.functions.invoke("gmail-oauth-callback", {
        body: { code, redirect_uri },
      });

      log(`Réponse : ${JSON.stringify({ data, error: error?.message }).slice(0, 400)}`);

      if (error || data?.error) {
        const msg = data?.message || data?.error || error?.message || "Erreur inconnue";
        log(`❌ Erreur : ${msg}`);
        setState("error");
        setMessage(msg);
        return;
      }

      log(`✅ Gmail connecté : ${data.email}`);
      setState("success");
      setMessage(`Gmail connecté (${data.email})`);
      toast.success(`Gmail connecté : ${data.email}`);

      // Redirige vers profil après 1.5s
      setTimeout(() => navigate({ to: "/profil" }), 1500);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/20">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {state === "processing" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {state === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            {state === "error" && <AlertCircle className="h-5 w-5 text-amber-600" />}
            Connexion Gmail
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{message}</p>

          {state === "success" && (
            <p className="text-xs text-muted-foreground">Redirection vers votre profil…</p>
          )}

          {state === "error" && (
            <Button onClick={() => navigate({ to: "/profil" })} variant="outline" size="sm">
              Retour au profil
            </Button>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">🔍 Logs ({debug.length})</summary>
            <pre className="mt-2 p-3 rounded bg-muted/50 text-[10px] leading-relaxed overflow-auto max-h-64 font-mono">
              {debug.join("\n")}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
