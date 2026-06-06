/**
 * ─── generate-preview v2 — Aperçu Instantané (template "agency-level") ───
 *
 * Pipeline en ~15s :
 *   1. Charge le prospect (RLS vérifie l'owner)
 *   2. Enrichit via Google Places (photos HD, reviews, horaires)
 *   3. Détecte le secteur (NAF / mots-clés société)
 *   4. Génère le COPY riche via Claude Sonnet 4.6 (titre, signature_phrase,
 *      services + descriptions, valeurs, CTAs primaire & secondaire)
 *      → Gemini en fallback si Anthropic indisponible
 *   5. Injecte le copy + photos + horaires dans un template HTML+Tailwind
 *      paramétré par secteur (typo, palette, vibe — boulangerie/restaurant/...)
 *   6. Upload sur Supabase Storage (bucket `previews` public, content-type
 *      text/html via Blob)
 *   7. Insère une ligne dans `prospect_previews` avec slug + URL publique
 *   8. Retourne { url, slug, preview_id, sector, model, ... } au client
 *
 * Le HTML généré inclut :
 *   • Open Graph + Twitter Card pour preview riche dans iMessage/Mail/WhatsApp
 *   • Tracking opened_at + view_count via /functions/v1/preview-ping
 *   • Phone CTA flottant mobile, watermark Wyngo discret
 *   • Reveal animations au scroll, photo hero pleine page, gallery masonry
 *   • Mobile-first (clamp() pour les titres, container queries pour le layout)
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
// SECTEURS — détection + thèmes (palette, typo, emoji)
// ════════════════════════════════════════════════════════════════════

type Sector = "boulangerie" | "restaurant" | "coiffure" | "commerce" | "artisan" | "service";

/**
 * Détection sector enrichie : matche d'abord les codes NAF connus (couverture
 * 60+ métiers du catalogue), puis fallback sur mots-clés du nom/industrie.
 * Si le brief contient un `trade_label` précis on le respecte en priorité.
 */
function detectSector(naf: string | null, company: string | null, industry: string | null): Sector {
  const text = `${naf || ""} ${company || ""} ${industry || ""}`.toLowerCase();

  if (naf) {
    const n = naf.toUpperCase().trim();
    // ── BOULANGERIE / PÂTISSERIE / CONFISERIE ──
    if (/^10\.71|^10\.72|^10\.82|^47\.24/.test(n)) return "boulangerie";
    // ── RESTAURATION ──
    if (/^56\.1|^56\.21|^56\.29|^56\.30/.test(n)) return "restaurant";
    // ── BEAUTÉ / COIFFURE / SPA ──
    if (/^96\.02|^96\.04/.test(n)) return "coiffure";
    // ── BÂTIMENT / ARTISANAT ──
    if (/^43\.|^41\.|^45\.20|^25\.71|^81\.30/.test(n)) return "artisan";
    // ── PHARMACIE → service (santé) ──
    if (/^47\.73/.test(n)) return "service";
    // ── COMMERCE DE DÉTAIL ──
    if (/^47\.[2-7]/.test(n)) return "commerce";
    // ── SANTÉ ──
    if (/^86\.|^75\.00|^87\./.test(n)) return "service";
    // ── SERVICES PRO ──
    if (/^69\.|^70\.|^71\.|^72\.|^73\.|^74\.|^62\.|^63\./.test(n)) return "service";
    // ── ENSEIGNEMENT / SPORT / LOISIRS ──
    if (/^85\.|^93\./.test(n)) return "service";
    // ── IMMOBILIER ──
    if (/^68\./.test(n)) return "service";
    // ── SERVICES PERSONNELS (pressing, cordonnerie, etc.) ──
    if (/^96\.01|^95\.|^96\.03|^96\.09/.test(n)) return "service";
  }

  // Fallback mots-clés (étendu)
  if (/boulanger|patisserie|pâtisserie|pain|viennois|chocolat|confiseur|confiserie/.test(text)) return "boulangerie";
  if (/restaur|brasserie|bistrot|pizza|kebab|trattoria|crêperie|crêpe|food|traiteur|salon de th[éè]|bar\b|caf[éè]/.test(text)) return "restaurant";
  if (/coiff|barbier|salon de beaut|esth[éè]ti|onglerie|spa\b|massage|tatoueur|perceur/.test(text)) return "coiffure";
  if (/artisan|ma[çc]on|plomb|[ée]lectric|peintre|menuis|charpent|carrelage|carreleur|couvreur|isolat|paysag|jardinier|garagiste|carrossier|serrur|chauffagiste/.test(text)) return "artisan";
  if (/magasin|boutique|[ée]picerie|fleurist|librairie|caviste|fromag|boucher|charcut|poissonner|primeur|opticien|bijout|maroquin|libraire|antiquaire/.test(text)) return "commerce";
  return "service";
}

type ThemeConfig = {
  primary: string; accent: string; bg: string; surface: string;
  emoji: string;
  displayFont: string; bodyFont: string;
  vibeDescription: string; // pour le prompt IA
};

const SECTOR_THEME: Record<Sector, ThemeConfig> = {
  boulangerie: {
    primary: "#3D2817", accent: "#C9803E", bg: "#FAF6F0", surface: "#FFFFFF",
    emoji: "🥐",
    displayFont: "Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700;9..144,900",
    bodyFont: "Inter:wght@300;400;500;600;700",
    vibeDescription: "chaleureux et artisanal, évoquant la tradition familiale, l'odeur du pain chaud le matin, le savoir-faire transmis. Ton authentique, simple, ancré.",
  },
  restaurant: {
    primary: "#1A1A1A", accent: "#C8102E", bg: "#FAF9F6", surface: "#FFFFFF",
    emoji: "🍽️",
    displayFont: "Playfair+Display:wght@400;500;700;900",
    bodyFont: "Inter:wght@300;400;500;600;700",
    vibeDescription: "élégant et gourmand, mettant en avant la table, les produits frais, l'expérience du repas. Ton raffiné mais accessible, sensoriel.",
  },
  coiffure: {
    primary: "#1F1A2E", accent: "#B8956F", bg: "#F8F5F2", surface: "#FFFFFF",
    emoji: "✂️",
    displayFont: "Cormorant+Garamond:wght@300;400;500;600;700",
    bodyFont: "Inter:wght@300;400;500;600",
    vibeDescription: "raffiné et personnel, parlant de bien-être, de transformation, de confiance. Ton élégant, attentif, intime.",
  },
  commerce: {
    primary: "#0F172A", accent: "#2563EB", bg: "#F8FAFC", surface: "#FFFFFF",
    emoji: "🛍️",
    displayFont: "Inter:wght@600;700;800;900",
    bodyFont: "Inter:wght@300;400;500;600",
    vibeDescription: "moderne et direct, valorisant la sélection, le conseil personnalisé, la proximité. Ton clair, expert, contemporain.",
  },
  artisan: {
    primary: "#1C1917", accent: "#EA580C", bg: "#FAFAF9", surface: "#FFFFFF",
    emoji: "🔨",
    displayFont: "Archivo:wght@400;500;600;700;800;900",
    bodyFont: "Inter:wght@300;400;500;600",
    vibeDescription: "solide et fiable, mettant en avant le métier, la précision, le travail bien fait. Ton franc, technique, ancré dans la réalité.",
  },
  service: {
    primary: "#0F172A", accent: "#0EA5E9", bg: "#F1F5F9", surface: "#FFFFFF",
    emoji: "✨",
    displayFont: "Inter:wght@600;700;800;900",
    bodyFont: "Inter:wght@300;400;500;600",
    vibeDescription: "professionnel et orienté résultat, valorisant l'expertise et l'accompagnement. Ton clair, posé, expert.",
  },
};

