/**
 * ─── Gmail Send ───
 *
 * Envoie un email depuis le compte Gmail connecté de l'utilisateur.
 *
 * POST body : { prospect_id: string, to: string, subject: string, body: string, in_reply_to?: string, thread_id?: string }
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

async function refreshAccessToken(refresh_token: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh token failed: ${await res.text()}`);
  return await res.json();
}

function encodeBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  body: string;
  in_reply_to?: string;
}): string {
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
    "MIME-Version: 1.0",
    `Content-Type: text/plain; charset="UTF-8"`,
    "Content-Transfer-Encoding: 7bit",
  ];
  if (opts.in_reply_to) {
    headers.push(`In-Reply-To: ${opts.in_reply_to}`);
    headers.push(`References: ${opts.in_reply_to}`);
  }
  return encodeBase64Url(headers.join("\r\n") + "\r\n\r\n" + opts.body);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);
    const userId = userData.user.id;

    const { prospect_id, to, subject, body, in_reply_to, thread_id } = await req.json();
    if (!prospect_id || !to || !body) return json({ error: "Missing fields" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Récupère le compte Gmail de l'user
    const { data: account, error: accErr } = await admin
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (accErr || !account) return json({ error: "Aucun compte Gmail connecté" }, 400);

    // Refresh token si expiré
    let access_token = account.access_token;
    const expiresAt = new Date(account.expires_at).getTime();
    if (expiresAt - Date.now() < 60_000) {
      const refreshed = await refreshAccessToken(account.refresh_token);
      access_token = refreshed.access_token;
      await admin
        .from("gmail_accounts")
        .update({
          access_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    }

    // Build raw email
    const raw = buildRawEmail({
      from: account.email,
      to,
      subject: subject || "",
      body,
      in_reply_to,
    });

    // Send via Gmail API
    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw, threadId: thread_id }),
      },
    );

    if (!sendRes.ok) {
      const err = await sendRes.text();
      return json({ error: "Gmail send failed", details: err }, 400);
    }

    const sent = await sendRes.json();

    // Log dans messages
    const { error: insertErr } = await admin.from("messages").insert({
      prospect_id,
      owner_id: userId,
      channel: "email",
      direction: "outbound",
      subject: subject || null,
      content: body,
      external_id: sent.id,
      thread_id: sent.threadId,
      from_email: account.email,
      to_email: to,
      source: "gmail_send",
      is_read: true,
      occurred_at: new Date().toISOString(),
    });

    if (insertErr) {
      return json({
        success: true,
        warning: "Email envoyé mais non logé en base : " + insertErr.message,
        message_id: sent.id,
      });
    }

    return json({ success: true, message_id: sent.id, thread_id: sent.threadId });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
