/**
 * ─── Gmail OAuth Callback ───
 *
 * Échange le code OAuth Google contre des tokens (access + refresh) et stocke
 * dans la table gmail_accounts. Appelé depuis le frontend après que l'utilisateur
 * autorise l'app sur Google.
 *
 * POST body : { code: string, redirect_uri: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return json({ error: "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not configured" }, 500);
    }

    // Auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);
    const userId = userData.user.id;

    // Parse body
    const { code, redirect_uri } = await req.json();
    if (!code || !redirect_uri) return json({ error: "Missing code or redirect_uri" }, 400);

    // ─── Échange du code contre les tokens ───
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return json({ error: "Token exchange failed", details: err }, 400);
    }

    const tokens = await tokenRes.json();
    // tokens: { access_token, refresh_token, expires_in, scope, token_type, id_token }

    if (!tokens.refresh_token) {
      // L'utilisateur a déjà autorisé l'app — Google ne renvoie pas le refresh_token
      // Il doit révoquer l'accès dans son compte Google puis re-autoriser
      return json({
        error: "no_refresh_token",
        message:
          "Google n'a pas renvoyé de refresh_token. Allez sur https://myaccount.google.com/permissions, " +
          "révoquez l'accès à l'app, puis réessayez la connexion.",
      }, 400);
    }

    // ─── Récupère l'email Google via /userinfo ───
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userInfoRes.ok) {
      return json({ error: "Failed to fetch user info" }, 500);
    }
    const userInfo = await userInfoRes.json();
    const gmailEmail = userInfo.email as string;

    // ─── Upsert dans gmail_accounts ───
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    const { error: upsertErr } = await admin.from("gmail_accounts").upsert(
      {
        user_id: userId,
        email: gmailEmail,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope,
        is_active: true,
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertErr) return json({ error: "DB upsert failed", details: upsertErr.message }, 500);

    return json({ success: true, email: gmailEmail });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