const SERVICE_EMOJIS: Record<Sector, string[]> = {
  boulangerie: ["🥖", "🥐", "🎂"],
  restaurant: ["🍷", "🍝", "🍰"],
  coiffure: ["💇", "✨", "💅"],
  commerce: ["🛍️", "💎", "🎁"],
  artisan: ["🔧", "🏠", "📐"],
  service: ["✨", "⚡", "🎯"],
};

// ════════════════════════════════════════════════════════════════════
// GOOGLE PLACES — récupération des photos HD, reviews, horaires
// ════════════════════════════════════════════════════════════════════

type PlacesData = {
  photos: string[];
  reviews: Array<{ author: string; rating: number; text: string }>;
  rating?: number;
  reviewCount?: number;
  hours?: string[];
  phone?: string;
  address?: string;
};

async function fetchPlacesData(company: string, location: string | null): Promise<PlacesData> {
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
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.regularOpeningHours,places.nationalPhoneNumber,places.photos,places.reviews",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "fr", maxResultCount: 1 }),
    });
    if (!searchRes.ok) return { photos: [], reviews: [] };
    const data = await searchRes.json();
    const place = data.places?.[0];
    if (!place) return { photos: [], reviews: [] };

    const photos: string[] = [];
    for (const p of (place.photos || []).slice(0, 7)) {
      photos.push(
        `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=1600&maxWidthPx=2400&key=${apiKey}`
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
      reviewCount: place.userRatingCount,
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
// COPY IA — Claude Sonnet 4.6 (priorité) → Gemini Flash (fallback)
// ════════════════════════════════════════════════════════════════════

const OBJECTIVE_LABELS: Record<string, string> = {
  more_bookings: "obtenir plus de réservations / rendez-vous via le site",
  online_sales: "vendre des produits directement en ligne",
  showcase: "présenter l'entreprise comme une vitrine professionnelle",
  lead_generation: "générer des demandes de devis / contacts qualifiés",
  reduce_calls: "désengorger le standard en répondant aux questions courantes en ligne",
};

const TONE_DESCRIPTIONS: Record<string, string> = {
  warm: "chaleureux, artisanal, familial — fait sentir l'humain derrière le métier",
  elegant: "élégant, raffiné, soigné — registre presque éditorial, peu de superlatifs",
  modern: "moderne, direct, contemporain — phrases courtes, formules tranchées",
  expert: "expert, posé, technique — montre la maîtrise, sans jargon inutile",
  playful: "décontracté, convivial, parfois espiègle — sourit sans tomber dans le familier",
};

type CopyOutput = {
  sector: Sector;           // L'IA confirme/corrige le secteur d'après tout le contexte
  hero_title: string;       // 3-6 mots, percutant, ancré dans le métier
  hero_tagline: string;     // 12-22 mots, valeur ajoutée + ville si dispo
  signature_phrase: string; // citation forte, 8-16 mots, philosophie de l'entreprise
  about_title: string;      // eyebrow (2-3 mots) : "Notre histoire", "Notre maison"
  about_text: string;       // 60-110 mots, raconte l'entreprise (au "nous"), ancrage local
  services: Array<{ title: string; description: string }>; // 3 spécialités précises
  values: Array<{ title: string; description: string }>;   // 3 engagements/valeurs courts
  cta_text: string;         // CTA principal (1-3 mots, sector-spécifique)
  cta_secondary?: string;   // CTA secondaire (1-3 mots)
};

type CopyPromptInput = {
  company: string;
  city?: string | null;
  rating?: number;
  reviewCount?: number;
  reviewsExcerpt?: string;
  // Brief commercial (depuis prospects.brief_*)
  brief_activity?: string | null;
  brief_objective?: string | null;
  brief_tone?: string | null;
  brief_keywords?: string[] | null;
  // Données entreprise complémentaires
  naf?: string | null;
  industry?: string | null;
  website?: string | null;
};

function buildCopyPrompt(input: CopyPromptInput): string {
  const reviewsBlock = input.reviewsExcerpt
    ? `\n\n═══ AVIS GOOGLE RÉCENTS (contexte direct) ═══\nCes avis sont signés par de vrais clients. Identifie les THÈMES qui reviennent (ce que les gens aiment réellement chez eux) et fais résonner ton copy avec — sans jamais les citer textuellement.\n\n${input.reviewsExcerpt}`
    : "";

  const briefBlock = (input.brief_activity || (input.brief_keywords && input.brief_keywords.length > 0))
    ? `\n\n═══ BRIEF COMMERCIAL (à respecter à la lettre) ═══\n` +
      (input.brief_activity ? `Activité précise : ${input.brief_activity}\n` : "") +
      (input.brief_objective ? `Objectif business : ${OBJECTIVE_LABELS[input.brief_objective] || input.brief_objective}\n` : "") +
      (input.brief_tone ? `Ton souhaité : ${TONE_DESCRIPTIONS[input.brief_tone] || input.brief_tone}\n` : "") +
      (input.brief_keywords && input.brief_keywords.length > 0 ? `Produits / spécialités phares : ${input.brief_keywords.join(", ")}\n` : "")
    : "";

  return `Tu rédiges le copy d'un site web vitrine pour une entreprise française de proximité.

═══ DONNÉES ENTREPRISE ═══
Société           : ${input.company}
${input.naf ? `Code NAF          : ${input.naf}` : ""}
${input.industry ? `Libellé activité  : ${input.industry}` : ""}
${input.city ? `Ville             : ${input.city}` : ""}
${input.website ? `Site existant     : ${input.website}` : ""}
${input.rating ? `Note Google       : ${input.rating}/5 (${input.reviewCount || 0} avis)` : ""}
${briefBlock}
${reviewsBlock}

═══ TÂCHE ═══
Tu produis un copy ULTRA-PERSONNALISÉ qui :
  • Reflète l'activité PRÉCISE (pas une généralité du secteur)
  • Reprend les thèmes qui ressortent des avis Google (qualités réelles que les clients voient)
  • Respecte le ton du brief si fourni
  • S'aligne sur l'objectif business (oriente les CTAs en conséquence)
  • Mentionne au moins UN détail concret du brief / des avis (produit, signature, savoir-faire)

═══ INTERDICTIONS ABSOLUES (provoque un rejet) ═══
  ✘ "passion", "passionnés", "qualité", "satisfaction client", "leader", "incontournable"
  ✘ "nous mettons un point d'honneur", "votre satisfaction notre priorité"
  ✘ "excellence", "service irréprochable", "professionnalisme"
  ✘ Tout ce qui ressemble à du copy IA générique de site vitrine 2015
  ✘ Phrases creuses sans contenu concret ("nous nous engageons à…", "depuis toujours…")

═══ EXIGENCES ═══
  ✓ Au moins 2 détails CONCRETS (un produit nommé, une technique, un ingrédient, un quartier, une année…)
  ✓ Phrases courtes ou rythmées, pas de blocs lourds
  ✓ "nous" pour la marque, "vous" pour le client
  ✓ Si la ville est connue, mentionne-la au moins 1 fois
  ✓ Cohérence : si l'objectif est more_bookings → CTA "Réserver", "Prendre RDV". online_sales → "Commander", "Voir la boutique". lead_generation → "Demander un devis"

═══ CHAMP "sector" — VALEUR LITTÉRALE OBLIGATOIRE ═══
Tu DOIS répondre avec EXACTEMENT l'un de ces 6 strings, en lowercase, sans guillemets internes, sans qualifier :
  → "boulangerie"  (pas "boulangerie artisanale", pas "boulangerie-pâtisserie")
  → "restaurant"   (pas "restaurant gastronomique", pas "bistrot")
  → "coiffure"     (pas "salon de coiffure", pas "barbier")
  → "commerce"     (pas "fleuriste", pas "boutique")
  → "artisan"      (pas "plombier", pas "électricien")
  → "service"      (pas "comptable", pas "consultant")
Tout autre valeur déclenche un REJET et une regénération.

═══ STRUCTURE JSON STRICTE ═══
{
  "sector": "boulangerie",   // ← EXACTEMENT l'une des 6 valeurs ci-dessus, rien d'autre
  "hero_title": "Titre h1 (3-6 mots, évocateur, ancré dans l'activité réelle)",
  "hero_tagline": "Sous-titre (14-24 mots, valeur précise + ville)",
  "signature_phrase": "Phrase signature courte (8-16 mots, presque une citation, leur philosophie)",
  "about_title": "Eyebrow section À propos (2-3 mots — pas 'Notre histoire' systématique, varie)",
  "about_text": "Paragraphe 60-110 mots au 'nous', concret et vivant, avec au moins 1 détail spécifique",
  "services": [
    { "title": "Spécialité 1 (1-3 mots, NOM concret)", "description": "1 phrase concrète (12-22 mots) avec détail" },
    { "title": "Spécialité 2 (1-3 mots, NOM concret)", "description": "1 phrase concrète (12-22 mots) avec détail" },
    { "title": "Spécialité 3 (1-3 mots, NOM concret)", "description": "1 phrase concrète (12-22 mots) avec détail" }
  ],
  "values": [
    { "title": "Engagement 1 (3-6 mots, concret)", "description": "1 phrase courte (8-16 mots, NON-vide)" },
    { "title": "Engagement 2 (3-6 mots, concret)", "description": "1 phrase courte (8-16 mots, NON-vide)" },
    { "title": "Engagement 3 (3-6 mots, concret)", "description": "1 phrase courte (8-16 mots, NON-vide)" }
  ],
  "cta_text": "CTA principal aligné sur l'objectif (1-3 mots)",
  "cta_secondary": "CTA secondaire (1-3 mots)"
}

Pour le champ "sector", choisis CELUI qui correspond à l'activité réelle :
  • boulangerie : boulanger, pâtissier, viennoiserie
  • restaurant  : restaurant, brasserie, bistrot, pizzeria, traiteur sur place
  • coiffure    : coiffeur, barbier, esthétique, onglerie, spa
  • commerce    : boutique de produits (fleuriste, fromager, caviste, librairie, déco…)
  • artisan     : plombier, électricien, peintre, menuisier, maçon, carreleur, charpentier
  • service     : autre service à la personne ou aux pros (comptable, conseil, formation, etc.)

Réponds UNIQUEMENT avec le JSON. Aucun texte avant ou après.`;
}

async function generateCopy(input: CopyPromptInput): Promise<{ copy: CopyOutput; model: string }> {
  const prompt = buildCopyPrompt(input);

  // ── Provider 1 : Claude Sonnet 4.6 (qualité MAX FR) ──
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
        max_tokens: 3000,
        temperature: 0.7, // un peu moins de hallucinations, plus de fidélité au brief
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
    return { copy: JSON.parse(jsonMatch[0]) as CopyOutput, model: "claude-sonnet-4-6" };
  }

  // ── Provider 2 : Gemini 2.5 Flash (fallback) ──
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
          },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Pas de JSON dans la réponse Gemini");
    return { copy: JSON.parse(jsonMatch[0]) as CopyOutput, model: "gemini-2.5-flash" };
  }

  throw new Error("Aucune clé IA configurée (ANTHROPIC_API_KEY ou GEMINI_API_KEY)");
}

