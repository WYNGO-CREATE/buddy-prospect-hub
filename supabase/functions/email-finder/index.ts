/**
 * ─── Email Finder — Cascade de découverte d'email pour TPE FR ────────
 *
 * Orchestre toutes les sources de découverte d'email pour un prospect
 * et retourne le meilleur candidat. Conçu pour les TPE françaises qui
 * souvent n'ont pas de site web (donc Hunter et scraper seuls échouent).
 *
 * ─── Cascade (s'arrête dès qu'on a un email "valid" ou "risky") ─────
 *   1. email-scraper      (si site connu)        → existant
 *   2. hunter-find        (si domaine déduit)    → existant
 *   3. Pages Jaunes       (recherche par nom+ville) → NOUVEAU 🇫🇷
 *   4. Pattern + verify   (si dirigeant connu)   → NOUVEAU
 *
 * ─── Body POST ──────────────────────────────────────────────────────
 *   {
 *     company_name: string,           // obligatoire
 *     city?: string,                   // recommandé (filtre Pages Jaunes)
 *     website_url?: string,            // si on a un site
 *     dirigeant_first_name?: string,   // depuis Pappers
 *     dirigeant_last_name?: string,    // depuis Pappers
 *     skip_verify?: boolean            // skip Captain Verify (économie crédits)
 *   }
 *
 * ─── Réponse ────────────────────────────────────────────────────────
 *   {
 *     ok, email, email_status, sources_tried[], candidates[], duration_ms
 *   }
 *
 *   candidates: [{ email, source, status, confidence }]
 *     source : "scraper" | "hunter" | "pages_jaunes" | "pattern"
 *     status : "valid" | "risky" | "invalid" | "unknown" | "not_verified"
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UA_FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0";

type Candidate = {
  email: string;
  source: "scraper" | "hunter" | "web_search" | "pattern" | "domain_discovery";
  status: "valid" | "risky" | "invalid" | "unknown" | "not_verified";
  confidence: number; // 0-100
};

// ─── Helpers ─────────────────────────────────────────────────────────

function normEmail(e: string): string {
  return (e || "").trim().toLowerCase();
}

function isPlausibleEmail(e: string): boolean {
  if (!e) return false;
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)) return false;
  // Anti-bruit (analytics, sentry, automated)
  if (/(noreply|no-reply|donotreply|sentry|wixstudio|wixpress|@example\.|@test\.|@sentry\.io|@cloudflare\.)/i.test(e)) return false;
  // Domaines infra / moteurs de recherche / réseaux sociaux : JAMAIS le prospect.
  // (c'est ce qui a laissé passer "error-lite@duckduckgo.com")
  if (/@(duckduckgo|google|googlemail|bing|microsoft|yahoo-inc|yandex|qwant|ecosia|startpage|baidu|wikipedia|wikimedia|youtube|twitter|x\.com|facebook|fb\.com|instagram|linkedin|tiktok|pinterest|snapchat|amazon|apple|adobe|mozilla|wordpress|wix|squarespace|shopify|godaddy|ovh\.(com|net)|gandi)\./i.test(e)) return false;
  return true;
}

/** Slugify pour fabriquer un domaine candidat depuis un nom commercial. */
function slugifyCompany(name: string): string {
  return (name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function fetchWithTimeout(url: string, ms = 8000, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA_FIREFOX, "Accept-Language": "fr-FR,fr;q=0.9", ...init.headers },
    });
  } finally {
    clearTimeout(t);
  }
}

// ─── Source 1 & 2 : edge functions existantes ───────────────────────

