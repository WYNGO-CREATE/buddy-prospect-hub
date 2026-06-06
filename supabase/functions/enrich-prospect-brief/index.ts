/**
 * ─── enrich-prospect-brief — Pré-remplir le Brief Aperçu par IA ────────
 *
 * Analyse tout ce qu'on sait du prospect (nom de société, code NAF, ville,
 * téléphone, site web s'il existe, avis Google) et propose 4 champs :
 *   • activity   — description précise de l'activité (1-2 phrases)
 *   • objective  — objectif probable d'avoir un site (parmi 5 options)
 *   • tone       — ton recommandé pour le copy (parmi 5 options)
 *   • keywords   — 3-6 mots-clés / produits phares
 *
 * Le commercial peut ensuite éditer librement chaque champ avant de
 * générer l'aperçu. L'IA fait juste le travail de défrichage.
 *
 * Body : { prospect_id: string, persist?: boolean }
 *   - persist = true → écrit les valeurs dans prospects.brief_*
 *   - persist = false → renvoie juste la suggestion (pour preview)
 *
 * Modèle : Claude Sonnet 4.6 si ANTHROPIC_API_KEY dispo, sinon Gemini 2.5 Flash.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OBJECTIVES = [
  { id: "more_bookings", label: "Plus de réservations / RDV" },
  { id: "online_sales", label: "Vendre en ligne" },
  { id: "showcase", label: "Vitrine de présentation" },
  { id: "lead_generation", label: "Générer des contacts (devis)" },
  { id: "reduce_calls", label: "Désengorger le standard téléphonique" },
];

const TONES = [
  { id: "warm", label: "Chaleureux & artisanal" },
  { id: "elegant", label: "Élégant & raffiné" },
  { id: "modern", label: "Moderne & direct" },
  { id: "expert", label: "Expert & technique" },
  { id: "playful", label: "Décontracté & convivial" },
];

type BriefSuggestion = {
  activity: string;
  objective: string;   // id parmi OBJECTIVES
  tone: string;        // id parmi TONES
  keywords: string[];  // 3-6 termes
  confidence: number;  // 0-1 pour signaler à l'UI si l'IA a hésité
  reasoning?: string;  // court mémo pour debug
};

function buildPrompt(input: {
  company: string;
  naf?: string | null;
  industry?: string | null;
  location?: string | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
  websiteStatus?: string | null;
  rating?: number | null;
  reviewsExcerpt?: string;
}): string {
  return `Tu es un expert en analyse d'entreprises de proximité françaises (TPE/PME).
À partir des données ci-dessous, tu dois proposer un brief synthétique
pour générer un site web vitrine personnalisé.

═══ DONNÉES PROSPECT ═══
Société           : ${input.company}
${input.naf ? `Code NAF          : ${input.naf}` : ""}
${input.industry ? `Libellé activité  : ${input.industry}` : ""}
${input.location ? `Localisation      : ${input.location}` : ""}
${input.city ? `Ville             : ${input.city}` : ""}
${input.phone ? `Téléphone         : ${input.phone}` : ""}
${input.website ? `Site existant     : ${input.website} (statut : ${input.websiteStatus || "?"})` : "Site existant     : aucun"}
${input.rating ? `Note Google       : ${input.rating}/5` : ""}
${input.reviewsExcerpt ? `\nExtraits d'avis Google récents :\n${input.reviewsExcerpt}` : ""}

═══ TÂCHE ═══
Réponds en JSON STRICT avec :
{
  "activity": "Description précise de l'activité en 1 à 2 phrases (NE PARAPHRASE PAS le NAF, sois CONCRET sur ce qu'ils vendent/font au quotidien).",
  "objective": "ID parmi : ${OBJECTIVES.map(o => `'${o.id}'`).join(", ")} (objectif business prioritaire le plus probable vu le secteur)",
  "tone": "ID parmi : ${TONES.map(t => `'${t.id}'`).join(", ")} (ton qui colle au secteur ET à la cible client)",
  "keywords": ["3 à 6 produits phares / spécialités / mots-clés précis du métier — pas de généralité"],
  "confidence": 0.0,  // entre 0 et 1 : tu mets bas si tu as dû deviner, haut si les données sont claires
  "reasoning": "1 phrase courte expliquant tes choix (pour debug)"
}

═══ RÈGLES ═══
1. activity : tu CIBLES la spécificité, tu ne dis pas "boulangerie" mais "boulangerie artisanale spécialisée pain au levain + pâtisseries du dimanche".
2. keywords : que des termes du MÉTIER (produits/services concrets), jamais "qualité" ou "service client".
3. tone : déduis du secteur. Boulanger = warm, hôtel particulier = elegant, agence digitale = modern, comptable = expert, restaurant familial = warm ou playful.
4. objective : déduis du secteur. Resto = more_bookings ou online_sales. Coiffeur = more_bookings. Artisan = lead_generation. Boutique = showcase ou online_sales.
5. Si tu n'as PAS assez d'info, mets confidence < 0.6 et reste générique mais correct.

Réponds UNIQUEMENT avec le JSON, rien avant rien après.`;
}

async function callClaude(prompt: string): Promise<{ data: BriefSuggestion; model: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY")!;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const text = d.content?.[0]?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Pas de JSON dans la réponse Claude");
  return { data: JSON.parse(m[0]) as BriefSuggestion, model: "claude-sonnet-4-6" };
}

async function callGemini(prompt: string): Promise<{ data: BriefSuggestion; model: string }> {
  const key = Deno.env.get("GEMINI_API_KEY")!;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, response_mime_type: "application/json" },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Pas de JSON dans la réponse Gemini");
  return { data: JSON.parse(m[0]) as BriefSuggestion, model: "gemini-2.5-flash" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Auth requise" }), { status: 401, headers: cors });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "User invalide" }), { status: 401, headers: cors });

    const { prospect_id, persist = true } = await req.json();
    if (!prospect_id) {
      return new Response(JSON.stringify({ error: "prospect_id requis" }), { status: 400, headers: cors });
    }

    const { data: prospect, error: pErr } = await userClient.from("prospects").select("*").eq("id", prospect_id).single();
    if (pErr || !prospect) {
      return new Response(JSON.stringify({ error: "Prospect introuvable" }), { status: 404, headers: cors });
    }

    // Petit fetch léger Google Places pour les avis (apporte un signal fort de tonalité)
    let reviewsExcerpt = "";
    let rating: number | null = null;
    const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (placesKey && prospect.company) {
      try {
        const q = prospect.location ? `${prospect.company} ${prospect.location}` : prospect.company;
        const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": placesKey,
            "X-Goog-FieldMask": "places.rating,places.reviews",
          },
          body: JSON.stringify({ textQuery: q, languageCode: "fr", maxResultCount: 1 }),
        });
        if (r.ok) {
          const j = await r.json();
          const p = j.places?.[0];
          rating = p?.rating ?? null;
          reviewsExcerpt = (p?.reviews || []).slice(0, 3)
            .map((rv: { text?: { text?: string } }) => rv.text?.text ? `- "${rv.text.text.slice(0, 200)}"` : "")
            .filter(Boolean)
            .join("\n");
        }
      } catch {/* on ignore si Places échoue, ça reste utile */}
    }

    const city = (prospect.location || "").split(/[, ]/).find((s: string) => /^[A-ZÉÈÀÂ]/.test(s)) || prospect.location || null;
    const prompt = buildPrompt({
      company: prospect.company || `${prospect.first_name} ${prospect.last_name}`,
      naf: prospect.naf,
      industry: prospect.industry,
      location: prospect.location,
      city,
      phone: prospect.phone,
      website: prospect.website,
      websiteStatus: prospect.website_status,
      rating,
      reviewsExcerpt,
    });

    // Claude > Gemini
    let result;
    if (Deno.env.get("ANTHROPIC_API_KEY")) result = await callClaude(prompt);
    else if (Deno.env.get("GEMINI_API_KEY")) result = await callGemini(prompt);
    else throw new Error("Aucune clé IA configurée");

    // Sanitization : on s'assure que objective/tone sont des IDs valides
    const validObj = OBJECTIVES.find(o => o.id === result.data.objective)?.id || "showcase";
    const validTone = TONES.find(t => t.id === result.data.tone)?.id || "warm";
    const cleanKeywords = (Array.isArray(result.data.keywords) ? result.data.keywords : [])
      .filter(k => typeof k === "string" && k.trim().length > 0)
      .map(k => k.trim())
      .slice(0, 8);

    const finalBrief = {
      activity: (result.data.activity || "").trim().slice(0, 600),
      objective: validObj,
      tone: validTone,
      keywords: cleanKeywords,
      confidence: typeof result.data.confidence === "number" ? result.data.confidence : 0.7,
      reasoning: (result.data.reasoning || "").trim().slice(0, 300),
    };

    // Persist (si demandé)
    if (persist) {
      // service client pour bypass RLS sur l'update (le user pourrait avoir des
      // droits restreints, on signe la write avec le service role)
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, serviceKey);
      const { error: upErr } = await sb.from("prospects").update({
        brief_activity: finalBrief.activity || null,
        brief_objective: finalBrief.objective,
        brief_tone: finalBrief.tone,
        brief_keywords: finalBrief.keywords,
        brief_enriched_at: new Date().toISOString(),
      }).eq("id", prospect_id);
      if (upErr) throw new Error(`Update prospect : ${upErr.message}`);
    }

    return new Response(JSON.stringify({
      ok: true,
      brief: finalBrief,
      model: result.model,
      catalogue: { objectives: OBJECTIVES, tones: TONES },
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[enrich-prospect-brief]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