// ════════════════════════════════════════════════════════════════════
// AUTO-ENRICHISSEMENT BRIEF — invoqué au début de generate-preview si
// le brief est vide. Évite au commercial de devoir cliquer "Préremplir IA"
// manuellement avant chaque génération.
// ════════════════════════════════════════════════════════════════════

const AUTO_OBJECTIVES = ["more_bookings", "online_sales", "showcase", "lead_generation", "reduce_calls"];
const AUTO_TONES = ["warm", "elegant", "modern", "expert", "playful"];

async function autoEnrichBrief(input: {
  company: string;
  naf?: string | null;
  industry?: string | null;
  location?: string | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewsExcerpt?: string;
}): Promise<{ activity: string; objective: string; tone: string; keywords: string[] }> {
  const prompt = `Tu analyses une entreprise française de proximité pour préparer un brief de génération de site web vitrine.

═══ DONNÉES ENTREPRISE ═══
Société           : ${input.company}
${input.naf ? `Code NAF          : ${input.naf}` : ""}
${input.industry ? `Libellé activité  : ${input.industry}` : ""}
${input.location ? `Localisation      : ${input.location}` : ""}
${input.city ? `Ville             : ${input.city}` : ""}
${input.phone ? `Téléphone         : ${input.phone}` : ""}
${input.website ? `Site existant     : ${input.website}` : "Site existant     : aucun"}
${input.rating ? `Note Google       : ${input.rating}/5` : ""}
${input.reviewsExcerpt ? `\nAvis Google récents :\n${input.reviewsExcerpt}` : ""}

═══ TÂCHE ═══
Réponds en JSON STRICT avec :
{
  "activity": "Description précise (1-2 phrases) de ce qu'ils vendent/font au quotidien. SPÉCIFIQUE, pas paraphrase du NAF.",
  "objective": "ID parmi : ${AUTO_OBJECTIVES.map(o => `'${o}'`).join(", ")} (objectif business prioritaire le plus probable)",
  "tone": "ID parmi : ${AUTO_TONES.map(t => `'${t}'`).join(", ")} (ton qui colle au secteur)",
  "keywords": ["3-6 produits phares / spécialités / mots-clés concrets du métier"]
}

Règles :
1. activity : CIBLE la spécificité, pas "boulangerie" mais "boulangerie spécialisée pain au levain bio et viennoiseries pur beurre".
2. keywords : que des termes du MÉTIER (produits/services réels).
3. tone : warm pour artisan-bouche/familial, elegant pour beauté/gastronomie, modern pour commerce/agences, expert pour pros/santé, playful pour sport/loisir.
4. objective : Resto/coiffeur → more_bookings. Boutique → showcase ou online_sales. Artisan → lead_generation. Pro/conseil → showcase.

Réponds UNIQUEMENT avec le JSON.`;

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
        max_tokens: 600,
        temperature: 0.5,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude (enrich) ${res.status}`);
    const d = await res.json();
    const text = d.content?.[0]?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Pas de JSON dans la réponse Claude (enrich)");
    return sanitizeBrief(JSON.parse(m[0]));
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, response_mime_type: "application/json" },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini (enrich) ${res.status}`);
    const d = await res.json();
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Pas de JSON dans la réponse Gemini (enrich)");
    return sanitizeBrief(JSON.parse(m[0]));
  }

  throw new Error("Aucune clé IA pour l'auto-enrichissement");
}