async function invokeEdge<T = unknown>(name: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ─── Source 3 : Recherche web (DuckDuckGo HTML) ──────────────────────
/**
 * Recherche l'email du prospect via une requête web ciblée.
 *
 * Pourquoi DuckDuckGo HTML et pas Google/Bing/Pages Jaunes :
 *   - Pages Jaunes : Cloudflare anti-bot bloque toutes les IPs serveur
 *   - Société.com : pareil
 *   - Google : bloque les scrapers ou exige reCAPTCHA
 *   - Bing : tolère mais commence à bloquer en volume
 *   - DuckDuckGo HTML (https://html.duckduckgo.com/html/) : le + permissif,
 *     pas d'API key, pas de captcha sur volume modéré
 *
 * Stratégie :
 *   1. Requête ciblée : "Nom Société" "Ville" (contact OR email)
 *   2. Récupère 10-20 snippets de résultats
 *   3. Extrait tous les emails apparaissant dans les snippets
 *   4. Filtre les emails dont le domaine est cohérent (slug entreprise)
 *      ou qui contiennent le nom du prospect
 *
 * Limite : ne trouvera que les emails déjà indexés publiquement sur
 * Facebook / annuaires / blogs locaux. Mais c'est exactement ce qu'on veut
 * pour les TPE FR sans site web mais référencées quelque part.
 */
/**
 * Lance UNE recherche DuckDuckGo HTML et retourne tous les emails trouvés.
 * On essaie plusieurs requêtes différentes (large → précise) pour maximiser
 * les chances de toucher un snippet contenant l'email.
 */
async function ddgSearchEmails(query: string): Promise<string[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) {
      console.log(`[email-finder] DDG ${res.status} pour "${query}"`);
      return [];
    }
    const html = await res.text();
    if (html.length < 1000) {
      console.log(`[email-finder] DDG retour court (${html.length}b) pour "${query}"`);
      return [];
    }
    // Détecte la page d'erreur / rate-limit de DDG (contient error-lite,
    // "If this error persists", ou la page "lite" minimaliste). Dans ce cas
    // on NE scanne PAS (sinon on récupère error-lite@duckduckgo.com).
    if (/error-lite|If this error persists|anomaly|unusual traffic|rate limit/i.test(html)) {
      console.log(`[email-finder] DDG page d'erreur/rate-limit pour "${query}"`);
      return [];
    }
    return extractEmailsFromHtml(html);
  } catch (e) {
    console.log(`[email-finder] DDG erreur "${query}":`, (e as Error).message);
    return [];
  }
}

/**
 * Recherche l'email du prospect via plusieurs requêtes web ciblées.
 * Stratégie cascade : 3 requêtes du + précis au + large.
 *
 * Pourquoi DuckDuckGo HTML : voir explication source 3.
 */
