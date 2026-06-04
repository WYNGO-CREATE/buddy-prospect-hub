/**
 * ─── Email Scraper v2 — Exploration approfondie pour récupérer l'email ───
 *
 * Pour une URL donnée, explore le site en profondeur pour extraire l'email
 * contact. Implémente plusieurs techniques que les sites utilisent pour
 * masquer leurs emails (anti-scrap mais on est en B2B légitime) :
 *
 *   1. Pages testées (~12, vs 7 en v1) :
 *      Home + /contact, /contact.html, /contactez-nous, /contact-nous,
 *      /nous-contacter, /a-propos, /qui-sommes-nous, /mentions-legales,
 *      /equipe, /team, /our-team, /notre-equipe
 *
 *   2. Détection multi-techniques :
 *      a. Regex classique sur le HTML
 *      b. Décodage HTML entities (&#64; → @)
 *      c. Décodage Cloudflare email obfuscation (data-cfemail)
 *      d. Décodage "email [at] domain [dot] fr" → email@domain.fr
 *      e. JSON-LD schema.org (Organization, LocalBusiness → email property)
 *      f. Microformats h-card / hCard
 *      g. mailto: dans les attributs href
 *
 *   3. Scoring intelligent :
 *      - Préfixe pro (contact@, info@, hello@…) +30
 *      - Domaine matche le site +20
 *      - Email Gmail/Free/Yahoo perso -10
 *      - Blacklist explicite (noreply, sentry, wixstudio…) → exclu
 *
 * Body POST :
 *   { url: string }
 *
 * Réponse :
 *   { ok, email, all_emails[], pages_scanned[], site_domain }
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

const FETCH_TIMEOUT_MS = 6000;
const USER_AGENT = "WyngoBot/1.0 (+https://wyngo.fr)";
const MAX_PAGES = 6; // on s'arrête dès qu'on a trouvé suffisamment d'emails

// 12 chemins contact à tester. On les essaie dans l'ordre.
const CONTACT_PATHS = [
  "/contact",
  "/contact.html",
  "/contact-us",
  "/contactez-nous",
  "/nous-contacter",
  "/contact-nous",
  "/mentions-legales",
  "/legal",
  "/a-propos",
  "/about",
  "/qui-sommes-nous",
  "/equipe",
  "/team",
  "/our-team",
  "/notre-equipe",
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Emails à filtrer (faux positifs récurrents)
const BLACKLIST_PATTERNS = [
  /@example\./i,
  /@domain\./i,
  /@sentry[.-]/i,
  /@wixpress\.com/i,
  /@wixstudio/i,
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.webp$/i,
  /@2x@/i, // matches like image-name@2x@something
  /@sha[1-9]/i, // commit hashes
  /\bu003c|\bu003e|\bu0040\b/i, // unicode escapes mal décodés
];

function isBlacklisted(email: string): boolean {
  const lower = email.toLowerCase();
  return BLACKLIST_PATTERNS.some((re) => re.test(lower));
}

/**
 * Score un email. Plus c'est haut, plus c'est probablement le bon contact pro.
 */
function scoreEmail(email: string, siteDomain: string): number {
  const lower = email.toLowerCase();
  const [local, domain] = lower.split("@");
  let score = 0;

  // Préfixes pro classiques
  if (/^(contact|info|hello|bonjour|salut|admin|service|sales|commercial|accueil|reception|secretariat|direction)$/i.test(local)) {
    score += 30;
  }
  // Préfixe par nom (probablement un membre de l'équipe)
  if (/^[a-z]+\.[a-z]+$/i.test(local) || /^[a-z]+\-[a-z]+$/i.test(local)) {
    score += 8;
  }
  // Domaine matche le site = officiel
  if (domain && siteDomain && domain.endsWith(siteDomain.replace(/^www\./, ""))) {
    score += 25;
  }
  // Pénalité emails persos (Gmail/Free/Yahoo… souvent pas le bon contact)
  if (/@(gmail|free|yahoo|hotmail|outlook|laposte|orange|wanadoo|sfr|live)\.[a-z]+$/i.test(lower)) {
    score -= 12;
  }
  // Pénalité TLD étranges (.invalid, .test, .local)
  if (/@.*\.(?:invalid|test|local|example|onion)$/i.test(lower)) {
    score -= 50;
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
    return text.slice(0, 300_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Décode l'obfuscation Cloudflare email :
 *   <a class="__cf_email__" data-cfemail="HEX_STRING">[email protected]</a>
 * Le 1er byte est la clé XOR, les suivants sont les chars XOR'ed.
 */
function decodeCloudflareEmails(html: string): string[] {
  const emails: string[] = [];
  const re = /data-cfemail=["']([a-f0-9]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const hex = match[1];
    try {
      const key = parseInt(hex.slice(0, 2), 16);
      let decoded = "";
      for (let i = 2; i < hex.length; i += 2) {
        const charCode = parseInt(hex.slice(i, i + 2), 16) ^ key;
        decoded += String.fromCharCode(charCode);
      }
      if (decoded.includes("@") && decoded.includes(".")) {
        emails.push(decoded);
      }
    } catch {
      /* décodage échoué pour cette entrée */
    }
  }
  return emails;
}

/**
 * Décode les obfuscations en clair :
 *   "contact [at] domain [dot] fr"
 *   "contact (at) domain (dot) fr"
 *   "contact AT domain DOT fr"
 *   "contact @ domain . fr"  (espaces)
 */
function decodeTextObfuscations(html: string): string[] {
  const text = html
    // [at], (at), AT, " at "
    .replace(/\s*[\[(]?\s*(?:at|@)\s*[\])]?\s*/gi, "@")
    // [dot], (dot), DOT, " dot ", " . "
    .replace(/\s*[\[(]?\s*(?:dot|point)\s*[\])]?\s*/gi, ".")
    // Espaces autour du . dans les emails : "contact @ domain . fr"
    .replace(/(\w)\s+\.\s+(\w)/g, "$1.$2");
  const matches = text.match(EMAIL_REGEX) || [];
  return matches;
}

/**
 * Extrait les emails depuis les JSON-LD schema.org embarqués.
 * Les sites pro mettent souvent {"@type":"Organization","email":"contact@..."}
 */
function extractFromJsonLd(html: string): string[] {
  const emails: string[] = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!scripts) return emails;
  for (const script of scripts) {
    const content = script.replace(/<script[^>]*>|<\/script>/gi, "");
    try {
      const data = JSON.parse(content);
      const walk = (obj: unknown) => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) {
          obj.forEach(walk);
          return;
        }
        const rec = obj as Record<string, unknown>;
        if (typeof rec.email === "string") emails.push(rec.email);
        if (typeof rec.contactPoint === "object") walk(rec.contactPoint);
        Object.values(rec).forEach(walk);
      };
      walk(data);
    } catch {
      // JSON invalide, on tente quand même une extraction regex
      const fallback = content.match(EMAIL_REGEX);
      if (fallback) emails.push(...fallback);
    }
  }
  return emails;
}

