/**
 * ─── Website Checker — Détecteur de TPE sans site web ───
 *
 * Cœur du modèle Wyngo : pour chaque entreprise, on détermine si elle a un
 * site web et, si oui, on évalue sa qualité (moderne / obsolète).
 *
 * Stratégie en 3 niveaux :
 *   1. Si une URL est fournie    → on la teste directement (HEAD puis GET)
 *   2. Si pas d'URL, on essaie   → 5 patterns de domaine basés sur le nom
 *      (nomentreprise.fr, .com, nom-entreprise.fr, etc.)
 *   3. Si rien ne répond         → "no_website" = CIBLE PRIME 🔥
 *
 * Pour les sites qui répondent, on évalue :
 *   • HTTPS ?
 *   • Responsive meta viewport ?
 *   • Pas de framework JS moderne détecté → vieux site
 *   • Date de copyright dans le HTML
 *
 * Classification :
 *   • no_website    → pas de site trouvé           (cible #1)
 *   • outdated      → site présent mais vieux/HTTP (cible #2)
 *   • has_website   → site moderne, à skip
 *   • unknown       → erreur réseau, à retester
 *
 * Body POST attendu :
 *   { company_name?: string, hint_url?: string }
 *
 * Réponse :
 *   { status, url?: string | null, score: 0-100, signals: string[] }
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

type Status = "has_website" | "outdated" | "no_website" | "unknown";

// Petite fenêtre de temps pour ne pas bloquer la fonction sur un domaine lent.
const FETCH_TIMEOUT_MS = 5000;

/**
 * Normalise un nom d'entreprise pour générer des candidats de domaine.
 * "Boulangerie Martin & Fils" → ["boulangeriemartinetfils", "boulangerie-martin-et-fils", "martin"]
 */
function generateDomainCandidates(companyName: string): string[] {
  const lower = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!lower) return [];

  const collapsed = lower.replace(/\s/g, ""); // "boulangeriemartinetfils"
  const hyphenated = lower.replace(/\s/g, "-"); // "boulangerie-martin-et-fils"

  // Mot principal (le plus long, > 3 chars, pour deviner ex: "martin" pour boulangerie-martin)
  const words = lower.split(" ").filter((w) => w.length > 3);
  const dominantWord = words.sort((a, b) => b.length - a.length)[0];

  const candidates: string[] = [];
  for (const root of [collapsed, hyphenated, dominantWord].filter(Boolean)) {
    candidates.push(`https://www.${root}.fr`);
    candidates.push(`https://${root}.fr`);
    candidates.push(`https://www.${root}.com`);
  }
  // Dédup en gardant l'ordre
  return [...new Set(candidates)];
}

/**
 * Tente un HEAD puis GET sur une URL, avec timeout.
 * Retourne { ok, status, html } ou null si tout échoue.
 */
async function tryFetch(url: string): Promise<{ status: number; html?: string } | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // GET direct (plus fiable que HEAD qui est souvent mal géré par les vieux sites)
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "WyngoBot/1.0 (+https://wyngo.fr)" },
    });
    if (!res.ok) return { status: res.status };
    const text = await res.text();
    return { status: res.status, html: text.slice(0, 30_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Analyse le HTML d'un site qui répond pour déterminer s'il est moderne ou obsolète.
 * Renvoie un score 0-100 (100 = très moderne).
 */
function analyzeHtml(url: string, html: string): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 50; // neutre par défaut

  const lower = html.toLowerCase();

  // HTTPS = +15
  if (url.startsWith("https://")) {
    score += 15;
    signals.push("https");
  } else {
    score -= 20;
    signals.push("http_only");
  }

  // Viewport responsive = +15
  if (/<meta[^>]+name=["']viewport["']/i.test(html)) {
    score += 15;
    signals.push("responsive");
  } else {
    score -= 15;
    signals.push("not_responsive");
  }

  // Framework JS moderne = +10
  if (/react|next|vue|nuxt|svelte|astro|gatsby/i.test(lower)) {
    score += 10;
    signals.push("modern_framework");
  }

  // Tailwind / CSS moderne = +5
  if (/tailwind|css-in-js/i.test(lower)) {
    score += 5;
    signals.push("modern_css");
  }

  // Indicateurs vieux site = -20 cumulables
  if (/<font\s|<center>|<marquee>|<blink>/i.test(html)) {
    score -= 30;
    signals.push("legacy_html_tags");
  }
  if (/<table[^>]*(?:cellpadding|border)/i.test(html)) {
    score -= 10;
    signals.push("table_layout");
  }
  if (/iframe.*src=["']https?:\/\/[^"']*facebook/i.test(html)) {
    score -= 5;
    signals.push("facebook_embed");
  }

  // Date de copyright (extrait l'année)
  const copyrightYearMatch = html.match(/©\s*(\d{4})|copyright[^<]*?(\d{4})/i);
  if (copyrightYearMatch) {
    const year = parseInt(copyrightYearMatch[1] || copyrightYearMatch[2], 10);
    const currentYear = new Date().getFullYear();
    if (year < currentYear - 3) {
      score -= 15;
      signals.push(`old_copyright_${year}`);
    } else {
      score += 5;
      signals.push(`recent_copyright_${year}`);
    }
  }

  // Pages d'erreur explicites = no_website
  if (/page not found|404|domain.*expired|cette page n.est pas/i.test(html.slice(0, 2000))) {
    score = 0;
    signals.push("error_page");
  }

  // Pages parking (1and1, godaddy, ovh parking, etc.)
  if (/parking|domain.*sale|under construction|en construction/i.test(html.slice(0, 2000))) {
    score = 5;
    signals.push("parking_page");
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

function scoreToStatus(score: number): Status {
  if (score >= 60) return "has_website";
  if (score >= 20) return "outdated";
  return "no_website"; // 0-19 = essentiellement erreur/parking
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { company_name, hint_url } = await req.json();
    if (!company_name && !hint_url) {
      return json({ error: "company_name ou hint_url requis" }, 400);
    }

    // 1. URL hint fournie → on l'essaie en priorité
    const candidates: string[] = [];
    if (hint_url) {
      const url = hint_url.startsWith("http") ? hint_url : `https://${hint_url}`;
      candidates.push(url);
    }
    if (company_name) {
      candidates.push(...generateDomainCandidates(company_name));
    }

    // 2. Essai séquentiel (on s'arrête au premier qui répond)
    for (const url of candidates) {
      const result = await tryFetch(url);
      if (!result) continue;

      if (result.status >= 400) continue; // 404 / 500 / etc, on essaie le suivant

      if (!result.html) {
        // 200 mais pas de HTML → probable redirection bizarre
        return json({
          status: "has_website" as Status,
          url,
          score: 50,
          signals: ["no_html_body"],
        });
      }

      const { score, signals } = analyzeHtml(url, result.html);
      return json({
        status: scoreToStatus(score),
        url,
        score,
        signals,
      });
    }

    // 3. Aucun candidat n'a répondu → CIBLE PRIME 🔥
    return json({
      status: "no_website" as Status,
      url: null,
      score: 0,
      signals: ["no_candidates_responded"],
    });
  } catch (e) {
    console.error("[website-checker]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