async function searchWebForEmails(companyName: string, city: string): Promise<{ emails: string[]; queries: string[] }> {
  if (!companyName) return { emails: [], queries: [] };

  const queries: string[] = [];
  const allEmails = new Set<string>();

  // Requête 1 : très précise
  const q1Parts = [`"${companyName}"`];
  if (city) q1Parts.push(`"${city}"`);
  q1Parts.push("(email OR contact OR mail)");
  const q1 = q1Parts.join(" ");
  queries.push(q1);
  (await ddgSearchEmails(q1)).forEach((e) => allEmails.add(e));

  // Requête 2 : sans la ville (élargit)
  if (allEmails.size === 0) {
    const q2 = `"${companyName}" (email OR contact)`;
    queries.push(q2);
    (await ddgSearchEmails(q2)).forEach((e) => allEmails.add(e));
  }

  // Requête 3 : ultra-large (sans guillemets)
  if (allEmails.size === 0) {
    const q3 = `${companyName} ${city || ""} email contact`.trim();
    queries.push(q3);
    (await ddgSearchEmails(q3)).forEach((e) => allEmails.add(e));
  }

  if (allEmails.size === 0) return { emails: [], queries };

  // Scoring : on filtre les emails clairement hors sujet, mais on est
  // BEAUCOUP plus permissif que la v1 — sauf signaux négatifs forts,
  // on garde tout (un email Gmail anonyme peut être l'email de la TPE).
  const slug = slugifyCompany(companyName).replace(/-/g, " ");
  const slugWords = slug.split(/\s+/).filter((w) => w.length >= 4);

  function score(e: string): number {
    let s = 5; // baseline positive
    const [local, domain] = e.split("@");
    if (!domain) return -100;
    const dParts = domain.toLowerCase().split(/[.-]/);
    for (const w of slugWords) {
      if (dParts.some((p) => p.includes(w))) s += 10;
      if (local.toLowerCase().includes(w)) s += 5;
    }
    if (/^(contact|info|hello|bonjour|accueil|commerce|service|reservation|rdv|booking)/.test(local.toLowerCase())) s += 3;
    // malus modéré pour les persos génériques (mais on les garde)
    if (/@(gmail|hotmail|yahoo|free|orange|wanadoo|sfr|laposte|outlook)\./.test(domain)) s -= 1;
    // malus FORT pour les domaines clairement hors sujet (parasites)
    if (/@(lemonde|lefigaro|leparisien|mairie|gouv|insee|infogreffe|wikipedia|youtube|twitter|facebook\.com|linkedin\.com|instagram\.com|tiktok|amazon|google|microsoft|apple)\./.test(domain)) s -= 100;
    // exclusion totale des emails noreply/notif
    if (/^(noreply|no-reply|donotreply|notification|alert|admin|webmaster|postmaster|hostmaster|abuse)/.test(local.toLowerCase())) s -= 100;
    return s;
  }

  const scored = Array.from(allEmails)
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  return { emails: scored.map((x) => x.e), queries };
}

function extractEmailsFromHtml(html: string): string[] {
  const found = new Set<string>();
  // 1. mailto:
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const e = normEmail(decodeURIComponent(m[1]));
    if (isPlausibleEmail(e)) found.add(e);
  }
  // 2. Regex classique sur le texte
  for (const m of html.matchAll(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi)) {
    const e = normEmail(m[0]);
    if (isPlausibleEmail(e)) found.add(e);
  }
  // 3. HTML entities (&#64; → @)
  const decoded = html.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  if (decoded !== html) {
    for (const m of decoded.matchAll(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi)) {
      const e = normEmail(m[0]);
      if (isPlausibleEmail(e)) found.add(e);
    }
  }
  // 4. Pages Jaunes data-pjlb (base64 encodé)
  for (const m of html.matchAll(/data-pjlb="\{[^}]*"url":"([^"]+)"/g)) {
    try {
      const decoded = atob(m[1]);
      for (const e of decoded.matchAll(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi)) {
        const v = normEmail(e[0]);
        if (isPlausibleEmail(v)) found.add(v);
      }
    } catch { /* skip */ }
  }
  return Array.from(found);
}

// ─── Source 4 : Génération de patterns + vérification ────────────────
/**
 * Génère des emails probables à partir du nom du dirigeant et d'un
 * domaine candidat, puis vérifie chaque pattern via email-verify
 * (Captain Verify). S'arrête au 1er valid.
 *
 * Pour éviter de brûler trop de crédits, on limite à 6 patterns maximum
 * et on commence par les plus probables.
 */
function generatePatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = (firstName || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  const l = (lastName || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  if (!f || !l || !domain) return [];
  const d = domain.toLowerCase().replace(/^www\./, "");

  // Classement par probabilité (FR TPE) : prenom.nom > prenom > p.nom > contact
  const patterns = [
    `${f}.${l}@${d}`,
    `${f}@${d}`,
    `${f[0]}.${l}@${d}`,
    `${f}${l}@${d}`,
    `${l}.${f}@${d}`,
    `${l}@${d}`,
  ];
  // Dédoublonne en gardant l'ordre
  return Array.from(new Set(patterns));
}

async function verifyEmail(email: string, authHeader: string): Promise<"valid" | "risky" | "invalid" | "unknown"> {
  const res = await invokeEdgeAuthed("email-verify", { email }, authHeader);
  if (!res || !(res as { ok?: boolean }).ok) return "unknown";
  return ((res as { status?: string }).status as "valid" | "risky" | "invalid" | "unknown") || "unknown";
}

// ─── MOTEUR DE DÉCOUVERTE DE DOMAINE (le game-changer) ───────────────
/**
 * Beaucoup de TPE FR n'ont PAS de site web mais possèdent quand même un
 * nom de domaine avec une boîte mail (ex: la boulangerie a acheté
 * "boulangerie-martin.fr" chez OVH pour son email, sans jamais faire de
 * site). website-checker ne les voit pas (il cherche un site HTTP 200),
 * mais le domaine reçoit du courrier.
 *
 * Technique :
 *   1. On génère des domaines candidats depuis le nom commercial
 *   2. On vérifie lesquels ont un enregistrement MX (= reçoivent du mail)
 *      via DNS-over-HTTPS Cloudflare (fonctionne partout, pas de blocage)
 *   3. Sur les domaines vivants, on génère des patterns d'email et on
 *      les vérifie via Captain Verify
 *
 * 100% gratuit côté découverte (DNS), ne consomme des crédits Captain
 * Verify que sur des domaines réels → ROI excellent.
 */

/** DNS-over-HTTPS : le domaine a-t-il un serveur mail (MX) ? */
async function domainHasMX(domain: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      4000,
      { headers: { "Accept": "application/dns-json" } },
    );
    if (!res.ok) return false;
    const data = await res.json();
    // type 15 = MX. Si Answer contient au moins un MX → le domaine reçoit du mail.
    return Array.isArray(data?.Answer) && data.Answer.some((a: { type: number }) => a.type === 15);
  } catch {
    return false;
  }
}

