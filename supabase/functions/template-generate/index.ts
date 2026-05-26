/**
 * ─── Template Generate ───
 *
 * Génère un template d'email pro à partir d'un brief utilisateur
 * et du contexte business de l'agence.
 *
 * Provider auto-détecté :
 *   1. ANTHROPIC_API_KEY → Claude (qualité top, payant)
 *   2. GEMINI_API_KEY    → Gemini 2.0 Flash (gratuit, 1500 req/j)
 *   3. (à défaut)        → erreur explicative
 *
 * Sortie structurée garantie via tool-use (Anthropic) ou responseSchema (Gemini).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
// gemini-2.5-flash : nouveau modèle Gemini, plus rapide et avec quota free tier
// encore actif (gemini-2.0-flash a vu son free tier coupé pour certains comptes).
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── SYSTEM PROMPT — pensé pour produire des emails B2B excellents ───
function buildSystemPrompt(ctx: {
  agencyName?: string;
  activity?: string;
  businessBrief?: string;
  targetClient?: string;
  valueProps?: string;
}): string {
  const hasContext = ctx.businessBrief || ctx.targetClient || ctx.valueProps;

  return `Tu es un copywriter B2B senior. Ton seul métier est de transcrire fidèlement la voix d'une agence existante dans des emails de prospection — pas d'inventer une voix générique.

╔════════════════════════════════════════════════════════════════════╗
║  CONTEXTE DE CETTE AGENCE — TU DOIS L'UTILISER, PAS L'IGNORER     ║
╠════════════════════════════════════════════════════════════════════╣
${ctx.agencyName ? `║  Nom : ${ctx.agencyName}\n` : ""}${ctx.activity ? `║  Activité : ${ctx.activity}\n` : ""}${ctx.businessBrief ? `║\n║  ─── DESCRIPTION DÉTAILLÉE (la vraie identité de l'agence) ───\n║  ${ctx.businessBrief.replace(/\n/g, "\n║  ")}\n` : ""}${ctx.targetClient ? `║\n║  ─── CLIENT CIBLE (à qui s'adresse l'email) ───\n║  ${ctx.targetClient.replace(/\n/g, "\n║  ")}\n` : ""}${ctx.valueProps ? `║\n║  ─── PROPOSITIONS DE VALEUR UNIQUES (à intégrer SANS LES PARAPHRASER) ───\n║  ${ctx.valueProps.replace(/\n/g, "\n║  ")}\n` : ""}╚════════════════════════════════════════════════════════════════════╝

${hasContext ? `═══ RÈGLES OBLIGATOIRES DE TRANSCRIPTION DU CONTEXTE ═══

A. Tu DOIS intégrer concrètement AU MOINS 2 propositions de valeur uniques listées ci-dessus dans le corps de l'email (chiffres exacts, formules exactes).
B. Tu DOIS adapter le ton à la "DESCRIPTION DÉTAILLÉE" ci-dessus — c'est CE ton-là, pas un ton générique.
C. Si l'agence se positionne comme "cabinet privé", l'email reflète ce registre (langage feutré, posture artisanale, jamais "commercial").
D. Tu DOIS éviter à tout prix les phrases génériques de prospection web ("présence en ligne", "site sur-mesure", "augmenter votre visibilité"). À la place, tu prends les FORMULES PROPRES à cette agence ci-dessus.
E. Si la description mentionne un FONDATEUR par son prénom, tu peux signer mentalement le mail à la 1ère personne du singulier (sans signature visible — elle est ajoutée auto).
F. Aucun chiffre inventé — uniquement les chiffres qui apparaissent EXPLICITEMENT dans le contexte ci-dessus.

` : ""}═══ RÈGLES DE FORME ═══
1. Commence toujours par « Bonjour {{prenom}}, ».
2. Mentionne {{entreprise}} naturellement dans les 2 premières phrases.
3. Sujet : COURT (max 60 caractères), curiosity-driven, sans emoji, sans "!", sans "GRATUIT", sans clickbait.
4. Corps : 3-4 paragraphes courts séparés par une ligne vide. 1 idée par paragraphe.
5. JAMAIS « J'espère que vous allez bien ». La 1ère phrase doit prouver qu'on connaît le prospect.
6. JAMAIS de superlatifs ("le meilleur", "incroyable", "révolutionnaire", "leader", "expert").
7. Un seul CTA clair à la fin.
8. Vouvoiement strict. Pas de signature visible (ajoutée auto).
9. Variables autorisées : {{prenom}}, {{nom}}, {{entreprise}}, {{email}}. Aucune autre.`;
}

function buildUserPrompt(input: {
  objective: string;
  tone?: string;
  length?: string;
  extra_notes?: string;
}): string {
  const lengthGuide = {
    court: "80–120 mots dans le corps",
    standard: "120–180 mots dans le corps",
    long: "180–280 mots dans le corps",
  }[input.length || "standard"];

  return `Génère un template d'email correspondant à ce brief :

OBJECTIF : ${input.objective}

TON : ${input.tone || "professionnel"} (mais jamais froid ni corporate)
LONGUEUR CIBLE : ${lengthGuide}
${input.extra_notes ? `\nCONTRAINTES SPÉCIFIQUES : ${input.extra_notes}` : ""}

Choisis aussi :
- Un \`name\` interne court et descriptif (ex : "Prospection J0 — prise de contact")
- Une \`category\` parmi : prospection, relance, rdv, remerciement, autre`;
}

// ─── Provider Anthropic (Claude) ───
async function generateWithAnthropic(systemPrompt: string, userPrompt: string): Promise<{
  result: any; tokens_in?: number; tokens_out?: number; model: string;
}> {
  const TOOL_DEF = {
    name: "save_template",
    description: "Enregistre le template d'email généré.",
    input_schema: {
      type: "object" as const,
      properties: {
        name:     { type: "string", description: "Nom interne court (max 60 chars)" },
        subject:  { type: "string", description: "Objet de l'email (max 60 chars)" },
        body:     { type: "string", description: "Corps complet de l'email" },
        category: { type: "string", enum: ["prospection", "relance", "rdv", "remerciement", "autre"] },
      },
      required: ["name", "subject", "body", "category"],
    },
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      tools: [TOOL_DEF],
      tool_choice: { type: "tool", name: "save_template" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  }
  const completion = await res.json();
  const toolUse = (completion.content || []).find((c: any) => c.type === "tool_use");
  if (!toolUse?.input) throw new Error("No tool_use in Anthropic response");
  return {
    result: toolUse.input,
    tokens_in: completion.usage?.input_tokens,
    tokens_out: completion.usage?.output_tokens,
    model: ANTHROPIC_MODEL,
  };
}

// ─── Provider Google Gemini (gratuit) ───
async function generateWithGemini(systemPrompt: string, userPrompt: string): Promise<{
  result: any; tokens_in?: number; tokens_out?: number; model: string;
}> {
  // Gemini : structured output via responseSchema
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        // Température basse = l'IA s'éloigne moins du contexte qu'on lui donne.
        // Pour des templates où on veut la VOIX de l'agence, pas la créativité du modèle.
        temperature: 0.4,
        // Gemini 2.5 utilise des "thinking tokens" qui consomment le budget.
        // 4000 tokens = large marge pour pensée + JSON structurée complète.
        maxOutputTokens: 4000,
        // On désactive le thinking pour ce cas d'usage simple (génération de template),
        // ça économise les tokens et accélère la réponse.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            name:     { type: "string" },
            subject:  { type: "string" },
            body:     { type: "string" },
            category: { type: "string", enum: ["prospection", "relance", "rdv", "remerciement", "autre"] },
          },
          required: ["name", "subject", "body", "category"],
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }
  const completion = await res.json();
  const text = completion.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini renvoyé du non-JSON : ${text.slice(0, 200)}`);
  }
  return {
    result: parsed,
    tokens_in: completion.usageMetadata?.promptTokenCount,
    tokens_out: completion.usageMetadata?.candidatesTokenCount,
    model: GEMINI_MODEL,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startTime = Date.now();
  let userId: string | null = null;

  try {
    if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
      return json({
        error: "Aucune clé IA configurée",
        hint: "Ajoute soit GEMINI_API_KEY (gratuit, https://aistudio.google.com/app/apikey) soit ANTHROPIC_API_KEY (payant, https://console.anthropic.com/settings/keys) dans Supabase → Edge Functions → Secrets",
      }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);
    userId = userData.user.id;

    const input = await req.json();
    if (!input.objective || typeof input.objective !== "string") {
      return json({ error: "Champ 'objective' requis" }, 400);
    }

    const { data: agency } = await admin
      .from("agency_settings")
      .select("name, activity, business_brief, target_client, value_props, default_tone")
      .eq("id", true)
      .maybeSingle();

    const systemPrompt = buildSystemPrompt({
      agencyName:    agency?.name,
      activity:      agency?.activity,
      businessBrief: agency?.business_brief,
      targetClient:  agency?.target_client,
      valueProps:    agency?.value_props,
    });
    const userPrompt = buildUserPrompt({
      objective:   input.objective,
      tone:        input.tone || agency?.default_tone || "professionnel",
      length:      input.length,
      extra_notes: input.extra_notes,
    });

    // ─── Choix du provider ───
    let providerResult;
    let providerName: string;
    try {
      if (ANTHROPIC_API_KEY) {
        providerName = "anthropic";
        providerResult = await generateWithAnthropic(systemPrompt, userPrompt);
      } else {
        providerName = "gemini";
        providerResult = await generateWithGemini(systemPrompt, userPrompt);
      }
    } catch (e) {
      const errMsg = String(e);
      console.error("[template-generate] Provider error", errMsg);
      await admin.from("ai_generations").insert({
        owner_id: userId,
        kind: "template",
        input,
        error: errMsg,
        duration_ms: Date.now() - startTime,
      });
      return json({
        error: "Génération IA échouée",
        details: errMsg.slice(0, 1000),
        provider: ANTHROPIC_API_KEY ? "anthropic" : "gemini",
        model: ANTHROPIC_API_KEY ? ANTHROPIC_MODEL : GEMINI_MODEL,
      }, 502);
    }

    const result = providerResult.result as { name: string; subject: string; body: string; category: string };
    if (!result.name || !result.subject || !result.body) {
      return json({ error: "Réponse IA incomplète", raw: result }, 502);
    }
    if (result.subject.length > 100) result.subject = result.subject.slice(0, 100);

    await admin.from("ai_generations").insert({
      owner_id: userId,
      kind: "template",
      input,
      output: result,
      model: `${providerName}:${providerResult.model}`,
      tokens_in: providerResult.tokens_in || null,
      tokens_out: providerResult.tokens_out || null,
      duration_ms: Date.now() - startTime,
    });

    return json({
      ...result,
      provider: providerName,
      tokens_in: providerResult.tokens_in,
      tokens_out: providerResult.tokens_out,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error("[template-generate] Uncaught", e);
    if (userId) {
      await admin.from("ai_generations").insert({
        owner_id: userId,
        kind: "template",
        input: {},
        error: String(e),
        duration_ms: Date.now() - startTime,
      });
    }
    return json({ error: String(e) }, 500);
  }
});
