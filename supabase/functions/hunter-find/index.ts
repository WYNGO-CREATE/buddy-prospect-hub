/**
 * ─── Hunter.io Email Finder ───
 *
 * Fallback de dernier recours pour trouver l'email d'un contact quand le
 * scraping du site n'a rien donné. Utilise Hunter.io qui maintient une base
 * de patterns d'emails par domaine + crawl public.
 *
 * Plan Hunter Free : 25 recherches/mois gratuit (suffit pour démarrer).
 * Plan Starter : 49$/mo pour 500/mois (à activer si besoin).
 *
 * Clé en secret Supabase : HUNTER_API_KEY
 *   - Inscription gratuite sur https://hunter.io
 *   - Clé API dans Settings → API
 *
 * 2 actions :
 *   • "domain-search"  → liste tous les emails connus pour un domaine
 *   • "email-finder"   → email d'une personne précise (first + last + domain)
 */

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

const HUNTER_API_KEY = Deno.env.get("HUNTER_API_KEY");

async function callHunter(path: string, params: Record<string, string>) {
  if (!HUNTER_API_KEY) {
    throw new Error("HUNTER_API_KEY non configurée dans Supabase Edge Functions Secrets.");
  }
  const url = new URL(`https://api.hunter.io/v2${path}`);
  url.searchParams.set("api_key", HUNTER_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.details || `Hunter ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = body?.action as string;
    const params = body?.params || {};

    if (action === "domain-search") {
      // Liste les emails publics connus pour un domaine
      if (!params.domain) return json({ error: "domain requis" }, 400);
      const data = await callHunter("/domain-search", { domain: params.domain, limit: "5" });
      const emails = (data?.data?.emails || []) as Array<{
        value: string;
        type?: string;
        confidence?: number;
        first_name?: string;
        last_name?: string;
        position?: string;
      }>;
      const best = emails.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
      return json({
        ok: true,
        email: best?.value || null,
        confidence: best?.confidence || null,
        all: emails.map((e) => ({
          email: e.value,
          name: [e.first_name, e.last_name].filter(Boolean).join(" "),
          position: e.position,
          confidence: e.confidence,
        })),
        pattern: data?.data?.pattern || null,
      });
    }

    if (action === "email-finder") {
      // Email d'une personne précise
      if (!params.domain || !params.first_name || !params.last_name) {
        return json({ error: "domain, first_name, last_name requis" }, 400);
      }
      const data = await callHunter("/email-finder", {
        domain: params.domain,
        first_name: params.first_name,
        last_name: params.last_name,
      });
      return json({
        ok: true,
        email: data?.data?.email || null,
        confidence: data?.data?.score || null,
      });
    }

    return json({ error: "Action inconnue. Utilise 'domain-search' ou 'email-finder'." }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[hunter-find]", msg);
    return json({ error: msg }, 500);
  }
});
