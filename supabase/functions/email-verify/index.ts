/**
 * ─── Email Verify — Vérification d'emails via Captain Verify 🇫🇷 ───
 *
 * Vérifie si une adresse email existe et accepte les mails, sans envoyer
 * réellement de message. Utilise le provider Captain Verify (FR / RGPD).
 *
 * ─── Cache mutualisé ────────────────────────────────────────────────
 * Tous les résultats sont stockés dans `email_verifications` avec un TTL
 * de 30 jours. Si un email a déjà été vérifié récemment (par n'importe
 * quel user Wyngo), on retourne le résultat caché → 0 crédit consommé.
 *
 * ─── Statuts normalisés ─────────────────────────────────────────────
 *   valid    : envoi sûr (vert)
 *   risky    : catch-all ou role-based — envoi à tes risques (ambre)
 *   invalid  : email n'existe pas — ne pas envoyer (rouge)
 *   unknown  : serveur muet, on ne sait pas (gris)
 *
 * ─── Body POST ──────────────────────────────────────────────────────
 *   { email: string }                  → single
 *   { emails: string[], force?: bool } → bulk (max 50)
 *
 * ─── Réponse ────────────────────────────────────────────────────────
 *   Single : { email, status, source: "cache"|"provider", verified_at }
 *   Bulk   : { results: [...], cached_count, provider_count, credits_used }
 *
 * ─── Secret Supabase ────────────────────────────────────────────────
 *   CAPTAIN_VERIFY_API_KEY  — la clé API Captain Verify
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const CAPTAIN_VERIFY_API_KEY = Deno.env.get("CAPTAIN_VERIFY_API_KEY");
const HUNTER_API_KEY = Deno.env.get("HUNTER_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type NormalizedStatus = "valid" | "risky" | "invalid" | "unknown";

interface VerifyOutcome {
  email: string;
  status: NormalizedStatus;
  source: "cache" | "provider";
  raw_result?: string;
  verified_at: string;
}

/**
 * Normalise un résultat Captain Verify vers nos 4 statuts canoniques.
 *
 * Captain Verify renvoie 4 valeurs principales pour `result` :
 *   valid | invalid | risky | unknown
 * + des flags binaires : role, disposable, ok4all (catch-all), free, protected
 *
 * Règles métier :
 *   - valid + role:true   → risky (contact@, info@, etc., taux de réponse bas)
 *   - valid + ok4all:true → risky (catch-all, on ne peut pas être sûrs)
 *   - valid + disposable  → invalid (email jetable, pas un vrai prospect)
 */
function normalizeCaptainVerifyResult(payload: Record<string, unknown>): NormalizedStatus {
  const raw = String(payload?.result || "").toLowerCase().trim();
  const role = payload?.role === true;
  const disposable = payload?.disposable === true;
  const catchAll = payload?.ok4all === true;

  if (disposable) return "invalid";
  if (raw === "invalid") return "invalid";
  if (raw === "valid") {
    if (role || catchAll) return "risky";
    return "valid";
  }
  if (raw === "risky") return "risky";
  return "unknown";
}

/**
 * Appelle Captain Verify pour un email donné.
 * Doc : https://captainverify.com/api-documentation
 *   GET https://api.captainverify.com/v2/verify?apikey=KEY&email=EMAIL
 */
async function callCaptainVerify(email: string): Promise<{ status: NormalizedStatus; raw_result: string; details: unknown }> {
  if (!CAPTAIN_VERIFY_API_KEY) {
    throw new Error("CAPTAIN_VERIFY_API_KEY non configurée dans Supabase Edge Functions Secrets.");
  }
  const url = new URL("https://api.captainverify.com/v2/verify");
  url.searchParams.set("apikey", CAPTAIN_VERIFY_API_KEY);
  url.searchParams.set("email", email);

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json", "User-Agent": "WyngoBot/1.0 (+https://wyngo.fr)" },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* parfois texte brut */ }

  if (!res.ok) {
    const msg = (data?.message as string) || (data?.error as string) || `Captain Verify ${res.status}`;
    throw new Error(msg);
  }

  // Log côté serveur pour pouvoir débugger depuis le dashboard Supabase
  console.log(`[email-verify] ${email} →`, JSON.stringify({
    result: data?.result,
    details: data?.details,
    role: data?.role,
    disposable: data?.disposable,
    ok4all: data?.ok4all,
    credits: data?.credits,
  }));

  const status = normalizeCaptainVerifyResult(data);
  // raw_result combine le code principal ET le détail (ex: "unknown · smtp_timeout")
  const raw = [data?.result, data?.details].filter(Boolean).join(" · ") || "unknown";
  return { status, raw_result: String(raw), details: data };
}

/**
 * 2nd opinion : Hunter.io Email Verifier
 * Utilisé EN FALLBACK quand Captain Verify retourne "unknown".
 * Hunter a un protocole de probe différent (multiples IPs, retry interne)
 * et arrive parfois à conclure là où Captain Verify abandonne.
 *
 * Doc : https://hunter.io/api/v2/docs#email-verifier
 *   GET https://api.hunter.io/v2/email-verifier?email=...&api_key=...
 *
 * Statuts Hunter possibles :
 *   data.result    : "deliverable" | "risky" | "undeliverable" | "unknown"
 *   data.status    : "valid" | "invalid" | "accept_all" | "webmail" | "disposable" | "unknown"
 */
async function callHunterVerify(email: string): Promise<{ status: NormalizedStatus; raw_result: string; details: unknown } | null> {
  if (!HUNTER_API_KEY) return null;
  try {
    const url = new URL("https://api.hunter.io/v2/email-verifier");
    url.searchParams.set("email", email);
    url.searchParams.set("api_key", HUNTER_API_KEY);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok) return null;

    const d = data?.data || {};
    const result = String(d?.result || "").toLowerCase(); // deliverable / risky / undeliverable / unknown
    const statusH = String(d?.status || "").toLowerCase(); // valid / accept_all / disposable / ...

    let normalized: NormalizedStatus = "unknown";
    if (result === "deliverable") normalized = statusH === "accept_all" ? "risky" : "valid";
    else if (result === "undeliverable") normalized = "invalid";
    else if (result === "risky") normalized = "risky";

    const raw = `hunter · ${result || "?"}${statusH ? " · " + statusH : ""}`;
    console.log(`[email-verify] Hunter 2nd opinion ${email} →`, raw);
    return { status: normalized, raw_result: raw, details: data };
  } catch (e) {
    console.log(`[email-verify] Hunter erreur ${email}:`, (e as Error).message);
    return null;
  }
}