function sanitizeBrief(raw: { activity?: unknown; objective?: unknown; tone?: unknown; keywords?: unknown }): {
  activity: string; objective: string; tone: string; keywords: string[];
} {
  return {
    activity: typeof raw.activity === "string" ? raw.activity.trim().slice(0, 600) : "",
    objective: AUTO_OBJECTIVES.includes(String(raw.objective)) ? String(raw.objective) : "showcase",
    tone: AUTO_TONES.includes(String(raw.tone)) ? String(raw.tone) : "warm",
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords
          .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
          .map((k) => k.trim())
          .slice(0, 8)
      : [],
  };
}

// ════════════════════════════════════════════════════════════════════
// HTML BUILDER — template "agency-level" mobile-first
// ════════════════════════════════════════════════════════════════════

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type BuildInput = {
  company: string;
  sector: Sector;
  copy: CopyOutput;
  photos: string[];
  hours: string[];
  phone?: string;
  address?: string;
  city?: string | null;
  rating?: number;
  review_count?: number;
  reviews: Array<{ author: string; rating: number; text: string }>;
  slug: string;
  preview_id: string;
  supabase_url: string;
  app_url: string;
};

function buildHtml(input: BuildInput): string {
  const theme = SECTOR_THEME[input.sector];
  // Fallback photos par secteur (Unsplash haute qualité, libre d'usage)
  const SECTOR_FALLBACK_PHOTOS: Record<Sector, string[]> = {
    boulangerie: [
      "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=2400&q=85",
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1600&q=85",
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=1600&q=85",
      "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=1600&q=85",
      "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=1600&q=85",
    ],
    restaurant: [
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=2400&q=85",
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=85",
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1600&q=85",
      "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=1600&q=85",
      "https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=1600&q=85",
    ],
    coiffure: [
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=2400&q=85",
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1600&q=85",
      "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1600&q=85",
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1600&q=85",
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1600&q=85",
    ],
    commerce: [
      "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=2400&q=85",
      "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1600&q=85",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=85",
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=1600&q=85",
      "https://images.unsplash.com/photo-1545194445-dddb8f4487c6?w=1600&q=85",
    ],
    artisan: [
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=2400&q=85",
      "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=1600&q=85",
      "https://images.unsplash.com/photo-1572177812156-58036aae439c?w=1600&q=85",
      "https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=1600&q=85",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=85",
    ],
    service: [
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=2400&q=85",
      "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1600&q=85",
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1600&q=85",
      "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1600&q=85",
      "https://images.unsplash.com/photo-1521737852567-6949f3f9f2b5?w=1600&q=85",
    ],
  };
  // Si Google Places n'a rien fourni → utilise les photos de secours du secteur
  const effectivePhotos = input.photos.length > 0 ? input.photos : SECTOR_FALLBACK_PHOTOS[input.sector];
  const heroPhoto = effectivePhotos[0];
  const galleryPhotos = effectivePhotos.slice(1);
  const company = escapeHtml(input.company);
  // URL canonique = la même que ce que le commercial envoie (Worker proxy)
  const canonicalUrl = `${input.app_url}/p/${input.slug}`;
  const ogImage = heroPhoto;
  const ogTitle = `${input.company} — ${input.copy.hero_title}`;
  const ogDescription = input.copy.hero_tagline;
  const sectorEmojis = SERVICE_EMOJIS[input.sector];

  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayHours = (input.hours[todayIndex] || "").replace(/^.*?:\s*/, "");
  const isOpenToday = !!todayHours && !/ferm/i.test(todayHours);

  // Familles de polices nettoyées pour CSS
  const displayFamily = theme.displayFont.split(":")[0].replace(/\+/g, " ");
  const bodyFamily = theme.bodyFont.split(":")[0].replace(/\+/g, " ");

  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${company} — ${escapeHtml(input.copy.hero_title)}</title>
  <meta name="description" content="${escapeHtml(ogDescription)}">

  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:site_name" content="${company}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  <meta name="twitter:image" content="${ogImage}">

  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${theme.emoji}</text></svg>">
  <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2222%22 fill=%22${encodeURIComponent(theme.accent)}%22/><text y=%22.85em%22 x=%225%22 font-size=%2280%22>${theme.emoji}</text></svg>">
  <meta name="theme-color" content="${theme.primary}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="format-detection" content="telephone=yes">
  <meta name="robots" content="noindex, nofollow"><!-- preview privé, pas pour Google -->

  <!-- JSON-LD : LocalBusiness pour rich snippets si jamais le prospect partage -->
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.company,
    description: input.copy.hero_tagline,
    image: ogImage,
    url: canonicalUrl,
    ...(input.phone ? { telephone: input.phone } : {}),
    ...(input.address ? { address: { "@type": "PostalAddress", streetAddress: input.address } } : {}),
    ...(input.rating ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: input.rating.toFixed(1),
        reviewCount: input.review_count || input.reviews.length || 1,
        bestRating: "5",
      },
    } : {}),
    ...(input.hours.length > 0 ? {
      openingHours: input.hours.filter(h => !/ferm/i.test(h)).join(", "),
    } : {}),
  })}</script>

  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${theme.displayFont}&family=${theme.bodyFont}&display=swap" rel="stylesheet">

  <style>
    :root {
      --c-primary: ${theme.primary};
      --c-accent: ${theme.accent};
      --c-bg: ${theme.bg};
      --c-surface: ${theme.surface};
      --display-font: '${displayFamily}', Georgia, serif;
      --body-font: '${bodyFamily}', system-ui, -apple-system, sans-serif;
    }
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--c-bg);
      color: var(--c-primary);
      font-family: var(--body-font);
      font-weight: 400;
      overflow-x: hidden;
    }
    p, li, a { overflow-wrap: break-word; }
    h1, h2, h3 { overflow-wrap: normal; word-break: keep-all; }
    img { max-width: 100%; height: auto; display: block; }
    .font-display { font-family: var(--display-font); }
    .ink { color: var(--c-primary); }
    .accent { color: var(--c-accent); }
    .bg-ink { background: var(--c-primary); }
    .bg-accent-c { background: var(--c-accent); }
    .bg-surface { background: var(--c-surface); }

    .h-hero {
      font-family: var(--display-font);
      font-size: clamp(2rem, 5.5vw + 1rem, 5.25rem);
      font-weight: 700; line-height: 1; letter-spacing: -0.02em;
    }
    .h-section {
      font-family: var(--display-font);
      font-size: clamp(1.625rem, 2.5vw + 0.9rem, 3rem);
      font-weight: 700; line-height: 1.08; letter-spacing: -0.015em;
    }
    .h-quote {
      font-family: var(--display-font);
      font-size: clamp(1.25rem, 3vw + 0.5rem, 2.75rem);
      font-weight: 500; line-height: 1.25; letter-spacing: -0.01em;
    }
    .h-card {
      font-family: var(--display-font);
      font-size: clamp(1.25rem, 1.5vw + 0.75rem, 1.75rem);
      font-weight: 700; line-height: 1.15;
    }
    .h-stat {
      font-family: var(--display-font);
      font-size: clamp(1.75rem, 3vw + 0.5rem, 2.5rem);
      font-weight: 700; line-height: 1;
    }
    .lead {
      font-size: clamp(1rem, 1.5vw + 0.5rem, 1.375rem);
      line-height: 1.55; font-weight: 300;
    }
    .eyebrow {
      font-size: 0.75rem; font-weight: 600;
      letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--c-accent);
    }
    .container-w { max-width: 1280px; margin: 0 auto; padding-left: 20px; padding-right: 20px; }
    @media (min-width: 768px) { .container-w { padding-left: 48px; padding-right: 48px; } }

    .hero-h { height: 100vh; height: 100svh; min-height: 600px; max-height: 900px; }
    .hero-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .hero-gradient {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.85) 100%);
    }

    .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.9s cubic-bezier(.22,.61,.36,1), transform 0.9s cubic-bezier(.22,.61,.36,1); }
    .reveal.in { opacity: 1; transform: translateY(0); }
    .reveal-d1 { transition-delay: 0.1s; }
    .reveal-d2 { transition-delay: 0.2s; }
    .reveal-d3 { transition-delay: 0.3s; }

    .status-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 14px; border-radius: 999px;
      backdrop-filter: blur(12px);
      background: rgba(255,255,255,0.18);
      border: 1px solid rgba(255,255,255,0.25);
      color: white; font-size: 0.75rem; font-weight: 500;
    }
    .pulse-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: ${isOpenToday ? "#22c55e" : "#ef4444"};
      box-shadow: 0 0 0 0 ${isOpenToday ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"};
      animation: pulse 2s infinite; flex-shrink: 0;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 ${isOpenToday ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)"}; }
      70% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
      100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
    }

    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 14px 24px; border-radius: 999px;
      font-size: 0.875rem; font-weight: 600; letter-spacing: 0.01em;
      transition: all 0.3s cubic-bezier(.22,.61,.36,1);
      cursor: pointer; text-decoration: none; white-space: nowrap;
    }
    .btn-primary { background: white; color: var(--c-primary); }
    .btn-primary:hover { background: var(--c-accent); color: white; transform: translateY(-2px); box-shadow: 0 18px 36px -8px rgba(0,0,0,0.25); }
    .btn-ghost {
      background: rgba(255,255,255,0.08); color: white;
      border: 1px solid rgba(255,255,255,0.4); backdrop-filter: blur(8px);
    }
    .btn-ghost:hover { background: rgba(255,255,255,0.18); border-color: white; }

    .stars { display: inline-flex; gap: 2px; font-size: 0.95em; color: #FBBF24; line-height: 1; }

    .service-card {
      padding: 28px; border-radius: 24px;
      background: var(--c-bg);
      transition: all 0.4s cubic-bezier(.22,.61,.36,1);
      border: 1px solid transparent;
    }
    .service-card:hover { transform: translateY(-4px); border-color: var(--c-accent); box-shadow: 0 24px 48px -12px rgba(0,0,0,0.12); }
    .service-icon {
      width: 56px; height: 56px; border-radius: 16px;
      background: color-mix(in srgb, var(--c-accent) 12%, transparent);
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; margin-bottom: 20px;
    }

    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    @media (min-width: 768px) {
      .gallery-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
      .gallery-grid > :first-child { grid-column: span 2; grid-row: span 2; }
    }
    .gallery-item {
      overflow: hidden; border-radius: 16px;
      aspect-ratio: 1/1; cursor: pointer;
    }
    .gallery-item img {
      width: 100%; height: 100%; object-fit: cover;
      transition: transform 0.8s cubic-bezier(.22,.61,.36,1);
    }
    .gallery-item:hover img { transform: scale(1.06); }

    .review-card { padding: 28px; border-radius: 24px; background: var(--c-bg); }

    .rating-sticker {
      position: absolute; bottom: -20px; right: -10px;
      background: var(--c-surface);
      box-shadow: 0 24px 48px -8px rgba(0,0,0,0.18);
      border-radius: 20px; padding: 18px 22px; min-width: 130px;
    }
    @media (min-width: 768px) {
      .rating-sticker { bottom: -28px; right: -28px; padding: 22px 26px; min-width: 160px; }
    }

    .day-row {
      display: flex; justify-content: space-between; align-items: baseline;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      gap: 16px;
    }
    .day-row.today { color: var(--c-accent); font-weight: 600; }
    .day-row .day-label { flex: 1; min-width: 0; }
    .day-row .day-hours { white-space: nowrap; font-variant-numeric: tabular-nums; opacity: 0.85; }
    .day-row.today .day-hours { opacity: 1; }

    .wyngo-watermark {
      position: fixed; bottom: 16px; right: 16px; z-index: 100;
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(0,0,0,0.82); color: white;
      font-size: 11px; font-weight: 500; font-family: var(--body-font);
      padding: 9px 14px; border-radius: 999px;
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 12px 32px -4px rgba(0,0,0,0.4);
      text-decoration: none; transition: all 0.3s;
    }
    .wyngo-watermark:hover { background: rgba(0,0,0,0.95); transform: translateY(-2px); }
    @media (max-width: 640px) { .wyngo-watermark { font-size: 10px; padding: 7px 11px; bottom: 12px; right: 12px; } }

    .phone-float {
      position: fixed; bottom: 16px; left: 16px; z-index: 99;
      display: none; align-items: center; gap: 8px;
      background: var(--c-accent); color: white;
      padding: 13px 20px; border-radius: 999px;
      font-weight: 600; font-size: 0.875rem;
      text-decoration: none;
      box-shadow: 0 14px 32px -4px rgba(0,0,0,0.3);
      transition: all 0.3s;
    }
    .phone-float:hover { transform: translateY(-2px) scale(1.03); }
    @media (max-width: 640px) { .phone-float { display: inline-flex; bottom: 12px; left: 12px; padding: 11px 16px; } }

    .section { padding-top: 64px; padding-bottom: 64px; }
    @media (min-width: 768px) { .section { padding-top: 96px; padding-bottom: 96px; } }
    @media (min-width: 1024px) { .section { padding-top: 128px; padding-bottom: 128px; } }

    .rule { width: 48px; height: 2px; background: var(--c-accent); margin: 16px auto 0; }
  </style>
</head>

<body>
  <!-- HERO -->
  <header class="hero-h relative flex flex-col justify-end overflow-hidden">
    <img class="hero-photo" src="${heroPhoto}" alt="${company}" loading="eager">
    <div class="hero-gradient"></div>

    <div class="absolute top-0 left-0 right-0 z-20 container-w pt-5 md:pt-8 flex justify-between items-center">
      <div class="status-pill">
        <span class="pulse-dot"></span>
        <span>${escapeHtml(isOpenToday ? `Ouvert · ${todayHours}` : `Fermé aujourd'hui`)}</span>
      </div>
    </div>

    <div class="relative z-10 container-w pb-12 md:pb-20 text-white">
      ${input.rating ? `
      <div class="reveal flex items-center gap-2 text-sm md:text-base mb-4">
        <span class="stars">${"★".repeat(Math.round(input.rating))}${"☆".repeat(5 - Math.round(input.rating))}</span>
        <span class="font-medium">${input.rating.toFixed(1)}</span>
        <span class="opacity-80">${input.review_count ? `· ${input.review_count} avis Google` : `sur Google`}</span>
      </div>
      ` : ""}
      <h1 class="reveal h-hero mb-5 max-w-4xl">
        ${escapeHtml(input.copy.hero_title)}
      </h1>
      <p class="reveal reveal-d1 lead max-w-2xl mb-8 text-white/90">
        ${escapeHtml(input.copy.hero_tagline)}
      </p>
      <div class="reveal reveal-d2 flex flex-wrap gap-3">
        <a href="#contact" class="btn btn-primary">
          ${escapeHtml(input.copy.cta_text)}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
        ${input.copy.cta_secondary ? `
        <a href="#about" class="btn btn-ghost">${escapeHtml(input.copy.cta_secondary)}</a>
        ` : ""}
      </div>
    </div>
  </header>

  <!-- SIGNATURE QUOTE -->
  <section class="bg-surface py-16 md:py-24 border-y" style="border-color: rgba(0,0,0,0.06);">
    <div class="container-w text-center">
      <p class="reveal h-quote ink">
        « ${escapeHtml(input.copy.signature_phrase || input.copy.hero_tagline)} »
      </p>
    </div>
  </section>

  <!-- ABOUT -->
  <section id="about" class="section">
    <div class="container-w">
      <div class="grid md:grid-cols-2 gap-12 md:gap-16 lg:gap-20 items-center">
        ${galleryPhotos[0] ? `
        <div class="reveal order-2 md:order-1 relative">
          <div class="rounded-3xl overflow-hidden" style="aspect-ratio: 4/5;">
            <img src="${galleryPhotos[0]}" alt="${company}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
          </div>
          ${input.rating ? `
          <div class="rating-sticker">
            <div class="stars mb-1.5">${"★".repeat(Math.round(input.rating))}</div>
            <p class="h-stat ink"><span style="font-variant-numeric:tabular-nums">${input.rating.toFixed(1)}</span><span style="font-size:0.55em;opacity:0.5;font-weight:500"> / 5</span></p>
            <p class="text-xs ink mt-1" style="opacity:0.6;">${input.review_count || 0} avis Google</p>
          </div>
          ` : ""}
        </div>
        ` : `<div class="hidden md:block"></div>`}
        <div class="order-1 md:order-2">
          <div class="reveal mb-3">
            <span class="eyebrow">${escapeHtml(input.copy.about_title)}</span>
          </div>
          <h2 class="reveal reveal-d1 h-section ink mb-6">
            ${escapeHtml(input.company)}<span class="accent">.</span>
          </h2>
          <p class="reveal reveal-d2 lead ink mb-8" style="opacity:0.85;">
            ${escapeHtml(input.copy.about_text)}
          </p>
          ${input.copy.values && input.copy.values.length > 0 ? `
          <ul class="reveal reveal-d3 space-y-4">
            ${input.copy.values.map(v => `
            <li class="flex gap-3 items-start">
              <div class="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style="background:color-mix(in srgb, var(--c-accent) 14%, transparent); color:var(--c-accent);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="flex-1">
                <h3 class="font-semibold ink text-base mb-0.5">${escapeHtml(v.title)}</h3>
                <p class="text-sm ink" style="opacity:0.7;">${escapeHtml(v.description)}</p>
              </div>
            </li>
            `).join("")}
          </ul>
          ` : ""}
        </div>
      </div>
    </div>
  </section>

  <!-- SERVICES -->
  <section class="section bg-surface">
    <div class="container-w">
      <div class="text-center mb-12 md:mb-16">
        <div class="reveal mb-3"><span class="eyebrow">Nos spécialités</span></div>
        <h2 class="reveal reveal-d1 h-section ink mx-auto max-w-3xl">Le savoir-faire au cœur du métier</h2>
        <div class="rule"></div>
      </div>
      <div class="grid md:grid-cols-3 gap-5 md:gap-7">
        ${input.copy.services.map((s, i) => `
        <div class="reveal reveal-d${(i % 3) + 1} service-card">
          <div class="service-icon">${sectorEmojis[i] || theme.emoji}</div>
          <h3 class="h-card ink mb-3">${escapeHtml(s.title)}</h3>
          <p class="ink" style="opacity:0.7; line-height:1.55;">${escapeHtml(s.description)}</p>
        </div>
        `).join("")}
      </div>
    </div>
  </section>

  ${galleryPhotos.length > 1 ? `
  <!-- GALLERY -->
  <section class="section">
    <div class="container-w">
      <div class="text-center mb-12 md:mb-16">
        <div class="reveal mb-3"><span class="eyebrow">L'univers en images</span></div>
        <h2 class="reveal reveal-d1 h-section ink">Notre univers</h2>
      </div>
      <div class="gallery-grid">
        ${galleryPhotos.slice(0, 6).map((p, i) => `
        <div class="reveal reveal-d${(i % 3) + 1} gallery-item">
          <img src="${p}" alt="${company} - photo ${i + 1}" loading="lazy">
        </div>
        `).join("")}
      </div>
    </div>
  </section>
  ` : ""}

  ${input.reviews.length > 0 ? `
  <!-- REVIEWS -->
  <section class="section bg-surface">
    <div class="container-w">
      <div class="text-center mb-12 md:mb-16">
        <div class="reveal mb-3"><span class="eyebrow">Ils nous font confiance</span></div>
        <h2 class="reveal reveal-d1 h-section ink">La parole à nos clients</h2>
        ${input.rating ? `
        <div class="reveal reveal-d2 mt-5 inline-flex items-center gap-3 px-4 py-2 rounded-full" style="background:rgba(0,0,0,0.04);">
          <span class="stars">${"★".repeat(Math.round(input.rating))}</span>
          <span class="font-semibold ink">${input.rating.toFixed(1)}/5</span>
          ${input.review_count ? `<span class="text-sm ink" style="opacity:0.6;">· ${input.review_count} avis</span>` : ""}
        </div>
        ` : ""}
      </div>
      <div class="grid md:grid-cols-3 gap-5 md:gap-6">
        ${input.reviews.slice(0, 3).map((r, i) => `
        <div class="reveal reveal-d${i + 1} review-card">
          <div class="stars mb-4">${"★".repeat(Math.round(r.rating))}</div>
          <p class="ink mb-6 italic" style="line-height:1.55; opacity:0.85;">« ${escapeHtml(r.text.length > 200 ? r.text.slice(0, 200) + "…" : r.text)} »</p>
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm" style="background:color-mix(in srgb, var(--c-accent) 18%, transparent); color:var(--c-accent);">
              ${escapeHtml(r.author.charAt(0).toUpperCase())}
            </div>
            <div>
              <p class="font-semibold ink text-sm">${escapeHtml(r.author)}</p>
              <p class="text-xs ink" style="opacity:0.5;">Avis Google vérifié</p>
            </div>
          </div>
        </div>
        `).join("")}
      </div>
    </div>
  </section>
  ` : ""}

  <!-- CONTACT -->
  <section id="contact" class="relative section bg-ink text-white overflow-hidden">
    <div class="absolute top-0 right-0 w-72 h-72 md:w-96 md:h-96 rounded-full blur-3xl opacity-20 pointer-events-none" style="background:var(--c-accent);"></div>
    <div class="relative container-w">
      <div class="text-center mb-12 md:mb-16">
        <div class="reveal mb-3"><span class="eyebrow">Nous rendre visite</span></div>
        <h2 class="reveal reveal-d1 h-section">Venez nous voir</h2>
      </div>
      <div class="grid md:grid-cols-2 gap-12 md:gap-16">
        <div class="reveal">
          <h3 class="eyebrow mb-5" style="color:rgba(255,255,255,0.6);">Horaires d'ouverture</h3>
          <ul class="space-y-0">
            ${input.hours.length > 0 ? input.hours.map((h, i) => {
              const m = h.match(/^([^:]+):\s*(.*)$/);
              const day = m ? m[1].trim() : h;
              const hours = m ? m[2].trim() : "";
              const isToday = i === todayIndex;
              return `
              <li class="day-row ${isToday ? "today" : ""}">
                <span class="day-label">${escapeHtml(day)}${isToday ? " · Aujourd'hui" : ""}</span>
                <span class="day-hours">${escapeHtml(hours || "Fermé")}</span>
              </li>
              `;
            }).join("") : `<li style="opacity:0.6;">Horaires non communiqués</li>`}
          </ul>
        </div>
        <div class="reveal reveal-d2">
          <h3 class="eyebrow mb-5" style="color:rgba(255,255,255,0.6);">Nous trouver</h3>
          ${input.address ? `
          <p class="h-quote mb-6" style="font-size:clamp(1.125rem,2vw + 0.5rem, 1.625rem);">${escapeHtml(input.address)}</p>
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(input.company + " " + (input.address || ""))}" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 text-sm mb-8 group" style="color:rgba(255,255,255,0.8);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Voir sur Google Maps
            <svg class="transition-transform group-hover:translate-x-1" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
          ` : ""}
          ${input.phone ? `
          <div class="mt-6 p-5 md:p-7 rounded-3xl" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);">
            <p class="eyebrow mb-2" style="color:rgba(255,255,255,0.6);">Appelez-nous</p>
            <a href="tel:${input.phone.replace(/\s/g, "")}" class="h-stat block hover:text-accent-c transition" style="color:white;">${escapeHtml(input.phone)}</a>
          </div>
          ` : ""}
        </div>
      </div>
    </div>
  </section>

  <footer class="bg-ink text-center py-10 px-6" style="color:rgba(255,255,255,0.4); font-size:0.75rem;">
    <p>© ${new Date().getFullYear()} ${company}. Tous droits réservés.</p>
  </footer>

  ${input.phone ? `
  <a href="tel:${input.phone.replace(/\s/g, "")}" class="phone-float">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    Appeler
  </a>
  ` : ""}

  <a href="https://wyngo.fr" target="_blank" rel="noopener" class="wyngo-watermark">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#FBBF24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    Aperçu généré par Wyngo
  </a>

  <script>
    document.addEventListener("DOMContentLoaded", function() {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
      document.querySelectorAll(".reveal").forEach(el => io.observe(el));
      try {
        fetch("${input.supabase_url}/functions/v1/preview-ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preview_id: "${input.preview_id}" })
        });
      } catch(e) {}
    });
  </script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════════
