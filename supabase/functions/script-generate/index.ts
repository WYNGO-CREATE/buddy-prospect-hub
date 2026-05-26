/**
 * ─── Script Generate ───
 *
 * Génère un script d'appel téléphonique OU une réponse à une objection,
 * en suivant la méthodologie Wyngo (5 phases pour les scripts, posture
 * fondateur-transparent pour les objections).
 *
 * Provider auto-détecté :
 *   1. ANTHROPIC_API_KEY → Claude (qualité top, payant)
 *   2. GEMINI_API_KEY    → Gemini 2.0 Flash (gratuit, 1500 req/j)
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
// gemini-2.5-flash : nouveau modèle, free tier encore actif
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── System prompts spécialisés ───
function buildSystemPromptScript(ctx: any): string {
  const hasContext = ctx.businessBrief || ctx.targetClient || ctx.valueProps;

  return `Tu es un coach senior en télévente B2B, spécialisé dans la prospection téléphonique pour des cabinets de conseil et services premium.
Ton métier : transcrire fidèlement la voix d'une agence existante en scripts d'appel — pas inventer une voix générique.

╔════════════════════════════════════════════════════════════════════╗
║  CONTEXTE DE L'AGENCE — TU DOIS L'UTILISER, PAS L'IGNORER         ║
╠════════════════════════════════════════════════════════════════════╣
${ctx.agencyName ? `║  Nom : ${ctx.agencyName}\n` : ""}${ctx.activity ? `║  Activité : ${ctx.activity}\n` : ""}${ctx.businessBrief ? `║\n║  ─── DESCRIPTION DÉTAILLÉE (la vraie identité de l'agence) ───\n║  ${ctx.businessBrief.replace(/\n/g, "\n║  ")}\n` : ""}${ctx.targetClient ? `║\n║  ─── CLIENT CIBLE ───\n║  ${ctx.targetClient.replace(/\n/g, "\n║  ")}\n` : ""}${ctx.valueProps ? `║\n║  ─── PROPOSITIONS DE VALEUR (à intégrer SANS LES PARAPHRASER) ───\n║  ${ctx.valueProps.replace(/\n/g, "\n║  ")}\n` : ""}╚════════════════════════════════════════════════════════════════════╝

═══ MÉTHODE WYNGO — 5 PHASES (squelette des scripts d'ouverture longs) ═══

PHASE 1 — La transparence du Fondateur
  Se présenter comme fondateur (autorité). Silence 2s. Annoncer franchement que c'est un appel de prospection.
  Demander 45 secondes en échange du droit de raccrocher.

PHASE 2 — Le "Tilt" émotionnel
  Soit "porte trop lourde" (s'il a un site qui ne convertit pas),
  soit "secret le mieux gardé" (s'il n'a pas de site / aucune visibilité).
  Métaphore vivante. Doit faire ressentir qu'on a déjà observé son business.

PHASE 3 — La vision de l'entrepreneur
  Mission : sites qui sont des "commerciaux digitaux 24/7" pas des "cartes de visite".
  Silence 1-2s.
  "Mon but ce n'est PAS de vous vendre quelque chose aujourd'hui."

PHASE 4 — L'offre irrésistible
  "Maquette sur-mesure en 48h, à mes frais, avant tout engagement."
  "Si Wahou on en discute. Sinon on se serre la main virtuellement."

PHASE 5 — L'engagement en douceur
  "2-3 questions pour frapper juste. On fait ça maintenant ou je rappelle ?"

═══ ADAPTATION MULTI-MÉTIER (CRUCIAL) ═══

Le brief de l'utilisateur va contenir un MÉTIER ou un CONTEXTE spécifique
(restaurateur, médecin, avocat, coiffeur, kiné, photographe, e-commerçant…).

→ Tu DOIS adapter chaque phrase aux RÉALITÉS du métier mentionné :
  - Vocabulaire spécifique au métier (clientèle, jargon métier, codes).
  - Exemples concrets pertinents pour CE métier (un restaurateur entend
    "couverts" / "tables ce soir", un médecin entend "consultations" / "patientèle",
    un coiffeur "fauteuil" / "fidélisation", un avocat "dossiers" / "cabinet").
  - Pour la PHASE 2 du "tilt émotionnel" : adapte la métaphore au métier
    (un restaurateur dont la vitrine attire les passants mais dont la carte
    n'est pas en ligne, un médecin recommandé en bouche-à-oreille mais
    introuvable sur Google, etc.).
  - Pour la PHASE 5 : adapte les 2-3 questions aux enjeux DE CE MÉTIER.

→ Tu ne dois JAMAIS écrire un script qui pourrait s'appliquer "à n'importe
  quel commerce". Si on enlève le nom de l'entreprise, on doit IMMÉDIATEMENT
  reconnaître à quel métier ce script s'adresse.

${hasContext ? `═══ RÈGLES OBLIGATOIRES DE TRANSCRIPTION DU CONTEXTE AGENCE ═══

A. Intègre AU MOINS 2 propositions de valeur uniques de l'agence (chiffres exacts).
B. Si l'agence est "cabinet privé", le ton du script est feutré, posture fondateur.
C. Aucun chiffre inventé. Seuls les chiffres présents dans le contexte ci-dessus.
D. Le mot "fondateur" est central pour la rupture vs call-center.

` : ""}═══ EXIGENCES DE FRANÇAIS NATIF (CRITIQUE) ═══

Le script doit être écrit comme par un Français natif francophone éduqué,
qu'on pourrait lire À VOIX HAUTE sans buter sur un mot.

→ Phrases courtes, dites naturellement. Aucune phrase qui dépasse 2 lignes parlées.
→ Articles, prépositions, accords genre/nombre : zéro erreur.
→ Pas de calques de l'anglais ("vous adresser", "atteindre", "supporter" pour "soutenir").
→ Aucun mot administratif ("dans le cadre de", "au niveau de", "à ce sujet").
→ Pas plus d'un participe présent par paragraphe.
→ Toujours actif, jamais passif lourd.
→ Pas de "afin de" si "pour" suffit. Pas de "concernant" si "sur" suffit.
→ Les mots-clés à dire au téléphone doivent être SIMPLES à articuler.

AVANT DE FINALISER, tu RELIS mentalement le script :
1. Un commercial peut-il le lire à voix haute SANS hésiter sur la formulation ?
2. Y a-t-il une seule formule qui sonne IA ou commerciale ? → réécris.
3. Le métier mentionné est-il PALPABLE dans chaque phrase ? → sinon, ajuste.
4. Y a-t-il une faute, un accord douteux ? → corrige.

═══ RÈGLES DE FORME ═══

1. Utilise EXCLUSIVEMENT les variables suivantes : {{prenom}} (prospect), {{entreprise}}, {{expediteur}} (qui appelle).
2. Indications scéniques entre parenthèses ("→ Silence de 2 secondes") quand pertinent.
3. Structure en phases numérotées si le script est long. Sinon adapté au format (voicemail, relance courte…).
4. Vouvoiement strict. Jamais "j'espère que vous allez bien", jamais "désolé de vous déranger".
5. JAMAIS de superlatifs ("le meilleur", "incroyable", "leader").
6. JAMAIS de promesse non chiffrée. Si tu cites un résultat, fais-le sobrement.`;
}

function buildSystemPromptObjection(ctx: any): string {
  const hasContext = ctx.businessBrief || ctx.valueProps;

  return `Tu es un coach senior en télévente B2B. Tu rédiges des réponses-clefs aux objections rencontrées lors d'appels téléphoniques de prospection.

╔════════════════════════════════════════════════════════════════════╗
║  CONTEXTE DE L'AGENCE — À UTILISER, PAS À IGNORER                 ║
╠════════════════════════════════════════════════════════════════════╣
${ctx.agencyName ? `║  Nom : ${ctx.agencyName}\n` : ""}${ctx.activity ? `║  Activité : ${ctx.activity}\n` : ""}${ctx.businessBrief ? `║\n║  ${ctx.businessBrief.replace(/\n/g, "\n║  ")}\n` : ""}${ctx.valueProps ? `║\n║  ─── PROPOSITIONS DE VALEUR (à mobiliser dans les preuves) ───\n║  ${ctx.valueProps.replace(/\n/g, "\n║  ")}\n` : ""}╚════════════════════════════════════════════════════════════════════╝

═══ MÉCANIQUE EN 4 TEMPS (à suivre obligatoirement) ═══

1. **Valider d'abord** ("Je comprends parfaitement", "C'est la meilleure démarche").
2. **Recadrer** sans contredire ("La question n'est pas X mais Y").
3. **Apporter une preuve sobre** — utiliser un chiffre/un fait DU CONTEXTE AGENCE ci-dessus.
   JAMAIS de promesse vague ou de chiffre inventé.
4. **Ré-engagement doux** (pas "achetez", plutôt "faisons un essai sans engagement").

═══ ADAPTATION CONTEXTUELLE ═══

→ Si le brief précise un MÉTIER (médecin, restaurateur, avocat, coiffeur…),
  la preuve apportée doit illustrer le bénéfice POUR CE MÉTIER spécifiquement.
→ Si le brief mentionne un canal (appel direct, voicemail, message LinkedIn),
  adapte la longueur et le débit verbal.

═══ EXEMPLES D'ESPRIT (à imiter, pas à recopier mot pour mot) ═══

- "Je n'ai pas le temps" → "C'est précisément pour ça que je demande 45 secondes, pas une minute. Vous décidez après."
- "C'est trop cher" → "La question n'est pas combien ça coûte, mais combien ça rapporte. Sur nos derniers projets, le ROI moyen constaté est de 7 semaines."
- "Envoyez-moi un email" → "Entre nous, vous savez ce qui se passe : il atterrit dans 200 autres. 60 secondes pour vous expliquer, sinon je vous laisse définitivement."

═══ EXIGENCES DE FRANÇAIS NATIF (CRITIQUE) ═══

→ Phrases courtes, parlées naturellement (le commercial va les LIRE À VOIX HAUTE).
→ Zéro calque anglais, zéro mot administratif, zéro participe présent superflu.
→ Aucun "désolé", aucun "je m'excuse" — posture fondateur, pas employé.
→ Toujours actif. Jamais passif lourd.

AVANT DE FINALISER, tu relis :
1. Est-ce dit comme par un humain au téléphone ?
2. La preuve apportée vient-elle du contexte agence (pas inventée) ?
3. La réponse fait-elle 60-120 mots max ?

═══ RÈGLES DE FORME ═══

1. Variables autorisées : {{prenom}}, {{entreprise}}, {{expediteur}} (parcimonieusement).
2. 60-120 mots max. Pas de paraphrase, pas de remplissage.
3. ${hasContext ? "Mobilise au moins UNE proposition de valeur ou un chiffre du contexte ci-dessus." : "Sois sobre dans les promesses (aucun chiffre inventé)."}`;
}

function buildUserPrompt(input: any): string {
  if (input.kind === "objection") {
    return `Génère une réponse à cette objection téléphonique :

OBJECTION : "${input.brief}"

${input.category ? `Catégorie : ${input.category}` : ""}
${input.extra_notes ? `\nCONTRAINTES SPÉCIFIQUES : ${input.extra_notes}` : ""}

Renvoie aussi :
- Un \`title\` = la phrase exacte de l'objection telle que prononcée par le prospect (entre guillemets français « »)
- Un \`category\` parmi : prix, timing, decideur, concurrent, esquive, voicemail, autre`;
  }
  // kind === script
  const lengthGuide = {
    court: "60-120 mots — adapté aux voicemails et messages courts",
    standard: "le script complet en 5 phases (méthode Wyngo) — environ 300-450 mots",
    long: "version étoffée avec variantes d'option A/B — environ 500-700 mots",
  }[input.length || "standard"];

  return `Génère un script d'appel téléphonique correspondant à ce brief :

OBJECTIF DE L'APPEL : ${input.brief}

TON : ${input.tone || "posture fondateur, transparent, posé"}
LONGUEUR CIBLE : ${lengthGuide}
${input.extra_notes ? `\nCONTRAINTES SPÉCIFIQUES : ${input.extra_notes}` : ""}

Renvoie aussi :
- Un \`title\` court et descriptif (ex : "Appel à froid — premier contact restaurant")
- Une \`category\` parmi : prise_contact, qualification, closing, voicemail, autre`;
}

// ─── Anthropic (Claude) ───
async function generateWithAnthropic(systemPrompt: string, userPrompt: string) {
  const TOOL_DEF = {
    name: "save_call_script",
    description: "Enregistre le script ou la réponse à objection générée.",
    input_schema: {
      type: "object" as const,
      properties: {
        title:    { type: "string" },
        content:  { type: "string" },
        category: { type: "string" },
      },
      required: ["title", "content", "category"],
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
      max_tokens: 2000,
      system: systemPrompt,
      tools: [TOOL_DEF],
      tool_choice: { type: "tool", name: "save_call_script" },
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
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

// ─── Gemini ───
async function generateWithGemini(systemPrompt: string, userPrompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        // Bas pour rester fidèle au contexte agence et à la méthode Wyngo.
        temperature: 0.4,
        // 6000 tokens = budget large pour thinking + JSON final.
        maxOutputTokens: 6000,
        // 1500 tokens de thinking pour permettre la relecture mentale + l'adaptation
        // par métier exigée par le system prompt.
        thinkingConfig: { thinkingBudget: 1500 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            title:    { type: "string" },
            content:  { type: "string" },
            category: { type: "string" },
          },
          required: ["title", "content", "category"],
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const completion = await res.json();
  const text = completion.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");
  let parsed: any;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`Gemini renvoyé du non-JSON : ${text.slice(0, 200)}`); }
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
        hint: "GEMINI_API_KEY ou ANTHROPIC_API_KEY requise dans les secrets Supabase",
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
    if (!input.kind || (input.kind !== "script" && input.kind !== "objection")) {
      return json({ error: "Champ 'kind' requis (script | objection)" }, 400);
    }
    if (!input.brief || typeof input.brief !== "string") {
      return json({ error: "Champ 'brief' requis" }, 400);
    }

    const { data: agency } = await admin
      .from("agency_settings")
      .select("name, activity, business_brief, target_client, value_props, default_tone")
      .eq("id", true)
      .maybeSingle();

    const systemPrompt = input.kind === "script"
      ? buildSystemPromptScript({
          agencyName:    agency?.name,
          activity:      agency?.activity,
          businessBrief: agency?.business_brief,
          targetClient:  agency?.target_client,
          valueProps:    agency?.value_props,
        })
      : buildSystemPromptObjection({
          agencyName:    agency?.name,
          activity:      agency?.activity,
          businessBrief: agency?.business_brief,
        });

    const userPrompt = buildUserPrompt(input);

    let providerResult, providerName: string;
    try {
      if (ANTHROPIC_API_KEY) {
        providerName = "anthropic";
        providerResult = await generateWithAnthropic(systemPrompt, userPrompt);
      } else {
        providerName = "gemini";
        providerResult = await generateWithGemini(systemPrompt, userPrompt);
      }
    } catch (e) {
      console.error("[script-generate] Provider error", e);
      await admin.from("ai_generations").insert({
        owner_id: userId,
        kind: input.kind === "script" ? "call_script" : "call_objection",
        input,
        error: String(e),
        duration_ms: Date.now() - startTime,
      });
      return json({ error: "Génération IA échouée", details: String(e).slice(0, 500) }, 502);
    }

    const result = providerResult.result as { title: string; content: string; category: string };
    if (!result.title || !result.content) {
      return json({ error: "Réponse IA incomplète", raw: result }, 502);
    }

    await admin.from("ai_generations").insert({
      owner_id: userId,
      kind: input.kind === "script" ? "call_script" : "call_objection",
      input,
      output: result,
      model: `${providerName}:${providerResult.model}`,
      tokens_in: providerResult.tokens_in || null,
      tokens_out: providerResult.tokens_out || null,
      duration_ms: Date.now() - startTime,
    });

    return json({
      ...result,
      kind: input.kind,
      provider: providerName,
      tokens_in: providerResult.tokens_in,
      tokens_out: providerResult.tokens_out,
      duration_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error("[script-generate] Uncaught", e);
    if (userId) {
      await admin.from("ai_generations").insert({
        owner_id: userId,
        kind: "call_script",
        input: {},
        error: String(e),
        duration_ms: Date.now() - startTime,
      });
    }
    return json({ error: String(e) }, 500);
  }
});
