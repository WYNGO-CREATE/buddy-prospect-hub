/**
 * ─── inbox-diagnose ──────────────────────────────────────────────────
 *
 * Endpoint debug pour comprendre POURQUOI la sync Gmail ne marche pas.
 * Retourne :
 *   • État du compte Gmail (scope stocké, last_sync_at, sync_error)
 *   • Test live Gmail API (profile + un list rapide) → détecte les erreurs scope
 *   • Compteurs messages (total / inbound / outbound / unattached)
 *
 * Body : aucun
 * Auth : JWT user obligatoire (RLS sur ses propres comptes Gmail)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Auth requise" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "User invalide" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. État du compte Gmail
    const { data: account } = await admin
      .from("gmail_accounts")
      .select("id, email, scope, last_sync_at, last_history_id, sync_error, is_active, expires_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const diagnosis: Record<string, unknown> = {
      user_id: user.id,
      gmail_connected: !!account,
    };

    if (!account) {
      diagnosis.next_step = "Connecter Gmail depuis l'inbox (bouton 'Reconnecter Gmail').";
      return json(diagnosis);
    }

    diagnosis.account = {
      email: account.email,
      scope: account.scope,
      is_active: account.is_active,
      last_sync_at: account.last_sync_at,
      last_history_id: account.last_history_id,
      sync_error: account.sync_error,
      expires_at: account.expires_at,
      updated_at: account.updated_at,
    };

    // 2. Vérifie la présence des scopes critiques
    const scope = account.scope || "";
    const hasReadonly = scope.includes("gmail.readonly");
    const hasSend = scope.includes("gmail.send");
    diagnosis.scopes_present = { readonly: hasReadonly, send: hasSend };

    if (!hasReadonly) {
      diagnosis.next_step = "Le scope 'gmail.readonly' MANQUE — la lecture des emails est impossible. Clique 'Reconnecter Gmail' pour ré-autoriser.";
    }

    // 3. Test live : appel Gmail API profile (vérifie token valide + scope)
    try {
      // Refresh d'abord si proche d'expirer
      let token = account.access_token as string;
      const expMs = new Date(account.expires_at).getTime();
      if (expMs - Date.now() < 60_000 && account.refresh_token) {
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
            client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
            refresh_token: account.refresh_token as string,
            grant_type: "refresh_token",
          }),
        });
        if (r.ok) {
          const refreshed = await r.json();
          token = refreshed.access_token;
          diagnosis.token_refreshed = true;
        } else {
          diagnosis.refresh_error = await r.text();
        }
      }

      const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        diagnosis.gmail_api_test = "OK";
        diagnosis.profile = {
          email: profile.emailAddress,
          messagesTotal: profile.messagesTotal,
          historyId: profile.historyId,
        };
      } else {
        diagnosis.gmail_api_test = "FAIL";
        diagnosis.gmail_api_error = `${profileRes.status}: ${(await profileRes.text()).slice(0, 200)}`;
        if (profileRes.status === 403) {
          diagnosis.next_step = "Erreur 403 Gmail = scope insuffisant. Clique 'Reconnecter Gmail'.";
        }
      }

      // 4. Test list pour voir s'il y a des messages reçus récents
      const listRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:inbox&maxResults=5",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (listRes.ok) {
        const list = await listRes.json();
        diagnosis.inbox_messages_visible = list.resultSizeEstimate ?? (list.messages?.length || 0);
      } else {
        diagnosis.list_error = `${listRes.status}: ${(await listRes.text()).slice(0, 200)}`;
      }
    } catch (e) {
      diagnosis.gmail_api_test = "EXCEPTION";
      diagnosis.gmail_api_error = String(e);
    }

    // 5. Compteurs messages en DB
    const { count: total } = await admin.from("messages")
      .select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    const { count: cIn } = await admin.from("messages")
      .select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("direction", "inbound");
    const { count: cOut } = await admin.from("messages")
      .select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("direction", "outbound");
    const { count: cOrp } = await admin.from("messages")
      .select("id", { count: "exact", head: true }).eq("owner_id", user.id).is("prospect_id", null);

    diagnosis.messages_db_counts = {
      total: total || 0,
      inbound: cIn || 0,
      outbound: cOut || 0,
      unattached: cOrp || 0,
    };

    if (!diagnosis.next_step) {
      if ((cIn || 0) === 0 && (cOut || 0) > 0) {
        diagnosis.next_step = "Tu as des emails envoyés mais 0 reçus en DB. Clique 'Synchroniser Gmail' (la sync v2 importera désormais les reçus).";
      } else if ((cIn || 0) > 0) {
        diagnosis.next_step = "Tout est OK ! Tu devrais voir tes emails reçus dans l'onglet 'Reçus'.";
      } else {
        diagnosis.next_step = "Clique 'Synchroniser Gmail' pour importer tes emails récents.";
      }
    }

    return json(diagnosis);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