// ─── Handler principal ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { email?: string; emails?: string[]; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON invalide" }, 400);
  }

  // Normalisation des inputs : single ou bulk
  const inputEmails: string[] = body.email
    ? [body.email]
    : Array.isArray(body.emails) ? body.emails : [];
  if (inputEmails.length === 0) {
    return json({ ok: false, error: "Aucun email fourni" }, 400);
  }
  if (inputEmails.length > 50) {
    return json({ ok: false, error: "Max 50 emails par appel" }, 400);
  }

  // Lowercase + dédup
  const emails = Array.from(new Set(
    inputEmails
      .map((e) => (e || "").trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  ));

  // ─── 1. Lecture cache (sauf si force=true) ─────────────────────────
  let cached: Record<string, { status: NormalizedStatus; verified_at: string; raw_result: string | null }> = {};
  if (!body.force) {
    const { data: cacheRows } = await supabase
      .from("email_verifications")
      .select("email, status, verified_at, expires_at, raw_result")
      .in("email", emails)
      .gt("expires_at", new Date().toISOString());
    for (const row of (cacheRows || [])) {
      cached[row.email] = {
        status: row.status as NormalizedStatus,
        verified_at: row.verified_at,
        raw_result: row.raw_result,
      };
    }
  }

  // ─── 2. Appel provider pour les non-cachés ─────────────────────────
  const toFetch = emails.filter((e) => !cached[e]);
  const results: VerifyOutcome[] = [];
  let providerCount = 0;

  for (const email of emails) {
    if (cached[email]) {
      results.push({
        email,
        status: cached[email].status,
        source: "cache",
        raw_result: cached[email].raw_result || undefined,
        verified_at: cached[email].verified_at,
      });
      continue;
    }
    try {
      let { status, raw_result, details } = await callCaptainVerify(email);
      providerCount += 1;
      let providerUsed = "captain_verify";

      // ─── 2nd opinion Hunter si Captain Verify dit "unknown" ──────
      // Ça arrive sur ~15-25% des emails (serveurs qui silence les probes
      // SMTP). Hunter a un protocole différent qui s'en sort parfois.
      if (status === "unknown") {
        const hunter = await callHunterVerify(email);
        if (hunter && hunter.status !== "unknown") {
          status = hunter.status;
          raw_result = `${raw_result} → ${hunter.raw_result}`;
          details = { captain_verify: details, hunter: hunter.details };
          providerUsed = "captain_verify+hunter";
        }
      }

      const verifiedAt = new Date().toISOString();
      // TTL adaptatif : on cache 30j les résultats déterminés (valid/risky/invalid),
      // 1j seulement pour les "unknown" (on retentera demain, ça peut changer)
      const ttlMs = status === "unknown" ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();

      await supabase.from("email_verifications").upsert({
        email,
        status,
        provider: providerUsed,
        raw_result,
        details,
        verified_at: verifiedAt,
        expires_at: expiresAt,
      }, { onConflict: "email" });
      results.push({ email, status, source: "provider", raw_result, verified_at: verifiedAt });
    } catch (err) {
      // Erreur réseau / quota / clé invalide → on retourne "unknown" sans cacher
      console.error(`[email-verify] ${email}: ${(err as Error).message}`);
      results.push({
        email,
        status: "unknown",
        source: "provider",
        raw_result: `error: ${(err as Error).message}`,
        verified_at: new Date().toISOString(),
      });
    }
  }

  // ─── 3. Réponse ─────────────────────────────────────────────────────
  if (body.email && results.length === 1) {
    return json({ ok: true, ...results[0] });
  }
  return json({
    ok: true,
    results,
    cached_count: emails.length - toFetch.length,
    provider_count: providerCount,
    credits_used: providerCount,
  });
});
