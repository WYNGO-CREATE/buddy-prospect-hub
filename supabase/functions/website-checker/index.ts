/**
 * ─── Website Checker v2 — Détecteur de TPE sans site (ou avec un site moisi) ───
 *
 * Pour chaque entreprise on détermine si elle a un site, et si oui on évalue
 * sa qualité. Plus on a de signaux, plus on est sûr de notre verdict.
 *
 * Stratégie :
 *   1. Si une URL est fournie    → on la teste directement
 *   2. Sinon                     → on devine 5 patterns (nomentreprise.fr, etc.)
 *   3. Une fois la home OK       → on tente aussi /contact pour récolter
 *                                 plus de signaux (lastmod, copyright, etc.)
 *
 * Pour un site qui répond, on évalue ~15 signaux :
 *   • HTTPS + SSL valide
 *   • Meta viewport responsive
 *   • Open Graph / Twitter Card meta (= SEO moderne)
 *   • Favicon
 *   • Web fonts modernes (Google Fonts, custom)
 *   • Framework JS moderne (React, Vue, etc.)
 *   • Tailwind / CSS moderne
 *   • CMS détecté (WordPress version, Wix, Joomla legacy…)
 *   • Header Last-Modified pas trop vieux
 *   • Copyright year récent
 *   • Balises HTML legacy (<font>, <center>, <marquee>)
 *   • Table-based layout
 *   • Page parking ou erreur explicite
 *   • Taille du HTML (très petite = squelette)
 *   • Présence d'un formulaire de contact moderne
 *
 * Classification finale :
 *   • no_website    → score 0-25  (cible prime 🔥)
 *   • outdated      → score 26-55 (cible secondaire 🟡)
 *   • has_website   → score 56+   (site OK, à skip ✅)
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

const FETCH_TIMEOUT_MS = 6000;
const USER_AGENT = "WyngoBot/1.0 (+https://wyngo.fr)";

/** Génère 5 patterns de domaine probables à partir du nom de l'entreprise. */
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

  const collapsed = lower.replace(/\s/g, "");
  const hyphenated = lower.replace(/\s/g, "-");
  const words = lower.split(" ").filter((w) => w.length > 3);
  const dominantWord = words.sort((a, b) => b.length - a.length)[0];

  const candidates: string[] = [];
  for (const root of [collapsed, hyphenated, dominantWord].filter(Boolean)) {
    candidates.push(`https://www.${root}.fr`);
    candidates.push(`https://${root}.fr`);
    candidates.push(`https://www.${root}.com`);
  }
  return [...new Set(candidates)];
}

type FetchResult = {
  status: number;
  html?: string;
  headers?: Headers;
  finalUrl?: string;
};

