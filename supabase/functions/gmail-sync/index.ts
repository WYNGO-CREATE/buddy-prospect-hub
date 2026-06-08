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

/**
 * Décode un base64url Gmail en STRING UTF-8 correctement.
 *
 * Bug avant : atob() retourne une "binary string" où chaque octet est traité
 * comme un char latin-1. Les caractères multi-octets UTF-8 (é = 0xC3 0xA9,
 * à = 0xC3 0xA0, etc.) restent split en deux chars distincts qui s'affichent
 * "Ã©" et "Ã ". Catastrophe pour le français.
 *
 * Fix : on prend les octets bruts via atob → Uint8Array → TextDecoder UTF-8.
 */
function decodeBase64Url(data: string): string {
  try {
    const padded = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

/**
 * Nettoie le HTML d'un email :
 *  • supprime <head>, <style>, <script>, <!--...--> (sinon le CSS leak en
 *    plain text dans la liste — "text-decoration:underline; ..." visible)
 *  • convertit <br>, </p>, </div> en saut de ligne
 *  • strip tous les autres tags
 *  • décode les entités HTML usuelles (&eacute;, &amp;, &nbsp;, &#39;...)
 *  • collapse les whitespace excédentaires
 */
function htmlToPlainText(html: string): string {
  let s = html;
  // Vire les blocs entiers qui n'ont rien à faire dans le texte
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // Préserver les sauts de ligne
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<\/div>/gi, "\n");
  s = s.replace(/<\/li>/gi, "\n");
  s = s.replace(/<\/tr>/gi, "\n");
  // Strip tous les tags restants
  s = s.replace(/<[^>]+>/g, "");
  // Décode les entités HTML les plus courantes
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&eacute;/g, "é").replace(/&egrave;/g, "è").replace(/&ecirc;/g, "ê").replace(/&euml;/g, "ë")
    .replace(/&agrave;/g, "à").replace(/&acirc;/g, "â").replace(/&auml;/g, "ä")
    .replace(/&ocirc;/g, "ô").replace(/&ouml;/g, "ö")
    .replace(/&ucirc;/g, "û").replace(/&uuml;/g, "ü").replace(/&ugrave;/g, "ù")
    .replace(/&icirc;/g, "î").replace(/&iuml;/g, "ï")
    .replace(/&ccedil;/g, "ç")
    .replace(/&Eacute;/g, "É").replace(/&Egrave;/g, "È")
    .replace(/&Agrave;/g, "À").replace(/&Acirc;/g, "Â")
    .replace(/&copy;/g, "©").replace(/&reg;/g, "®").replace(/&trade;/g, "™")
    .replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/&hellip;/g, "…").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&euro;/g, "€")
    // Entités numériques décimales (&#233; = é, etc.)
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) && code > 0 && code < 0x10FFFF ? String.fromCodePoint(code) : "";
    })
    // Entités numériques hex (&#xE9; = é)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 0 && code < 0x10FFFF ? String.fromCodePoint(code) : "";
    });
  // Collapse whitespace en gardant des sauts de ligne propres
  s = s
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

/** Extrait le contenu texte d'un message Gmail (en préférant text/plain) */
function getMessageContent(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data && typeof payload.mimeType === "string" && payload.mimeType.startsWith("text/")) {
    const text = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") return htmlToPlainText(text);
    return text;
  }
  if (Array.isArray(payload.parts)) {
    // Préférence : text/plain, sinon text/html, sinon récursif
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain) {
      const r = getMessageContent(plain);
      if (r) return r;
    }
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (html) {
      const r = getMessageContent(html);
      if (r) return r;
    }
    for (const p of payload.parts) {
      const r = getMessageContent(p);
      if (r) return r;
    }
  }
  return "";
}