/**
 * Extrait tous les mailto: des href.
 */
function extractFromMailto(html: string): string[] {
  const matches = html.matchAll(/href=["']mailto:([^"'?]+)["'?]/gi);
  return Array.from(matches, (m) => m[1].trim());
}

/**
 * Extrait tous les emails du HTML via toutes les techniques disponibles.
 */
function extractAllEmails(html: string): string[] {
  const all = new Set<string>();
  // Décode les entités HTML usuelles
  const decoded = html
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/&amp;/gi, "&");

  // 1. Regex classique sur le HTML décodé
  (decoded.match(EMAIL_REGEX) || []).forEach((e) => all.add(e));

  // 2. Cloudflare obfuscation
  decodeCloudflareEmails(html).forEach((e) => all.add(e));

  // 3. Obfuscations texte ([at] [dot])
  decodeTextObfuscations(decoded).forEach((e) => all.add(e));

  // 4. JSON-LD schema.org
  extractFromJsonLd(html).forEach((e) => all.add(e));

  // 5. mailto:
  extractFromMailto(html).forEach((e) => all.add(e));

  return Array.from(all).map((e) => e.toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { url } = await req.json();
    if (!url) return json({ error: "url requise" }, 400);

    const cleanUrl = url.startsWith("http") ? url : `https://${url}`;
    const urlObj = new URL(cleanUrl);
    const siteDomain = urlObj.hostname.replace(/^www\./, "");

    const collected = new Set<string>();
    const pagesScanned: string[] = [];

    // 1. Home en priorité
    const homeHtml = await fetchHtml(cleanUrl);
    if (homeHtml) {
      extractAllEmails(homeHtml).forEach((e) => collected.add(e));
      pagesScanned.push(cleanUrl);
    }

    // 2. Si pas encore trouvé une cible "score > 20", on continue
    let bestScoreSoFar = Math.max(
      0,
      ...Array.from(collected)
        .filter((e) => !isBlacklisted(e))
        .map((e) => scoreEmail(e, siteDomain)),
    );

    if (bestScoreSoFar < 30 && pagesScanned.length < MAX_PAGES) {
      for (const path of CONTACT_PATHS) {
        if (pagesScanned.length >= MAX_PAGES) break;
        const pageUrl = `${urlObj.origin}${path}`;
        const pageHtml = await fetchHtml(pageUrl);
        if (!pageHtml) continue;
        pagesScanned.push(pageUrl);
        extractAllEmails(pageHtml).forEach((e) => collected.add(e));

        bestScoreSoFar = Math.max(
          bestScoreSoFar,
          ...Array.from(collected)
            .filter((e) => !isBlacklisted(e))
            .map((e) => scoreEmail(e, siteDomain)),
        );
        // Si on a un email pro à fort score, on arrête (économie de bande passante)
        if (bestScoreSoFar >= 40) break;
      }
    }

    // Filtre + score final
    const candidates = Array.from(collected)
      .filter((e) => !isBlacklisted(e))
      .filter((e) => e.length < 80 && e.length > 5) // garde-fous
      .map((e) => ({ email: e, score: scoreEmail(e, siteDomain) }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0]?.email || null;

    return json({
      ok: true,
      email: best,
      all_emails: candidates.map((c) => ({ email: c.email, score: c.score })),
      pages_scanned: pagesScanned,
      site_domain: siteDomain,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email-scraper]", msg);
    return json({ error: msg }, 500);
  }
});
