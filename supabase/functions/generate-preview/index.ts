/**
 * ─── generate-preview — Aperçu Instantané ─────────────────────────────────
 *
 * Pipeline complet pour générer en ~15 secondes un site web preview perso :
 *
 *   1. Récupère le prospect (Supabase)
 *   2. Enrichit via Google Places (photos HD, reviews, horaires)
 *   3. Détecte le secteur (NAF / mots-clés société)
 *   4. Génère le COPY via Claude (titre, tagline, about, services, CTA)
 *      → on génère JUSTE le texte, pas le HTML (10× plus rapide + fiable)
 *   5. Injecte le copy + photos + horaires dans un template HTML+Tailwind
 *   6. Upload sur Supabase Storage (bucket `previews`)
 *   7. Insère une ligne dans `prospect_previews` avec slug + URL publique
 *   8. Retourne { url, slug, preview } au client
 *
 * Body : { prospect_id: string, force_refresh?: boolean }
 * Auth : JWT du commercial (RLS check via owner_id)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ════════════════════════════════════════════════════════════════════
// Détection du secteur depuis le code NAF ou le nom de la société
// ════════════════════════════════════════════════════════════════════

type Sector = "boulangerie" | "restaurant" | "coiffure" | "commerce" | "artisan" | "service";

function detectSector(naf: string | null, company: string | null, industry: string | null): Sector {
  const text = `${naf || ""} ${company || ""} ${industry || ""}`.toLowerCase();

  // Codes NAF prioritaires (plus précis)
  if (naf) {
    if (/^10\.71|^47\.24/.test(naf)) return "boulangerie";
    if (/^56\.1|^56\.10/.test(naf)) return "restaurant";
    if (/^96\.02/.test(naf)) return "coiffure";
    if (/^47\./.test(naf)) return "commerce";
    if (/^43\.|^45\.20/.test(naf)) return "artisan";
  }

  // Fallback sur les mots-clés
  if (/boulanger|patisserie|pâtisserie|pain/.test(text)) return "boulangerie";
  if (/restaur|brasserie|bistrot|pizza|kebab|trattoria/.test(text)) return "restaurant";
  if (/coiff|barbier|salon de beaut|estheti/.test(text)) return "coiffure";
  if (/artisan|maçon|plomb|électric|peintre|menuis/.test(text)) return "artisan";
  if (/magasin|boutique|épicerie|fleurist|librairie/.test(text)) return "commerce";

  return "service";
}

const SECTOR_THEME: Record<Sector, { primary: string; accent: string; bg: string; emoji: string; serif: boolean }> = {
  boulangerie: { primary: "#8B4513", accent: "#D2691E", bg: "#FFF8E7", emoji: "🥐", serif: true },
  restaurant: { primary: "#8B0000", accent: "#DC143C", bg: "#FFFBF0", emoji: "🍽️", serif: true },
  coiffure: { primary: "#4A148C", accent: "#9C27B0", bg: "#FAF5FF", emoji: "✂️", serif: false },
  commerce: { primary: "#1565C0", accent: "#42A5F5", bg: "#F5F9FF", emoji: "🛍️", serif: false },
  artisan: { primary: "#37474F", accent: "#FF6F00", bg: "#FAFAFA", emoji: "🔨", serif: false },
  service: { primary: "#1A237E", accent: "#3F51B5", bg: "#F5F5F8", emoji: "✨", serif: false },
};

// ════════════════════════════════════════════════════════════════════
// Google Places enrichissement
// ════════════════════════════════════════════════════════════════════

async function fetchPlacesData(company: string, location: string | null): Promise<{
  photos: string[];
  reviews: Array<{ author: string; rating: number; text: string }>;
  rating?: number;
  hours?: string[];
  phone?: string;
  address?: string;
}> {
  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!apiKey) return { photos: [], reviews: [] };

  try {
    const query = location ? `${company} ${location}` : company;
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.regularOpeningHours,places.nationalPhoneNumber,places.photos,places.reviews",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "fr", maxResultCount: 1 }),
    });

    if (!searchRes.ok) return { photos: [], reviews: [] };
    const data = await searchRes.json();
    const place = data.places?.[0];
    if (!place) return { photos: [], reviews: [] };

    // Construire les URLs de photos (max 4 photos, HD)
    const photos: string[] = [];
    for (const p of (place.photos || []).slice(0, 4)) {
      photos.push(
        `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=1200&maxWidthPx=1600&key=${apiKey}`
      );
    }

    const reviews = (place.reviews || []).slice(0, 3).map((r: any) => ({
      author: r.authorAttribution?.displayName || "Client",
      rating: r.rating || 5,
      text: r.text?.text || "",
    }));

    return {
      photos,
      reviews,
      rating: place.rating,
      hours: place.regularOpeningHours?.weekdayDescriptions || [],
      phone: place.nationalPhoneNumber,
      address: place.formattedAddress,
    };
  } catch (e) {
    console.error("Places fetch failed:", e);
    return { photos: [], reviews: [] };
  }
}

// ════════════════════════════════════════════════════════════════════
// Génération du COPY via Claude
// ════════════════════════════════════════════════════════════════════

type CopyOutput = {
  hero_title: string;          // grand titre h1
  hero_tagline: string;        // sous-titre court
  about_title: string;         // titre section "à propos"
  about_text: string;          // 2-3 phrases sur l'entreprise
  services: Array<{ title: string; description: string }>; // 3 services/produits clés
  cta_text: string;            // bouton CTA principal ("Réserver", "Commander", etc.)
};

async function generateCopy(input: {
  company: string;
  sector: Sector;
  city?: string | null;
  rating?: number;
  hours?: string[];
  reviews_excerpt?: string;
}): Promise<{ copy: CopyOutput; model: string }> {
  const reviewsBlock = input.reviews_excerpt
    ? `\n\nExtrait d'avis clients réels :\n${input.reviews_excerpt}`
    : "";

  const prompt = `Tu rédiges le copy d'un site web vitrine pour une entreprise française.

Entreprise : ${input.company}
Secteur : ${input.sector}
${input.city ? `Ville : ${input.city}` : ""}
${input.rating ? `Note Google : ${input.rating}/5` : ""}
${reviewsBlock}

Tu dois rédiger un COPY chaleureux, authentique, ancré dans le local (mentionne la ville si fournie), qui donne envie. Pas de blabla marketing creux. Ton : pro mais humain.

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "hero_title": "Titre h1 (3-6 mots, percutant)",
  "hero_tagline": "Sous-titre (10-15 mots, valeur ajoutée)",
  "about_title": "Titre section À propos (2-4 mots)",
  "about_text": "Paragraphe 2-3 phrases (60-100 mots), parle au 'nous', évoque le savoir-faire, l'ancrage local",
  "services": [
    {"title": "Service/produit 1", "description": "1 phrase courte"},
    {"title": "Service/produit 2", "description": "1 phrase courte"},
    {"title": "Service/produit 3", "description": "1 phrase courte"}
  ],
  "cta_text": "Texte du bouton principal (1-3 mots, ex: 'Réserver une table')"
}`;

  // ── Provider 1 : Claude Sonnet 4.6 (qualité MAX, ton FR naturel et chaleureux)
  //    Coût ~0,003€ par génération → négligeable vs la valeur de la conversion.
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Claude API ${res.status}: ${t}`);
    }
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Pas de JSON dans la réponse Claude");
    const copy = JSON.parse(jsonMatch[0]) as CopyOutput;
    return { copy, model: "claude-sonnet-4-6" };
  }

  // ── Provider 2 : Gemini 2.5 Flash (fallback rapide & cheap si Claude absent)
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            response_mime_type: "application/json",
            response_schema: {
              type: "object",
              properties: {
                hero_title: { type: "string" },
                hero_tagline: { type: "string" },
                about_title: { type: "string" },
                about_text: { type: "string" },
                services: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["title", "description"],
                  },
                },
                cta_text: { type: "string" },
              },
              required: ["hero_title", "hero_tagline", "about_title", "about_text", "services", "cta_text"],
            },
          },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini API ${res.status}: ${t}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Pas de JSON dans la réponse Gemini");
    const copy = JSON.parse(jsonMatch[0]) as CopyOutput;
    return { copy, model: "gemini-2.5-flash" };
  }

  throw new Error("Aucune clé IA configurée (ANTHROPIC_API_KEY ou GEMINI_API_KEY)");
}

// ════════════════════════════════════════════════════════════════════
// Génération du HTML — template universel paramétré par secteur
// ════════════════════════════════════════════════════════════════════

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(input: {
  company: string;
  sector: Sector;
  copy: CopyOutput;
  photos: string[];
  hours: string[];
  phone?: string;
  address?: string;
  rating?: number;
  reviews: Array<{ author: string; rating: number; text: string }>;
  slug: string;
  preview_id: string;
  supabase_url: string;
}): string {
  const theme = SECTOR_THEME[input.sector];
  const heroPhoto = input.photos[0] || `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600`;
  const otherPhotos = input.photos.slice(1, 4);
  const company = escapeHtml(input.company);

  // Ping pour tracking de l'ouverture (fire-and-forget)
  const trackingScript = `
    <script>
      try {
        fetch("${input.supabase_url}/functions/v1/preview-ping", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({preview_id: "${input.preview_id}"})
        });
      } catch(e){}
    </script>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${company}</title>
  <meta name="description" content="${escapeHtml(input.copy.hero_tagline)}">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${theme.serif ? "Playfair+Display:wght@400;700;900" : "Inter:wght@400;500;600;700;800"}&display=swap" rel="stylesheet">
  <style>
    body { font-family: ${theme.serif ? "'Playfair Display', serif" : "'Inter', sans-serif"}; background: ${theme.bg}; }
    .ink { color: ${theme.primary}; }
    .bg-primary { background: ${theme.primary}; }
    .bg-accent { background: ${theme.accent}; }
    .border-primary { border-color: ${theme.primary}; }
    .hover-accent:hover { background: ${theme.accent}; }
    .photo-frame { box-shadow: 0 25px 50px -12px rgba(0,0,0,.25); }
    .wyngo-watermark {
      position: fixed; bottom: 16px; right: 16px; z-index: 50;
      background: rgba(0,0,0,.7); color: white; font-size: 11px;
      padding: 6px 12px; border-radius: 999px; backdrop-filter: blur(8px);
      font-family: 'Inter', sans-serif;
    }
  </style>
</head>
<body>

  <!-- HERO -->
  <header class="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden">
    <div class="absolute inset-0">
      <img src="${heroPhoto}" alt="${company}" class="w-full h-full object-cover">
      <div class="absolute inset-0" style="background: linear-gradient(135deg, ${theme.primary}cc 0%, transparent 60%, ${theme.accent}99 100%);"></div>
    </div>
    <div class="relative z-10 text-center text-white max-w-4xl mx-auto px-6">
      <div class="text-6xl mb-4">${theme.emoji}</div>
      <h1 class="text-5xl md:text-7xl font-bold mb-6 drop-shadow-2xl">${escapeHtml(input.copy.hero_title)}</h1>
      <p class="text-xl md:text-2xl mb-8 drop-shadow-lg max-w-2xl mx-auto">${escapeHtml(input.copy.hero_tagline)}</p>
      <a href="#contact" class="inline-block bg-white ink px-8 py-4 rounded-full text-lg font-semibold hover:scale-105 transition shadow-2xl">${escapeHtml(input.copy.cta_text)}</a>
      ${input.rating ? `<div class="mt-8 inline-flex items-center gap-2 bg-white/95 ink px-4 py-2 rounded-full text-sm font-medium shadow-lg"><span>${"★".repeat(Math.round(input.rating))}</span><span>${input.rating.toFixed(1)}/5 sur Google</span></div>` : ""}
    </div>
  </header>

  <!-- ABOUT -->
  <section class="py-20 px-6">
    <div class="max-w-4xl mx-auto text-center">
      <h2 class="text-4xl md:text-5xl font-bold ink mb-8">${escapeHtml(input.copy.about_title)}</h2>
      <p class="text-lg md:text-xl leading-relaxed text-gray-700">${escapeHtml(input.copy.about_text)}</p>
    </div>
  </section>

  <!-- SERVICES / PRODUITS -->
  <section class="py-20 px-6 bg-white">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-4xl md:text-5xl font-bold ink text-center mb-16">Nos spécialités</h2>
      <div class="grid md:grid-cols-3 gap-8">
        ${input.copy.services.map((s, i) => `
          <div class="text-center">
            ${otherPhotos[i] ? `<img src="${otherPhotos[i]}" alt="${escapeHtml(s.title)}" class="w-full h-64 object-cover rounded-2xl photo-frame mb-6">` : `<div class="w-full h-64 rounded-2xl mb-6 flex items-center justify-center bg-primary/10 text-6xl">${theme.emoji}</div>`}
            <h3 class="text-2xl font-bold ink mb-3">${escapeHtml(s.title)}</h3>
            <p class="text-gray-600">${escapeHtml(s.description)}</p>
          </div>
        `).join("")}
      </div>
    </div>
  </section>

  ${input.reviews.length > 0 ? `
  <!-- REVIEWS GOOGLE -->
  <section class="py-20 px-6">
    <div class="max-w-6xl mx-auto">
      <h2 class="text-4xl md:text-5xl font-bold ink text-center mb-4">Ce que disent nos clients</h2>
      <p class="text-center text-gray-500 mb-12 text-sm">Avis Google vérifiés</p>
      <div class="grid md:grid-cols-${input.reviews.length} gap-6">
        ${input.reviews.map((r) => `
          <div class="bg-white p-6 rounded-2xl shadow-lg border-l-4 border-primary">
            <div class="text-yellow-500 mb-2">${"★".repeat(Math.round(r.rating))}</div>
            <p class="text-gray-700 mb-4 italic">"${escapeHtml(r.text.slice(0, 200))}${r.text.length > 200 ? "…" : ""}"</p>
            <p class="text-sm font-semibold ink">— ${escapeHtml(r.author)}</p>
          </div>
        `).join("")}
      </div>
    </div>
  </section>
  ` : ""}

  <!-- CONTACT / HORAIRES -->
  <section id="contact" class="py-20 px-6 bg-primary text-white">
    <div class="max-w-4xl mx-auto grid md:grid-cols-2 gap-12">
      ${input.hours.length > 0 ? `
      <div>
        <h3 class="text-3xl font-bold mb-6">Horaires</h3>
        <ul class="space-y-2 text-lg">
          ${input.hours.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}
        </ul>
      </div>
      ` : ""}
      <div>
        <h3 class="text-3xl font-bold mb-6">Nous trouver</h3>
        ${input.address ? `<p class="text-lg mb-4">${escapeHtml(input.address)}</p>` : ""}
        ${input.phone ? `<a href="tel:${escapeHtml(input.phone)}" class="inline-block bg-white text-primary px-6 py-3 rounded-full font-semibold hover:scale-105 transition" style="color:${theme.primary}">📞 ${escapeHtml(input.phone)}</a>` : ""}
      </div>
    </div>
  </section>

  <footer class="py-8 text-center text-sm text-gray-500">
    © ${new Date().getFullYear()} ${company}
  </footer>

  <!-- Watermark Wyngo (preview only) -->
  <div class="wyngo-watermark">
    ✨ Aperçu Wyngo · Votre vrai site en 7 jours
  </div>

  ${trackingScript}
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════════
// Slug builder
// ════════════════════════════════════════════════════════════════════

function makeSlug(company: string): string {
  const base = company
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 5);
  return `${base}-${suffix}`;
}

// ════════════════════════════════════════════════════════════════════
// Handler
// ════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Auth requise" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client RLS pour vérifier que l'user a le droit de toucher au prospect
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "User invalide" }), { status: 401, headers: corsHeaders });

    const { prospect_id, force_refresh } = await req.json();
    if (!prospect_id) return new Response(JSON.stringify({ error: "prospect_id requis" }), { status: 400, headers: corsHeaders });

    // 1. Charger le prospect (RLS vérifie l'ownership)
    const { data: prospect, error: pErr } = await userClient.from("prospects").select("*").eq("id", prospect_id).single();
    if (pErr || !prospect) {
      return new Response(JSON.stringify({ error: "Prospect introuvable ou pas autorisé" }), { status: 404, headers: corsHeaders });
    }

    // 2. Si un preview récent existe et qu'on ne force pas → on le retourne tel quel
    if (!force_refresh) {
      const { data: existing } = await userClient
        .from("prospect_previews")
        .select("*")
        .eq("prospect_id", prospect_id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing && new Date(existing.generated_at).getTime() > Date.now() - 24 * 3600 * 1000) {
        return new Response(JSON.stringify({ cached: true, ...existing }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const company = prospect.company || `${prospect.first_name} ${prospect.last_name}`;
    const city = prospect.location?.split(/[, ]/).find((s: string) => /^[A-ZÉÈÀÂ]/.test(s)) || prospect.location || null;

    // 3. Google Places
    const places = await fetchPlacesData(company, prospect.location);

    // 4. Détection secteur
    const sector = detectSector(prospect.naf || null, company, prospect.industry || null);

    // 5. Génération du COPY par Claude
    const reviewsExcerpt = places.reviews.slice(0, 2).map((r) => `- "${r.text.slice(0, 150)}"`).join("\n");
    const { copy, model } = await generateCopy({
      company,
      sector,
      city,
      rating: places.rating,
      hours: places.hours,
      reviews_excerpt: reviewsExcerpt,
    });

    // 6. Construction du HTML
    const slug = makeSlug(company);
    const previewId = crypto.randomUUID();
    const html = buildHtml({
      company,
      sector,
      copy,
      photos: places.photos,
      hours: places.hours || [],
      phone: places.phone || prospect.phone || undefined,
      address: places.address || prospect.location || undefined,
      rating: places.rating,
      reviews: places.reviews,
      slug,
      preview_id: previewId,
      supabase_url: supabaseUrl,
    });

    // 7. Upload sur Storage avec service role (bypass RLS pour l'écriture)
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const storagePath = `${slug}.html`;
    // ⚠️ Pas de "; charset=utf-8" → certains buckets Storage rejettent ce mime
    // (validation stricte sur allowed_mime_types). Le HTML déclare déjà
    // <meta charset="UTF-8"> donc tout marche pareil côté browser.
    const htmlBytes = new TextEncoder().encode(html);
    const { error: upErr } = await serviceClient.storage.from("previews").upload(storagePath, htmlBytes, {
      contentType: "text/html",
      upsert: true,
    });
    if (upErr) throw new Error(`Storage upload : ${upErr.message}`);

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/previews/${storagePath}`;

    // 8. Insertion en base
    const { data: row, error: insErr } = await serviceClient
      .from("prospect_previews")
      .insert({
        id: previewId,
        prospect_id,
        slug,
        html_url: publicUrl,
        sector,
        template: `template_${sector}`,
        model,
        source_data: { places, copy, prospect_snapshot: { company, city, naf: prospect.naf } },
        generated_by: user.id,
      })
      .select()
      .single();
    if (insErr) throw new Error(`Insert preview : ${insErr.message}`);

    return new Response(
      JSON.stringify({
        ok: true,
        preview_id: row.id,
        slug,
        url: publicUrl,
        sector,
        model,
        photos_used: places.photos.length,
        reviews_used: places.reviews.length,
        copy_preview: { hero_title: copy.hero_title, hero_tagline: copy.hero_tagline },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