/** Génère des domaines candidats plausibles depuis le nom commercial. */
function candidateDomains(companyName: string): string[] {
  const base = slugifyCompany(companyName); // "boulangerie-martin"
  if (!base || base.length < 3) return [];
  const variants = new Set<string>();
  variants.add(base);                       // boulangerie-martin
  variants.add(base.replace(/-/g, ""));     // boulangeriemartin
  const words = base.split("-").filter((w) => w.length >= 3);
  if (words.length > 1) {
    // le mot le plus distinctif (souvent le nom propre) = dernier mot
    variants.add(words[words.length - 1]);  // martin
    // deux derniers mots collés
    variants.add(words.slice(-2).join(""));
  }
  const tlds = [".fr", ".com", ".net", ".eu"];
  const domains: string[] = [];
  for (const v of variants) {
    if (v.length < 3) continue;
    for (const tld of tlds) domains.push(v + tld);
  }
  return Array.from(new Set(domains)).slice(0, 12);
}

/**
 * Découvre l'email via domaine : génère domaines → MX check → patterns → verify.
 * Retourne les candidats trouvés (vérifiés). Limite les crédits Captain Verify.
 */
async function discoverByDomain(
  companyName: string,
  firstName: string | undefined,
  lastName: string | undefined,
  authHeader: string,
  knownDomain: string | null,
): Promise<{ candidates: Candidate[]; live_domains: string[]; checked_domains: number }> {
  const generated = candidateDomains(companyName);
  // Le domaine du site (s'il existe) passe en tête : c'est le + sûr.
  const domains = knownDomain
    ? [knownDomain, ...generated.filter((d) => d !== knownDomain)]
    : generated;
  if (domains.length === 0) return { candidates: [], live_domains: [], checked_domains: 0 };

  // 1. MX check en parallèle (rapide, gratuit, DNS-over-HTTPS)
  const mxResults = await Promise.all(domains.map(async (d) => ({ d, mx: await domainHasMX(d) })));
  const liveDomains = mxResults.filter((r) => r.mx).map((r) => r.d);
  if (liveDomains.length === 0) {
    return { candidates: [], live_domains: [], checked_domains: domains.length };
  }

  // 2. Sur les domaines vivants → patterns → verify (budget crédits serré)
  const found: Candidate[] = [];
  let credits = 0;
  const MAX_CREDITS = 6;
  // Fallback : si aucun pattern n'est "valid"/"risky" mais qu'un domaine
  // reçoit bien du mail (MX confirmé), on propose quand même contact@domaine
  // en "à tester" — c'est l'adresse standard d'une TPE FR.
  let unknownFallback: Candidate | null = null;

  for (const domain of liveDomains) {
    const patterns: string[] = [];
    if (firstName && lastName) {
      patterns.push(...generatePatterns(firstName, lastName, domain).slice(0, 3));
    }
    patterns.push(`contact@${domain}`, `info@${domain}`);
    const uniq = Array.from(new Set(patterns));

    for (const p of uniq) {
      if (credits >= MAX_CREDITS) break;
      const status = await verifyEmail(p, authHeader);
      credits += 1;
      if (status === "valid") {
        found.push({ email: p, source: "domain_discovery", status: "valid", confidence: 95 });
        return { candidates: found, live_domains: liveDomains, checked_domains: domains.length };
      }
      if (status === "risky") {
        found.push({ email: p, source: "domain_discovery", status: "risky", confidence: 65 });
        break; // catch-all : contact@ est aussi bon qu'un autre
      }
      // garde le 1er contact@/info@ "à tester" sur un domaine MX confirmé
      if (status === "unknown" && !unknownFallback && /^(contact|info)@/.test(p)) {
        unknownFallback = { email: p, source: "domain_discovery", status: "unknown", confidence: 50 };
      }
    }
    if (credits >= MAX_CREDITS) break;
    if (found.length > 0) break;
  }

  if (found.length === 0 && unknownFallback) found.push(unknownFallback);
  return { candidates: found, live_domains: liveDomains, checked_domains: domains.length };
}

