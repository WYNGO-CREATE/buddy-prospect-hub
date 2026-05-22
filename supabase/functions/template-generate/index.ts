/**
 * ─── Template Generate ───
 *
 * Génère un template d'email pro à partir d'un brief utilisateur
 * et du contexte business de l'agence (agency_settings.business_brief, …).
 *
 * Appelle l'API Anthropic (Claude) avec tool-use pour garantir une sortie
 * structurée { name, subject, body, category }.
 *
 * POST body : {
 *   objective:     string  // "Prendre un RDV avec un prospect froid", "Relancer après silence", ...
 *   tone?:         string  // 'professionnel' | 'chaleureux' | 'direct' | 'consultatif'
 *   length?:       string  // 'court' | 'standard' | 'long'  (par défaut: standard)
 *   variables?:    string[]// ['prenom', 'entreprise', ...]
 *   extra_notes?:  string  // contraintes spécifiques de l'utilisateur
 * }
 *
 * Réponse : { name, subject, body, category, tokens_in, tokens_out }
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
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── SYSTEM PROMPT — pensé pour produire des emails B2B excellents ───
function buildSystemPrompt(ctx: {
  agencyName?: string;
  activity?: string;
  businessBrief?: string;
  targetClient?: string;
  valueProps?: string;
}): string {
  return `Tu es un copywriter B2B senior spécialisé dans l'outbound froid et la prospection commerciale.
Tu écris EXCLUSIVEMENT en français, dans un style direct, humain, sans jargon marketing creux.

═══ CONTEXTE DE L'AGENCE QUI ENVOIE L'EMAIL ═══
${ctx.agencyName ? `Nom : ${ctx.agencyName}` : ""}
${ctx.activity ? `Activité : ${ctx.activity}` : ""}
${ctx.businessBrief ? `\nDescription : ${ctx.businessBrief}` : ""}
${ctx.targetClient ? `\nClient cible : ${ctx.targetClient}` : ""}
${ctx.valueProps ? `\nPropositions de valeur :\n${ctx.valueProps}` : ""}

═══ RÈGLES D'ÉCRITURE (NON-NÉGOCIABLES) ═══
1. Toujours commencer par « Bonjour {{prenom}}, » (jamais « Cher … » ni « Hello » ni « Salut »).
2. Mentionner naturellement l'entreprise du prospect via {{entreprise}} dans la première ou deuxième phrase quand c'est pertinent.
3. Le sujet doit être COURT (max 60 caractères), curiosity-driven, sans majuscules abusives, sans emoji, sans point d'exclamation, sans le mot "GRATUIT" ni clickbait.
4. Le corps de l'email :
   - Démarre fort, jamais par « J'espère que vous allez bien »
   - 3 paragraphes courts max, séparés par une ligne vide
   - 1 idée par paragraphe
   - Phrase d'ouverture qui prouve qu'on connaît le prospect (sans en faire trop)
   - Apporte de la valeur AVANT de demander quoi que ce soit
   - Un seul CTA clair à la fin (question simple ou proposition de créneau)
   - Pas de bullet points (sauf instruction explicite)
   - Pas de signature : elle sera ajoutée automatiquement
5. JAMAIS de superlatifs ("le meilleur", "incroyable", "révolutionnaire", "leader").
6. JAMAIS de promesses non chiffrées : si tu cites un résultat, fais-le sobrement.
7. Ton du français : tu vouvoies systématiquement.
8. Tu utilises les variables {{prenom}}, {{nom}}, {{entreprise}}, {{email}} — pas d'autres.

═══ FORMAT DE SORTIE ═══
Tu DOIS utiliser l'outil \`save_template\` pour retourner le résultat. Pas de texte libre.`;
}

// ─── User message ───
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

// ─── Tool definition pour structurer la sortie ───
const TOOL_DEF = {
  name: "save_template",
  description: "Enregistre le template d'email généré.",
  input_schema: {
    type: "object" as const,
    properties: {
      name:     { type: "string", description: "Nom interne court (max 60 chars)" },
      subject:  { type: "string", description: "Objet de l'email (max 60 chars)" },
      body:     { type: "string", description: "Corps complet de l'email" },
      category: {
        type: "string",
        enum: ["prospection", "relance", "rdv", "remerciement", "autre"],
      },
    },
    required: ["name", "subject", "body", "category"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const startTime = Date.now();
  let userId: string | null = null;

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({
        error: "ANTHROPIC_API_KEY non configurée dans les secrets Supabase",
        hint: "Va sur https://console.anthropic.com/settings/keys, crée une clé, puis ajoute-la dans Supabase → Edge Functions → Secrets sous le nom ANTHROPIC_API_KEY",
      }, 500);
    }

    // Auth user
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

    // ─── Récupère contexte agence ───
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

    // ─── Appel Anthropic ───
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        tools: [TOOL_DEF],
        tool_choice: { type: "tool", name: "save_template" },
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("[template-generate] Anthropic API error", anthropicRes.status, errBody);
      await admin.from("ai_generations").insert({
        owner_id: userId,
        kind: "template",
        input,
        error: `Anthropic ${anthropicRes.status}: ${errBody}`,
        duration_ms: Date.now() - startTime,
      });
      return json({
        error: "Génération IA échouée",
        details: errBody.slice(0, 500),
      }, 502);
    }

    const completion = await anthropicRes.json();
    // completion.content : Array<{type:'tool_use', name:'save_template', input:{...}}>
    const toolUse = (completion.content || []).find((c: any) => c.type === "tool_use");
    if (!toolUse || !toolUse.input) {
      console.error("[template-generate] No tool_use in response", completion);
      await admin.from("ai_generations").insert({
        owner_id: userId,
        kind: "template",
        input,
        output: completion,
        error: "No tool_use block in response",
        duration_ms: Date.now() - startTime,
        model: MODEL,
      });
      return json({ error: "Réponse IA invalide (pas de tool_use)" }, 502);
    }

    const result = toolUse.input as { name: string; subject: string; body: string; category: string };

    // Validation côté serveur
    if (!result.name || !result.subject || !result.body) {
      return json({ error: "Réponse IA incomplète" }, 502);
    }
    // Trim subject si trop long
    if (result.subject.length > 100) result.subject = result.subject.slice(0, 100);

    // ─── Log audit ───
    const usage = completion.usage || {};
    await admin.from("ai_generations").insert({
      owner_id: userId,
      kind: "template",
      input,
      output: result,
      model: MODEL,
      tokens_in: usage.input_tokens || null,
      tokens_out: usage.output_tokens || null,
      duration_ms: Date.now() - startTime,
    });

    return json({
      ...result,
      tokens_in: usage.input_tokens,
      tokens_out: usage.output_tokens,
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