/** Fetch avec timeout, GET (HEAD est trop souvent mal géré). */
async function tryFetch(url: string): Promise<FetchResult | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return { status: res.status };
    const text = await res.text();
    return {
      status: res.status,
      html: text.slice(0, 60_000),
      headers: res.headers,
      finalUrl: res.url,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Évalue la qualité d'un site. Score 0-100.
 * Combine signaux de la home + de la page /contact si trouvée.
 */
function evaluateSite(
  url: string,
  homeHtml: string,
  homeHeaders: Headers | undefined,
  contactHtml: string | undefined,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 50; // neutre par défaut
  const html = (homeHtml + " " + (contactHtml || "")).slice(0, 80_000);
  const lower = html.toLowerCase();

  // ─── HTTPS + SSL ──
  if (url.startsWith("https://")) {
    score += 12;
    signals.push("https");
  } else {
    score -= 20;
    signals.push("http_only");
  }

  // ─── Responsive ──
  if (/<meta[^>]+name=["']viewport["'][^>]+width=device-width/i.test(html)) {
    score += 12;
    signals.push("responsive");
  } else if (/<meta[^>]+name=["']viewport["']/i.test(html)) {
    score += 4;
    signals.push("partial_viewport");
  } else {
    score -= 12;
    signals.push("not_responsive");
  }

  // ─── Open Graph / Twitter Card (SEO moderne) ──
  if (/<meta[^>]+property=["']og:/i.test(html)) {
    score += 5;
    signals.push("open_graph");
  }
  if (/<meta[^>]+name=["']twitter:/i.test(html)) {
    score += 3;
    signals.push("twitter_card");
  }

  // ─── Favicon ──
  if (/<link[^>]+rel=["']?(?:shortcut )?icon["']?/i.test(html)) {
    score += 3;
    signals.push("favicon");
  }

  // ─── Web fonts modernes ──
  if (/fonts\.(googleapis|gstatic)\.com|@font-face/i.test(html)) {
    score += 5;
    signals.push("modern_fonts");
  }

  // ─── Framework JS ──
  if (/react|next\.js|nuxt|vue|svelte|astro|gatsby|remix/i.test(lower)) {
    score += 10;
    signals.push("modern_framework");
  } else if (/jquery-?(?:1|2)\.|jquery\.min\.js/i.test(lower)) {
    // jQuery 1/2 = très ancien
    score -= 8;
    signals.push("legacy_jquery");
  }

  // ─── Tailwind / CSS moderne ──
  if (/tailwind|cdn\.tailwindcss|--tw-/i.test(lower)) {
    score += 5;
    signals.push("tailwind");
  }

  // ─── CMS detection ──
  if (/wp-content|wordpress/i.test(lower)) {
    // WordPress présent — bon ou mauvais selon la version
    const wpVer = html.match(/<meta[^>]+name=["']generator["'][^>]+wordpress\s+([\d.]+)/i);
    if (wpVer) {
      const major = parseInt(wpVer[1].split(".")[0], 10);
      if (major >= 6) {
        score += 4;
        signals.push(`wp_${wpVer[1]}_recent`);
      } else {
        score -= 12;
        signals.push(`wp_${wpVer[1]}_outdated`);
      }
    } else {
      // WordPress sans version explicite — neutre
      signals.push("wordpress");
    }
  }
  if (/wix\.com|wixstatic/i.test(lower)) {
    score += 2;
    signals.push("wix");
  }
  if (/<meta[^>]+name=["']generator["'][^>]+joomla\s+(?:1|2)\./i.test(html)) {
    score -= 20;
    signals.push("joomla_legacy");
  }

  // ─── Last-Modified header ──
  const lastMod = homeHeaders?.get("last-modified");
  if (lastMod) {
    const lastModDate = new Date(lastMod).getTime();
    if (!isNaN(lastModDate)) {
      const ageYears = (Date.now() - lastModDate) / (365 * 24 * 3600 * 1000);
      if (ageYears > 3) {
        score -= 15;
        signals.push(`lastmod_${Math.round(ageYears)}y_ago`);
      } else if (ageYears < 1) {
        score += 6;
        signals.push("lastmod_recent");
      }
    }
  }

  // ─── Copyright year ──
  const copyMatch = html.match(/©\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?|copyright[^<]*?(\d{4})(?:\s*[-–]\s*(\d{4}))?/i);
  if (copyMatch) {
    // On prend l'année la plus récente du span de copyright
    const years = [copyMatch[1], copyMatch[2], copyMatch[3], copyMatch[4]]
      .filter(Boolean)
      .map((y) => parseInt(y, 10))
      .filter((y) => y > 1995 && y < 2100);
    const latestYear = Math.max(...years, 0);
    if (latestYear) {
      const currentYear = new Date().getFullYear();
      if (latestYear < currentYear - 3) {
        score -= 15;
        signals.push(`copyright_${latestYear}`);
      } else if (latestYear >= currentYear - 1) {
        score += 5;
        signals.push(`copyright_${latestYear}`);
      }
    }
  }

  // ─── Balises HTML legacy ──
  if (/<font\s|<center>|<marquee>|<blink>|<basefont/i.test(html)) {
    score -= 25;
    signals.push("legacy_html_tags");
  }
  // Table-based layout (présence forte de table cellpadding/border attrs)
  const tableLayouts = (html.match(/<table[^>]*(?:cellpadding|cellspacing|border=)/gi) || []).length;
  if (tableLayouts > 3) {
    score -= 12;
    signals.push("table_layout");
  }

  // ─── Iframes Facebook / sites encartés à l'ancienne ──
  if (/<iframe[^>]+src=["']https?:\/\/[^"']*facebook\.com\/plugins/i.test(html)) {
    score -= 3;
    signals.push("fb_iframe");
  }

  // ─── Formulaire de contact moderne (présent si page /contact OK) ──
  if (contactHtml && /<input[^>]+type=["']email["']/i.test(contactHtml)) {
    score += 4;
    signals.push("contact_form_modern");
  }

  // ─── Pages d'erreur / parking ──
  const headSlice = html.slice(0, 4000).toLowerCase();
  if (/(?:^|\s)(?:page not found|page non trouvée|cette page n'?existe|page d'erreur)\b/i.test(headSlice) ||
      /\b404\b.{0,40}(?:not found|introuvable)/i.test(headSlice)) {
    score = 5;
    signals.push("error_page");
  }
  if (/(?:domain\s+parking|en\s+construction|under\s+construction|coming\s+soon|site\s+(?:bientôt|prochainement)|achetez\s+ce\s+domaine|buy this domain)/i.test(headSlice)) {
    score = 5;
    signals.push("parking_page");
  }

  // ─── Taille du HTML (très petit = pas de vrai contenu) ──
  if (homeHtml.length < 1500) {
    score -= 15;
    signals.push("very_small_html");
  } else if (homeHtml.length > 10000) {
    score += 3;
    signals.push("rich_content");
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

function scoreToStatus(score: number): Status {
  if (score >= 56) return "has_website";
  if (score >= 26) return "outdated";
  return "no_website";
}

/** Sélectionne le 1er candidat qui répond, suit les redirections. */
async function findResponsiveCandidate(urls: string[]): Promise<{ url: string; res: FetchResult } | null> {
  for (const url of urls) {
    const res = await tryFetch(url);
    if (!res || res.status >= 400 || !res.html) continue;
    return { url: res.finalUrl || url, res };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { company_name, hint_url } = await req.json();
    if (!company_name && !hint_url) {
      return json({ error: "company_name ou hint_url requis" }, 400);
    }

    // 1. Liste de candidats : hint en priorité, puis devine
    const candidates: string[] = [];
    if (hint_url) {
      const u = hint_url.startsWith("http") ? hint_url : `https://${hint_url}`;
      candidates.push(u);
    }
    if (company_name) candidates.push(...generateDomainCandidates(company_name));

    // 2. On tente de trouver une URL qui répond
    const found = await findResponsiveCandidate(candidates);
    if (!found) {
      // Personne ne répond → CIBLE PRIME
      return json({
        status: "no_website" as Status,
        url: null,
        score: 0,
        signals: ["no_candidates_responded"],
      });
    }

    // 3. On tente aussi /contact pour récolter plus de signaux
    let contactHtml: string | undefined;
    try {
      const origin = new URL(found.url).origin;
      for (const path of ["/contact", "/contact.html", "/contactez-nous", "/nous-contacter"]) {
        const r = await tryFetch(`${origin}${path}`);
        if (r?.html && r.status < 400) {
          contactHtml = r.html;
          break;
        }
      }
    } catch {
      /* ignore */
    }

    // 4. Évalue
    const { score, signals } = evaluateSite(
      found.url,
      found.res.html!,
      found.res.headers,
      contactHtml,
    );

    return json({
      status: scoreToStatus(score),
      url: found.url,
      score,
      signals,
      checked_contact_page: !!contactHtml,
    });
  } catch (e) {
    console.error("[website-checker]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
