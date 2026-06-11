/**
 * ─── Generate Teaser — Bande-annonce vidéo IA du commerce (Higgsfield) ─
 *
 * 1. Récupère la meilleure photo du commerce via Google Places
 * 2. La ré-héberge dans le bucket public `teasers` (URL propre + stable)
 * 3. L'envoie à Higgsfield DoP (image→vidéo cinématique 5s)
 * 4. Stocke une ligne prospect_teasers (status processing + generation_id)
 *
 * Le suivi du job (asynchrone) est fait par la fonction `teaser-status`.
 *
 * Secrets : GOOGLE_PLACES_API_KEY, HIGGSFIELD_API_KEY, HIGGSFIELD_API_SECRET
 * Body POST : { prospect_id: string, style?: "warm" | "premium", model?: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
const HF_KEY = Deno.env.get("HIGGSFIELD_API_KEY");
const HF_SECRET = Deno.env.get("HIGGSFIELD_API_SECRET");
const HF_BASE = "https://platform.higgsfield.ai";

// Cherche la meilleure photo du commerce sur Google Places.
async function findStorefrontPhotoUrl(company: string, location: string | null): Promise<string | null> {
  if (!PLACES_KEY) return null;
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": "places.photos,places.displayName" },
      body: JSON.stringify({ textQuery: location ? `${company} ${location}` : company, languageCode: "fr", maxResultCount: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data.places?.[0]?.photos?.[0];
    if (!photo?.name) return null;
    return `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=1600&maxWidthPx=2400&key=${PLACES_KEY}`;
  } catch { return null; }
}

function buildPrompt(style: string): string {
  const base = "Cinematic 5-second reveal of this local business. Slow, smooth camera push-in with gentle parallax. Photorealistic, faithful to the scene, no text overlays, no distortion, no people morphing.";
  if (style === "premium") return `${base} Elegant high-end refined mood, soft contrast, sophisticated atmosphere.`;
  return `${base} Warm golden-hour light, inviting and welcoming atmosphere, cozy and human.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!HF_KEY || !HF_SECRET) return json({ ok: false, error: "Higgsfield non configuré" }, 500);
    const { prospect_id, style = "warm", model = "dop-turbo" } = await req.json();
    if (!prospect_id) return json({ ok: false, error: "prospect_id requis" }, 400);

    // Auth de l'appelant (pour owner_id)
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const ownerId = u?.user?.id;
    if (!ownerId) return json({ ok: false, error: "Non authentifié" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prospect } = await admin.from("prospects").select("company, last_name, location, first_name").eq("id", prospect_id).maybeSingle();
    if (!prospect) return json({ ok: false, error: "Prospect introuvable" }, 404);
    const company = prospect.company || prospect.last_name || "";

    // 1. Photo Google
    const photoUrl = await findStorefrontPhotoUrl(company, prospect.location);
    if (!photoUrl) return json({ ok: false, error: "Aucune photo trouvée pour ce commerce sur Google. Le téaser a besoin d'une image de la devanture." }, 422);

    // 2. Ré-héberge la photo (URL propre, sans notre clé)
    const imgRes = await fetch(photoUrl);
    if (!imgRes.ok) return json({ ok: false, error: "Téléchargement de la photo impossible" }, 502);
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
    const imgPath = `${prospect_id}/${Date.now()}-src.jpg`;
    const up = await admin.storage.from("teasers").upload(imgPath, imgBytes, { contentType: "image/jpeg", upsert: true });
    if (up.error) return json({ ok: false, error: "Upload image: " + up.error.message }, 500);
    const publicImageUrl = `${SUPABASE_URL}/storage/v1/object/public/teasers/${imgPath}`;

    // 3. Higgsfield image→vidéo
    const prompt = buildPrompt(style);
    const hfRes = await fetch(`${HF_BASE}/v1/image2video/dop`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${HF_KEY}:${HF_SECRET}`,
        "User-Agent": "wyngo-server/1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params: { model, prompt, input_images: [{ type: "image_url", image_url: publicImageUrl }] } }),
    });
    const hfText = await hfRes.text();
    let hfData: Record<string, unknown> = {};
    try { hfData = JSON.parse(hfText); } catch { /* */ }
    if (!hfRes.ok) {
      console.log("[generate-teaser] Higgsfield error", hfRes.status, hfText.slice(0, 300));
      const msg = hfRes.status === 402 || /credit/i.test(hfText) ? "Crédits Higgsfield insuffisants — recharge ton compte." : `Higgsfield ${hfRes.status}: ${hfText.slice(0, 200)}`;
      return json({ ok: false, error: msg }, 502);
    }

    // L'id du job peut être à différents endroits selon l'API
    const genId = (hfData.id || hfData.request_id || hfData.job_set_id
      || (Array.isArray(hfData.jobs) ? (hfData.jobs[0] as { id?: string })?.id : undefined)) as string | undefined;
    console.log("[generate-teaser] HF response:", JSON.stringify(hfData).slice(0, 400));

    // 4. Stocke la ligne
    const { data: row, error: insErr } = await admin.from("prospect_teasers").insert({
      prospect_id, owner_id: ownerId, status: "processing", provider: "higgsfield",
      generation_id: genId || null, source_image_url: publicImageUrl, prompt,
    }).select("id").single();
    if (insErr) return json({ ok: false, error: insErr.message }, 500);

    return json({ ok: true, teaser_id: row.id, generation_id: genId, raw: hfData });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
