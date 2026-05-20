/**
 * ─── Gmail Sync ───
 *
 * Synchronise les emails Gmail vers la table messages.
 * - Appelé manuellement par l'utilisateur (POST avec auth)
 * - OU appelé périodiquement par pg_cron (sans auth — clé service)
 *
 * Logique :
 * 1. Pour chaque gmail_account actif (ou l'utilisateur courant)
 * 2. Refresh le access_token si expiré
 * 3. Récupère les emails depuis le dernier history_id (ou les 30 derniers jours si jamais sync)
 * 4. Pour chaque email : extrait expéditeur/destinataire, matche avec un prospect (option stricte)
 * 5. Si match : INSERT dans messages
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Helpers Gmail API ───
async function refreshAccessToken(refresh_token: string): Promise<{ access_token: string; expires_in: number }> {
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

async function gmailFetch(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

function extractEmail(addrHeader: string | undefined): string | null {
  if (!addrHeader) return null;
  // "Nom <email@x.com>" ou "email@x.com"
  const m = addrHeader.match(/<([^>]+)>/) || addrHeader.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
  return m ? m[1].toLowerCase().trim() : null;
}

function decodeBase64Url(data: string): string {
  try {
    return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "";
  }
}

// Extrait le contenu texte d'un message Gmail
function getMessageContent(payload: any): string {
  if (!payload) return "";
  // Préférence : text/plain, sinon text/html (strip tags simple)
  if (payload.body?.data && payload.mimeType?.startsWith("text/")) {
    let text = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      text = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    }
    return text;
  }
  if (Array.isArray(payload.parts)) {
    // Préfère text/plain
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain) return getMessageContent(plain);
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (html) return getMessageContent(html);
    for (const p of payload.parts) {
      const r = getMessageContent(p);
      if (r) return r;
    }
  }
  return "";
}

// ─── Sync un compte Gmail ───
async function syncAccount(admin: any, account: any) {
  let access_token = account.access_token;
  const expiresAt = new Date(account.expires_at).getTime();

  // Refresh si expiré (ou dans moins de 60s)
  if (expiresAt - Date.now() < 60_000) {
    const refreshed = await refreshAccessToken(account.refresh_token);
    access_token = refreshed.access_token;
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await admin
      .from("gmail_accounts")
      .update({ access_token, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
      .eq("id", account.id);
  }

  let messagesToProcess: string[] = [];
  let newHistoryId: string | null = null;

  if (account.last_history_id) {
    // Sync incrémental depuis le dernier historyId
    try {
      const hist = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${account.last_history_id}&historyTypes=messageAdded`,
        access_token,
      );
      newHistoryId = hist.historyId || account.last_history_id;
      for (const entry of hist.history || []) {
        for (const ma of entry.messagesAdded || []) {
          if (ma.message?.id) messagesToProcess.push(ma.message.id);
        }
      }
    } catch (e) {
      // history peut expirer → fallback full sync sur 30j
      console.warn("History expired, falling back to list:", String(e));
    }
  }

  if (messagesToProcess.length === 0 && !account.last_history_id) {
    // Première sync : 30 derniers jours
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10).replace(/-/g, "/");
    const list = await gmailFetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=after:${cutoffDate}&maxResults=100`,
      access_token,
    );
    messagesToProcess = (list.messages || []).map((m: any) => m.id);
    // Récupère le historyId courant via profile
    const profile = await gmailFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", access_token);
    newHistoryId = profile.historyId;
  }

  // Limite : 50 messages par sync pour éviter timeout
  messagesToProcess = messagesToProcess.slice(0, 50);

  let imported = 0;
  let skipped = 0;

  for (const msgId of messagesToProcess) {
    try {
      // Skip si déjà importé
      const { data: existing } = await admin
        .from("messages")
        .select("id")
        .eq("owner_id", account.user_id)
        .eq("external_id", msgId)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      // Fetch le message complet
      const msg = await gmailFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        access_token,
      );

      const headers = (msg.payload?.headers || []).reduce((acc: any, h: any) => {
        acc[h.name.toLowerCase()] = h.value;
        return acc;
      }, {});

      const fromEmail = extractEmail(headers["from"]);
      const toEmail = extractEmail(headers["to"]);
      const subject = headers["subject"] || null;
      const dateStr = headers["date"];
      const occurredAt = dateStr ? new Date(dateStr).toISOString() : new Date(parseInt(msg.internalDate || "0")).toISOString();

      // Direction : si on est l'expéditeur, outbound. Sinon inbound.
      const isOutbound = fromEmail === account.email.toLowerCase();
      const matchEmail = isOutbound ? toEmail : fromEmail;

      if (!matchEmail) { skipped++; continue; }

      // Option STRICTE : matche uniquement les prospects existants
      const { data: prospectId } = await admin
        .rpc("find_prospect_by_email", { p_email: matchEmail, p_owner_id: account.user_id });

      if (!prospectId) { skipped++; continue; }

      const content = getMessageContent(msg.payload) || msg.snippet || "";

      const { error: insertErr } = await admin.from("messages").insert({
        prospect_id: prospectId,
        owner_id: account.user_id,
        channel: "email",
        direction: isOutbound ? "outbound" : "inbound",
        subject,
        content: content.slice(0, 50_000), // safety cap
        external_id: msgId,
        thread_id: msg.threadId,
        from_email: fromEmail,
        to_email: toEmail,
        source: "gmail_sync",
        is_read: isOutbound, // les emails envoyés sont "lus" par défaut
        occurred_at: occurredAt,
      });
      if (!insertErr) imported++;
      else skipped++;
    } catch (e) {
      console.error("Sync msg failed", msgId, e);
      skipped++;
    }
  }

  // Update sync state
  await admin
    .from("gmail_accounts")
    .update({
      last_sync_at: new Date().toISOString(),
      last_history_id: newHistoryId || account.last_history_id,
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  return { account_id: account.id, email: account.email, imported, skipped, processed: messagesToProcess.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 2 modes : utilisateur authentifié (sync son propre compte) OU cron (clé secrète)
    const authHeader = req.headers.get("Authorization");
    const cronHeader = req.headers.get("x-cron-secret");

    let targetAccounts: any[] = [];

    if (cronHeader && CRON_SECRET && cronHeader === CRON_SECRET) {
      // Mode cron : tous les comptes actifs
      const { data } = await admin
        .from("gmail_accounts")
        .select("*")
        .eq("is_active", true);
      targetAccounts = data || [];
    } else if (authHeader) {
      // Mode utilisateur : son seul compte
      const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);
      const { data } = await admin
        .from("gmail_accounts")
        .select("*")
        .eq("user_id", userData.user.id)
        .eq("is_active", true);
      targetAccounts = data || [];
    } else {
      return json({ error: "Auth or cron secret required" }, 401);
    }

    const results = [];
    for (const account of targetAccounts) {
      try {
        const r = await syncAccount(admin, account);
        results.push(r);
      } catch (e) {
        const msg = String(e);
        await admin
          .from("gmail_accounts")
          .update({ sync_error: msg, updated_at: new Date().toISOString() })
          .eq("id", account.id);
        results.push({ account_id: account.id, email: account.email, error: msg });
      }
    }

    return json({ success: true, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