async function invokeEdgeAuthed<T = unknown>(name: string, body: unknown, authHeader: string): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader || `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ─── Orchestrateur principal ─────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();
  const authHeader = req.headers.get("Authorization") || `Bearer ${SUPABASE_ANON_KEY}`;

  let body: {
    company_name?: string;
    city?: string;
    website_url?: string;
    dirigeant_first_name?: string;
    dirigeant_last_name?: string;
    skip_verify?: boolean;
  };
  try { body = await req.json(); } catch { return json({ ok: false, error: "JSON invalide" }, 400); }

  if (!body.company_name) return json({ ok: false, error: "company_name requis" }, 400);

  const candidates: Candidate[] = [];
  const sourcesTried: string[] = [];

  // Domaine candidat depuis website_url (si fourni)
  let knownDomain: string | null = null;
  if (body.website_url) {
    try { knownDomain = new URL(body.website_url).hostname.replace(/^www\./, ""); } catch { /* skip */ }
  }

  // ─── Source 1 : scraper (si site connu) ──────────────────────────
  if (body.website_url) {
    sourcesTried.push("scraper");
    const r = await invokeEdge<{ email?: string; all_emails?: string[] }>("email-scraper", { url: body.website_url });
    const found = [r?.email, ...(r?.all_emails || [])].filter(Boolean) as string[];
    for (const e of found) {
      const n = normEmail(e);
      if (isPlausibleEmail(n)) {
        candidates.push({ email: n, source: "scraper", status: "not_verified", confidence: 85 });
      }
    }
  }

  // ─── Source 2 : Hunter (si domaine connu) ─────────────────────────
  if (knownDomain && candidates.length === 0) {
    sourcesTried.push("hunter");
    const r = await invokeEdge<{ email?: string }>("hunter-find", {
      action: "domain-search",
      params: { domain: knownDomain },
    });
    if (r?.email) {
      const n = normEmail(r.email);
      if (isPlausibleEmail(n)) {
        candidates.push({ email: n, source: "hunter", status: "not_verified", confidence: 70 });
      }
    }
  }

  // ─── Source 3 : Pattern sur domaine CONNU (si on a déjà le site) ──
  // Si website-checker a trouvé un site, on a un domaine sûr → on génère
  // direct les patterns dessus (plus fiable que la découverte à l'aveugle).
  if (
    candidates.length === 0
    && body.dirigeant_first_name
    && body.dirigeant_last_name
    && knownDomain
    && !body.skip_verify
  ) {
    sourcesTried.push("pattern");
    const patterns = generatePatterns(body.dirigeant_first_name, body.dirigeant_last_name, knownDomain);
    for (const p of patterns) {
      const status = await verifyEmail(p, authHeader);
      if (status === "valid") {
        candidates.push({ email: p, source: "pattern", status: "valid", confidence: 95 });
        break;
      }
      if (status === "risky") {
        candidates.push({ email: p, source: "pattern", status: "risky", confidence: 60 });
      }
    }
  }

  // ─── Source 4 : DÉCOUVERTE DE DOMAINE (le game-changer pour TPE) ──
  // Marche même SANS site web : génère des domaines candidats depuis le
  // nom commercial, garde ceux qui ont un serveur mail (MX), génère et
  // vérifie des patterns dessus. C'est ce qui débloque les boulangers/
  // coiffeurs qui ont un domaine email mais aucun site.
  const discoveryDebug: { live_domains?: string[]; checked_domains?: number } = {};
  if (candidates.length === 0 && body.company_name && !body.skip_verify) {
    sourcesTried.push("domain_discovery");
    const disc = await discoverByDomain(
      body.company_name,
      body.dirigeant_first_name,
      body.dirigeant_last_name,
      authHeader,
      knownDomain,
    );
    discoveryDebug.live_domains = disc.live_domains;
    discoveryDebug.checked_domains = disc.checked_domains;
    candidates.push(...disc.candidates);
  }

  // ─── Source 5 : Recherche web (DuckDuckGo HTML) — dernier recours ──
  // Le moins fiable (DDG rate-limit), placé en dernier filet de sécurité.
  const debugInfo: { web_queries?: string[]; web_emails_raw_count?: number } = {};
  if (candidates.length === 0 && body.company_name) {
    sourcesTried.push("web_search");
    const { emails, queries } = await searchWebForEmails(body.company_name, body.city || "");
    debugInfo.web_queries = queries;
    debugInfo.web_emails_raw_count = emails.length;
    for (const e of emails.slice(0, 3)) {
      candidates.push({ email: e, source: "web_search", status: "not_verified", confidence: 70 });
    }
  }

  // ─── Vérification finale du meilleur candidat ─────────────────────
  let best: Candidate | null = null;
  if (candidates.length > 0) {
    // Si on a déjà un vérifié valide → garde-le
    best = candidates.find((c) => c.status === "valid") || null;
    // Sinon vérifie le 1er non-vérifié
    if (!best && !body.skip_verify) {
      const top = candidates[0];
      const status = await verifyEmail(top.email, authHeader);
      top.status = status;
      if (status === "invalid") {
        // Essaie le suivant
        for (let i = 1; i < candidates.length; i++) {
          const next = candidates[i];
          const s2 = await verifyEmail(next.email, authHeader);
          next.status = s2;
          if (s2 === "valid" || s2 === "risky") { best = next; break; }
        }
        if (!best) best = candidates.find((c) => c.status !== "invalid") || null;
      } else {
        best = top;
      }
    } else if (!best) {
      best = candidates[0];
    }
  }

  return json({
    ok: true,
    email: best?.email || null,
    email_status: best?.status || null,
    email_source: best?.source || null,
    sources_tried: sourcesTried,
    candidates,
    debug: { ...debugInfo, ...discoveryDebug },
    duration_ms: Date.now() - t0,
  });
});
