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
};

/**
 * Recherche textuelle Places API (Text Search) — le mieux pour matcher "nom + ville".
 * Doc : https://developers.google.com/maps/documentation/places/web-service/text-search
 */
async function placesTextSearch(query: string): Promise<PlaceResult | null> {
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

  // On prend le 1er résultat (Google trie déjà par pertinence). On pourrait
  // ajouter du fuzzy matching mais en pratique c'est suffisant.
  const p = places[0];

  return {
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
    website: p.websiteUri || null,
    address: p.formattedAddress || null,
    rating: p.rating ?? null,
    user_ratings: p.userRatingCount ?? null,
    place_id: p.id ?? null,
    business_status: p.businessStatus ?? null,
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

    const place = await placesTextSearch(query);

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
