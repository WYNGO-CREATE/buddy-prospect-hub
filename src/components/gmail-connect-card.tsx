import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, AlertCircle, RefreshCw, Unplug, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function GmailConnectCard() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: account, isLoading } = useQuery({
    queryKey: ["my-gmail-account"],
    queryFn: async () => {
      const { data } = await supabase.from("gmail_accounts").select("*").maybeSingle();
      return data;
    },
  });

  // Gère le retour de l'OAuth Google (code dans l'URL)
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (code && state === "gmail_oauth") {
      handleOAuthCallback(code);
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      url.searchParams.delete("scope");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function handleOAuthCallback(code: string) {
    toast.loading("Connexion à Gmail…", { id: "gmail-oauth" });
    const redirect_uri = `${window.location.origin}/profil`;
    const { data, error } = await supabase.functions.invoke("gmail-oauth-callback", {
      body: { code, redirect_uri },
    });
    if (error || data?.error) {
      toast.error(data?.message || data?.error || error?.message || "Erreur de connexion", { id: "gmail-oauth" });
      return;
    }
    toast.success(`Gmail connecté (${data.email})`, { id: "gmail-oauth" });
    qc.invalidateQueries({ queryKey: ["my-gmail-account"] });
    // Lance une première sync auto
    setTimeout(() => triggerSync(), 500);
  }

  function startOAuth() {
    const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      toast.error("VITE_GOOGLE_OAUTH_CLIENT_ID manquant dans la config. Ajoutez-le dans les secrets Lovable.");
      return;
    }
    const redirect_uri = `${window.location.origin}/profil`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",  // force l'affichage du consentement → garantit le refresh_token
      state: "gmail_oauth",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async function triggerSync() {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("gmail-sync");
    setSyncing(false);
    if (error) {
      toast.error("Erreur de sync : " + error.message);
      return;
    }
    const result = data?.results?.[0];
    if (result?.error) {
      toast.error("Sync échouée : " + result.error);
    } else if (result) {
      toast.success(`Sync ok · ${result.imported} importés, ${result.skipped} ignorés`);
    }
    qc.invalidateQueries({ queryKey: ["my-gmail-account"] });
    qc.invalidateQueries({ queryKey: ["inbox-messages"] });
    qc.invalidateQueries({ queryKey: ["inbox-unread"] });
  }

  const disconnect = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("gmail_accounts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compte Gmail déconnecté");
      qc.invalidateQueries({ queryKey: ["my-gmail-account"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" /> Synchronisation Gmail
        </CardTitle>
        <CardDescription>
          Importez et envoyez vos emails depuis l'Inbox CRM. Seuls les emails échangés avec des prospects connus
          sont synchronisés.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {account ? (
          <>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">Connecté à <span className="text-emerald-700 dark:text-emerald-400">{account.email}</span></p>
                {account.last_sync_at && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Dernière synchronisation : {formatDistanceToNow(new Date(account.last_sync_at), { addSuffix: true, locale: fr })}
                  </p>
                )}
                {!account.last_sync_at && (
                  <p className="text-xs text-muted-foreground mt-0.5">Aucune sync effectuée — cliquez sur "Synchroniser maintenant"</p>
                )}
              </div>
            </div>

            {account.sync_error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200 flex-1">
                  <p className="font-medium">Erreur de synchronisation</p>
                  <p className="text-xs mt-0.5">{account.sync_error}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={triggerSync} disabled={syncing} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Synchronisation…" : "Synchroniser maintenant"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                <Unplug className="h-4 w-4 mr-1.5" />
                Déconnecter
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              La synchronisation automatique tourne toutes les 5 minutes côté serveur.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Connectez votre compte Gmail pour que vos échanges avec vos prospects apparaissent automatiquement
              dans votre Inbox. Vous pourrez aussi envoyer des emails directement depuis le CRM.
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Lecture des emails échangés avec vos prospects</p>
              <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Envoi depuis votre adresse Gmail</p>
              <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Aucun email parasite (option stricte : seuls les prospects connus)</p>
            </div>
            <Button onClick={startOAuth} className="w-full sm:w-auto">
              <Mail className="h-4 w-4 mr-2" />
              Connecter Gmail
              <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
