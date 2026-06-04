/**
 * ─── Email Scraper — Extrait l'email depuis le site d'une entreprise ───
 *
 * Pour une URL donnée, fetch la page d'accueil PUIS les pages "contact"
 * habituelles, et extrait tous les emails du HTML. Privilégie les emails
 * pro (info@, contact@, hello@) vs les emails persos.
 *
 * Body POST :
 *   { url: string }
 *
 * Réponse :
 *   { ok: true, email: string | null, all_emails: string[] }
 *
 * Note : on respecte les sites en mettant un User-Agent identifié et en
 * limitant à 3 pages max (home + 2 candidats contact). Pas de scraping
 * récursif, pas de robots.txt strict — usage légitime B2B.
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

const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT = "WyngoBot/1.0 (+https://wyngo.fr)";

// Pages contact les plus fréquentes (FR + EN)
const CONTACT_PATHS = [
  "/contact",
  "/contact.html",
  "/nous-contacter",
  "/contact-nous",
  "/mentions-legales",
  "/about",
  "/a-propos",
  "/qui-sommes-nous",
];

// Regex pour matcher des emails. Permissive (RFC-compliant simplifiée).
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Emails à filtrer : généralement faux positifs ou non utiles
const BLACKLIST_PATTERNS = [
  /@example\./i,
  /@domain\./i,
  /@sentry\.io/i,
  /@wixpress\.com/i,
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /@sentry-next\./i,
  /wixstudio/i,
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
];

function isBlacklisted(email: string): boolean {
  const lower = email.toLowerCase();
  return BLACKLIST_PATTERNS.some((re) => re.test(lower));
}

/**
 * Score un email : plus c'est haut, plus c'est probable que ce soit le bon contact.
 *   - prefix générique (contact@, info@) → +30
 *   - prefix par nom (jean.dupont@) → +10
 *   - domaine matche le site visité → +20
 *   - tous les autres → 0
 */
function scoreEmail(email: string, siteDomain: string): number {
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  let score = 0;

  // Préfixes pro
  if (/^(contact|info|hello|bonjour|salut|admin|service|sales|commercial)$/i.test(local)) {
    score += 30;
  }
  // Domaine matche le site → c'est un email officiel de l'entreprise
  if (domain && siteDomain && domain.endsWith(siteDomain.replace(/^www\./, ""))) {
    score += 20;
  }
  // Évite les emails persos (gmail/free) — pénalité légère
  if (/@(gmail|free|yahoo|hotmail|outlook|laposte|orange|wanadoo|sfr)\./i.test(lower)) {
    score -= 10;
  }

  return score;
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 200_000); // limite à 200 Ko (les pages contact font rarement plus)
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_REGEX) || [];
  // Décode les mailto: encodés en HTML entities (ex: m&#64;example.com)
  const decoded = html.replace(/&#64;/g, "@").match(EMAIL_REGEX) || [];
  return [...new Set([...matches, ...decoded])];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { url } = await req.json();
    if (!url) return json({ error: "url requise" }, 400);

    // Normalise l'URL
    const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
    const urlObj = new URL(cleanUrl);
    const siteDomain = urlObj.hostname.replace(/^www\./, "");

    // 1. Récupère la home
    const allEmails = new Set<string>();
    const homeHtml = await fetchHtml(cleanUrl);
    if (homeHtml) {
      extractEmails(homeHtml).forEach((e) => allEmails.add(e.toLowerCase()));
    }

    // 2. Si pas trouvé sur la home, tente les pages contact connues
    if (allEmails.size === 0) {
      for (const path of CONTACT_PATHS) {
        const contactHtml = await fetchHtml(`${urlObj.origin}${path}`);
        if (contactHtml) {
          extractEmails(contactHtml).forEach((e) => allEmails.add(e.toLowerCase()));
          if (allEmails.size > 0) break; // dès qu'on en trouve, on arrête
        }
      }
    }

    // Filtre + score
    const candidates = Array.from(allEmails)
      .filter((e) => !isBlacklisted(e))
      .map((e) => ({ email: e, score: scoreEmail(e, siteDomain) }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0]?.email || null;

    return json({
      ok: true,
      email: best,
      all_emails: candidates.map((c) => c.email),
      site_domain: siteDomain,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email-scraper]", msg);
    return json({ error: msg }, 500);
  }
});