// SLUG
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
// HTTP HANDLER
// ════════════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Auth requise" }), { status: 401, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "User invalide" }), { status: 401, headers: corsHeaders });
    }

    const { prospect_id, force_refresh } = await req.json();
    if (!prospect_id) {
      return new Response(JSON.stringify({ error: "prospect_id requis" }), { status: 400, headers: corsHeaders });
    }

    // Prospect (RLS check)
    const { data: prospect, error: pErr } = await userClient.from("prospects").select("*").eq("id", prospect_id).single();
    if (pErr || !prospect) {
      return new Response(JSON.stringify({ error: "Prospect introuvable ou pas autorisé" }), { status: 404, headers: corsHeaders });
    }

    // Cache 24h sauf si force_refresh
    if (!force_refresh) {
      const { data: existing } = await userClient
        .from("prospect_previews")
        .select("*")
        .eq("prospect_id", prospect_id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing && new Date(existing.generated_at).getTime() > Date.now() - 24 * 3600 * 1000) {
        return new Response(JSON.stringify({ cached: true, ...existing, url: existing.html_url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const company = prospect.company || `${prospect.first_name} ${prospect.last_name}`;
    const city = (prospect.location || "").split(/[, ]/).find((s: string) => /^[A-ZÉÈÀÂ]/.test(s)) || prospect.location || null;

    // 1. Google Places (photos + reviews + horaires)
    const places = await fetchPlacesData(company, prospect.location);

    const reviewsExcerpt = places.reviews
      .slice(0, 5)
      .map((r) => `- (${r.rating}★ par ${r.author}) "${r.text.slice(0, 400)}"`)
      .join("\n");

    // 2. AUTO-ENRICHISSEMENT BRIEF — si le brief n'a pas été rempli par le
    //    commercial, on le génère automatiquement par IA AVANT de générer
    //    le copy. Le commercial peut éditer après pour affiner.
    //    Persistance en DB pour que les générations suivantes soient
    //    instantanées et que le commercial voie le brief sur la fiche.
    let briefActivity = prospect.brief_activity;
    let briefObjective = prospect.brief_objective;
    let briefTone = prospect.brief_tone;
    let briefKeywords: string[] | null = prospect.brief_keywords;

    const briefIsEmpty = !briefActivity || briefActivity.trim().length < 10;
    if (briefIsEmpty) {
      try {
        const enriched = await autoEnrichBrief({
          company,
          naf: prospect.naf,
          industry: prospect.industry,
          location: prospect.location,
          city,
          phone: prospect.phone,
          website: prospect.website,
          rating: places.rating,
          reviewsExcerpt,
        });
        briefActivity = enriched.activity || briefActivity;
        briefObjective = enriched.objective || briefObjective;
        briefTone = enriched.tone || briefTone;
        briefKeywords = (enriched.keywords && enriched.keywords.length > 0) ? enriched.keywords : briefKeywords;

        // Persistance asynchrone (best-effort, on bloque pas la génération)
        const sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (sk) {
          const sb = createClient(supabaseUrl, sk);
          sb.from("prospects").update({
            brief_activity: briefActivity,
            brief_objective: briefObjective,
            brief_tone: briefTone,
            brief_keywords: briefKeywords,
            brief_enriched_at: new Date().toISOString(),
          }).eq("id", prospect_id).then(() => {}, (e) => console.error("persist brief:", e));
        }
      } catch (e) {
        console.error("auto-enrich brief failed (non bloquant):", e);
        // On continue sans brief si l'enrichissement échoue
      }
    }

    // 3. Génération du copy IA — avec brief auto-enrichi ou existant
    const { copy: rawCopy, model } = await generateCopy({
      company,
      city,
      rating: places.rating,
      reviewCount: places.reviewCount,
      reviewsExcerpt,
      brief_activity: briefActivity,
      brief_objective: briefObjective,
      brief_tone: briefTone,
      brief_keywords: briefKeywords,
      naf: prospect.naf,
      industry: prospect.industry,
      website: prospect.website,
    });

    // Sanitization du sector retourné par l'IA — défense en profondeur :
    // 1. valeur exacte ? on prend
    // 2. valeur qualifiée (ex: "boulangerie artisanale") ? on prend le 1er mot s'il match
    // 3. sinon fallback regex NAF + mots-clés
    const validSectors: Sector[] = ["boulangerie", "restaurant", "coiffure", "commerce", "artisan", "service"];
    const rawSectorStr = String(rawCopy.sector || "").toLowerCase().trim();
    const firstWord = rawSectorStr.split(/[\s\-_,/]/).filter(Boolean)[0] as Sector | undefined;
    const sector: Sector = validSectors.includes(rawSectorStr as Sector)
      ? (rawSectorStr as Sector)
      : (firstWord && validSectors.includes(firstWord))
        ? firstWord
        : detectSector(prospect.naf || null, company, prospect.industry || null);
    const theme = SECTOR_THEME[sector];
    const copy = rawCopy;

    // 4. Construction HTML
    const slug = makeSlug(company);
    const previewId = crypto.randomUUID();
    const appUrl = Deno.env.get("WYNGO_APP_URL") || "https://wyngo.bold-unit-739e.workers.dev";
    const html = buildHtml({
      company,
      sector,
      copy,
      photos: places.photos,
      hours: places.hours || [],
      phone: places.phone || prospect.phone || undefined,
      address: places.address || prospect.location || undefined,
      city,
      rating: places.rating,
      review_count: places.reviewCount,
      reviews: places.reviews,
      slug,
      preview_id: previewId,
      supabase_url: supabaseUrl,
      app_url: appUrl,
    });

    // 5. Upload sur Storage (Blob → content-type correct)
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const storagePath = `${slug}.html`;
    const blob = new Blob([html], { type: "text/html" });
    const { error: upErr } = await serviceClient.storage
      .from("previews")
      .upload(storagePath, blob, {
        contentType: "text/html",
        upsert: true,
        cacheControl: "300",
      });
    if (upErr) throw new Error(`Storage upload : ${upErr.message}`);

    // ⚠️ On ne retourne PAS l'URL Storage directement : Supabase force
    // Content-Type: text/plain + nosniff + CSP sandbox sur tout HTML servi
    // depuis Storage OU edge functions (protection XSS systémique).
    //
    // Solution : proxy via le Cloudflare Worker /p/<slug> qui fetch le HTML
    // depuis Storage et le ressert avec les bons headers (text/html).
    // L'URL est aussi plus courte et branded.
    const publicUrl = `${appUrl}/p/${slug}`;

    // 6. Insertion DB
    const { data: row, error: insErr } = await serviceClient
      .from("prospect_previews")
      .insert({
        id: previewId,
        prospect_id,
        slug,
        html_url: publicUrl,
        sector,
        template: `template_v2_${sector}`,
        model,
        source_data: {
          places: { rating: places.rating, reviewCount: places.reviewCount, phone: places.phone, address: places.address, photos_count: places.photos.length },
          copy,
          brief_used: {
            activity: prospect.brief_activity,
            objective: prospect.brief_objective,
            tone: prospect.brief_tone,
            keywords: prospect.brief_keywords,
          },
          prospect_snapshot: { company, city, naf: prospect.naf, industry: prospect.industry, website: prospect.website },
        },
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
    console.error("[generate-preview]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
