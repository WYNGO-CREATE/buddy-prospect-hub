/**
 * ─── Places Enrich — Téléphone + site via Google Maps ───
 *
 * Pour une entreprise donnée (nom + ville), interroge Google Places API
 * pour récupérer son téléphone, son site web officiel, son adresse précise
 * et sa note Google. Couvre ~95% des TPE actives en France.
 *
 * Clé en secret Supabase : GOOGLE_PLACES_API_KEY
 *   - Crée un projet Google Cloud (ou réutilise "Wyngo CRM")
 *   - Active "Places API (New)" via la marketplace
 *   - Crée une clé API restreinte à Places API
 *   - 200$ de crédit gratuit/mois Google = ~10k requêtes/mois gratuites
 *
 * Body POST :
 *   { name: string, city?: string, code_postal?: string }
 *
 * Réponse :
 *   { ok: true, place?: { phone, website, address, rating, place_id } }
 *
 * Si plusieurs candidats → on prend le mieux noté avec la match name la plus
 * proche du nom recherché.
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

const PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
const PLACES_BASE = "https://places.googleapis.com/v1";

type PlaceResult = {
  phone: string | null;
  website: string | null;
  address: string | null;
  rating: number | null;
  user_ratings: number | null;
  place_id: string | null;
  business_status: string | null;
  matched_name: string | null;   // displayName du place retenu (debug)
  match_confidence: number;      // 0-1 : score de fiabilité du match
  rejected_reason?: string;      // si on a rejeté (mismatch) → phone & website mis à null
};

// ─── HELPERS DE MATCHING ──────────────────────────────────────────────
function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(sarl|sas|sasu|eurl|sa|snc|scop|sci|ei|eirl|gie|ets|etablissements|monsieur|madame)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(name: string): string[] {
  return normalizeBusinessName(name).split(" ").filter((t) => t.length >= 4);
}

/**
 * Match score entre 2 noms d'entreprise (0 = pas match, 1 = match parfait).
 *  - tokens longs (5+ chars) partagés → signal fort
 *  - couples de tokens courts (4 chars) partagés → signal moyen
 */
function matchScore(pappersName: string, placesName: string): number {
  const pappersTokens = significantTokens(pappersName);
  const placesNorm = normalizeBusinessName(placesName);
  if (pappersTokens.length === 0) return 0;
  const shared = pappersTokens.filter((t) => placesNorm.includes(t));
  if (shared.length === 0) return 0;
  const sharedLong = shared.filter((t) => t.length >= 5);
  if (sharedLong.length >= 2) return 1.0;
  if (sharedLong.length === 1 && shared.length >= 2) return 0.85;
  if (sharedLong.length === 1) return 0.7;
  if (shared.length >= 3) return 0.7;
  if (shared.length === 2) return 0.55;
  return 0.4;
}

/** Le code postal de l'adresse Places matche-t-il le CP demandé ? */
function addressMatchesPostalCode(address: string | null | undefined, expectedCp: string | null | undefined): boolean | null {
  if (!expectedCp) return null; // pas de critère → pas de check
  if (!address) return false;
  // CP français = 5 chiffres dans l'adresse
  const cpInAddress = address.match(/\b(\d{5})\b/);
  if (!cpInAddress) return false;
  return cpInAddress[1].startsWith(expectedCp.slice(0, 2));
}

/**
 * Recherche textuelle Places API (Text Search) — le mieux pour matcher "nom + ville".
 * Doc : https://developers.google.com/maps/documentation/places/web-service/text-search
 */
async function placesTextSearch(
  query: string,
  searchedName: string,
  expectedPostalCode?: string,
): Promise<PlaceResult | null> {
  if (!PLACES_API_KEY) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY non configurée. Ajoute-la dans Supabase Edge Functions Secrets.",
    );
  }

  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_API_KEY,
      // Field mask : ne demande que ce dont on a besoin (réduit coût + latence)
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.websiteUri",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "fr",
      regionCode: "FR",
      maxResultCount: 3, // on prend le top 3 et on choisit le meilleur match
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[places-enrich] API error", res.status, errText);
    throw new Error(`Google Places ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const places = (data.places || []) as Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
  }>;

  if (places.length === 0) return null;

  // ═══ FUZZY MATCH STRICT ═══
  // On parcourt les 3 candidats et on score chaque match contre le nom
  // Pappers. Si AUCUN n'a un score suffisant, on rejette toutes les données
  // (phone/website) — mieux vaut renvoyer null que d'attribuer le numéro
  // d'une autre entreprise au prospect.
  let best: { place: typeof places[0]; score: number } | null = null;
  for (const p of places) {
    const placeName = p.displayName?.text || "";
    if (!placeName) continue;
    const score = matchScore(searchedName, placeName);
    if (!best || score > best.score) best = { place: p, score };
  }
  if (!best) return null;

  // ─── Décision finale ─────────────────────────────────────────────────
  // - Score >= 0.7   : on garde tout (phone, website, address)
  // - Score 0.55-0.7 : on garde adresse/rating, mais on N'AFFECTE PAS le
  //                   phone/website (risque de mauvaise attribution)
  // - Score < 0.55   : on rejette tout, place_id à null
  const p = best.place;
  const score = best.score;

  // En plus, vérifier que le code postal matche (si fourni)
  const cpOk = expectedPostalCode
    ? addressMatchesPostalCode(p.formattedAddress, expectedPostalCode)
    : null;
  if (cpOk === false && score < 1.0) {
    // CP non-matchant + match non-parfait → trop risqué, on rejette tout
    return {
      phone: null, website: null,
      address: p.formattedAddress || null,
      rating: null, user_ratings: null,
      place_id: null,
      business_status: null,
      matched_name: p.displayName?.text || null,
      match_confidence: score,
      rejected_reason: `cp_mismatch (score=${score.toFixed(2)})`,
    };
  }

  if (score < 0.55) {
    return {
      phone: null, website: null, address: null,
      rating: null, user_ratings: null,
      place_id: null, business_status: null,
      matched_name: p.displayName?.text || null,
      match_confidence: score,
      rejected_reason: `low_match_score (${score.toFixed(2)})`,
    };
  }

  const phoneTrusted = score >= 0.7;
  return {
    phone: phoneTrusted ? (p.nationalPhoneNumber || p.internationalPhoneNumber || null) : null,
    website: phoneTrusted ? (p.websiteUri || null) : null,
    address: p.formattedAddress || null,
    rating: p.rating ?? null,
    user_ratings: p.userRatingCount ?? null,
    place_id: p.id ?? null,
    business_status: p.businessStatus ?? null,
    matched_name: p.displayName?.text || null,
    match_confidence: score,
    rejected_reason: phoneTrusted ? undefined : `weak_match_no_contact_data (${score.toFixed(2)})`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { name, city, code_postal } = await req.json();
    if (!name) return json({ error: "name requis" }, 400);

    // Compose une query "nom + ville [+ code postal]" pour matcher au mieux
    const queryParts = [name];
    if (city) queryParts.push(city);
    if (code_postal && !city) queryParts.push(code_postal);
    const query = queryParts.join(" ");

    const place = await placesTextSearch(query, name, code_postal);

    return json({
      ok: true,
      place,
      query,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[places-enrich]", msg);
    return json({ error: msg }, 500);
  }
});