// ─── Sync un compte Gmail ───
async function syncAccount(admin: any, account: any, options: { forceFullResync?: boolean } = {}) {
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

  // forceFullResync : ignore le history_id pour re-fetch les 30 derniers jours.
  //   Utile pour corriger les emails déjà importés avec un encodage cassé.
  const skipIncremental = !!options.forceFullResync;
  let messagesToProcess: string[] = [];
  let newHistoryId: string | null = null;

  if (account.last_history_id && !skipIncremental) {
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

  if (messagesToProcess.length === 0 && (!account.last_history_id || skipIncremental)) {
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
  let updated = 0;

  for (const msgId of messagesToProcess) {
    try {
      // On regarde si on l'a déjà (pour UPDATE le contenu si décodage cassé,
      // au lieu de re-créer un doublon). Permet la re-sync corrective sans
      // perdre les data manuelles (is_read, is_archived, prospect_id, etc.).
      const { data: existing } = await admin
        .from("messages")
        .select("id, content")
        .eq("owner_id", account.user_id)
        .eq("external_id", msgId)
        .maybeSingle();

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
      const fromName = (headers["from"] || "").replace(/<[^>]*>/, "").trim().replace(/^"|"$/g, "");
      const subject = headers["subject"] || null;
      const dateStr = headers["date"];
      const occurredAt = dateStr ? new Date(dateStr).toISOString() : new Date(parseInt(msg.internalDate || "0")).toISOString();

      // Direction : si on est l'expéditeur, outbound. Sinon inbound.
      const isOutbound = fromEmail === account.email.toLowerCase();
      const matchEmail = isOutbound ? toEmail : fromEmail;

      // ═══ MATCHING PROSPECT (3 niveaux, du plus fort au plus faible) ═══
      let prospectId: string | null = null;

      // 1. Match direct par email (le matchEmail est le contact externe)
      if (matchEmail) {
        const { data } = await admin
          .rpc("find_prospect_by_email", { p_email: matchEmail, p_owner_id: account.user_id });
        if (data) prospectId = data as string;
      }

      // 2. Match par thread_id : si un autre message de ce thread est déjà
      //    rattaché à un prospect (réponse dans une conversation existante),
      //    on hérite du même prospect → permet de rattacher les réponses
      //    même si l'adresse de l'expéditeur a légèrement changé (alias, etc.)
      if (!prospectId && msg.threadId) {
        const { data: threadMatch } = await admin
          .from("messages")
          .select("prospect_id")
          .eq("owner_id", account.user_id)
          .eq("thread_id", msg.threadId)
          .not("prospect_id", "is", null)
          .limit(1)
          .maybeSingle();
        if (threadMatch?.prospect_id) prospectId = threadMatch.prospect_id;
      }

      // 3. Sinon → on garde QUAND MÊME le message (prospect_id = null)
      //    L'utilisateur le verra dans "Non rattachés" et pourra le lier
      //    manuellement à un prospect.

      const content = getMessageContent(msg.payload) || msg.snippet || "";

      if (existing) {
        // Détecte si le contenu existant est CASSÉ (signaux d'encodage latin-1
        // ou CSS leak) et UPDATE avec le nouveau décodage correct. Sinon, skip.
        const looksBroken = !existing.content
          || /Ã©|Ã¨|Ã |Ã´|Ã¹|Ã¢|Ã®|Ã«|Â |Ã«|Ã§|text-decoration:|line-height:|font-family:|@media\b/i.test(existing.content);
        if (looksBroken) {
          const { error: updErr } = await admin.from("messages").update({
            subject,
            content: content.slice(0, 50_000),
            sender_name: fromName || null,
            sender_email: fromEmail,
            recipient_email: toEmail,
            from_email: fromEmail,
            to_email: toEmail,
          }).eq("id", existing.id);
          if (!updErr) updated++;
          else skipped++;
        } else {
          skipped++;
        }
        continue;
      }

      const { error: insertErr } = await admin.from("messages").insert({
        prospect_id: prospectId,            // ✓ peut être null désormais
        owner_id: account.user_id,
        channel: "email",
        direction: isOutbound ? "outbound" : "inbound",
        subject,
        content: content.slice(0, 50_000),
        external_id: msgId,
        thread_id: msg.threadId,
        from_email: fromEmail,
        to_email: toEmail,
        // Champs pour afficher l'expéditeur même sans prospect rattaché :
        sender_name: fromName || null,
        sender_email: fromEmail,
        recipient_email: toEmail,
        source: "gmail_sync",
        is_read: isOutbound,
        occurred_at: occurredAt,
      });
      if (!insertErr) imported++;
      else { skipped++; console.warn("insert msg failed:", insertErr.message); }
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

  return { account_id: account.id, email: account.email, imported, updated, skipped, processed: messagesToProcess.length };
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

    // Body optionnel : { force_full_resync: true } → ignore last_history_id
    // pour re-importer les 30 derniers jours et UPDATE les messages cassés.
    let forceFullResync = false;
    try {
      const body = req.method === "POST" ? await req.json() : null;
      if (body && typeof body === "object" && (body as { force_full_resync?: boolean }).force_full_resync === true) {
        forceFullResync = true;
      }
    } catch {/* pas de body, c'est ok */}

    const results = [];
    for (const account of targetAccounts) {
      try {
        const r = await syncAccount(admin, account, { forceFullResync });
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
