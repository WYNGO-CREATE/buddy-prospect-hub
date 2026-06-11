/**
 * ─── Debrief Analyze — Extraction IA du résultat d'appel ───────────────
 *
 * Le commercial écrit sa note de débrief en vrac ("joint la gérante,
 * intéressée mais veut voir avec son associé, rappeler la semaine pro").
 * L'IA en extrait :
 *   - le RÉSULTAT canonique (interested / callback / no_answer / refused / note)
 *   - un résumé propre et court (1-2 phrases)
 *   - la PROCHAINE ACTION suggérée + un délai de relance en jours
 *
 * Le front pré-remplit le résultat + la relance, le commercial valide en
 * 1 clic. On ne décide jamais à sa place — on lui mâche le travail.
 *
 * Providers (priorité au gratuit) :
 *   1. GEMINI_API_KEY  → Gemini 2.5 Flash (gratuit)
 *   2. ANTHROPIC_API_KEY → Claude (payant, fallback)
 *
 * Body POST : { note: string, prospect?: { first_name?, company?, status? } }
 * Réponse   : { ok, outcome, summary, next_action, follow_up_days, model }
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const OUTCOMES = ["interested", "callback", "no_answer", "refused", "note"] as const;
type Outcome = typeof OUTCOMES[number];

type Analysis = {
  outcome: Outcome;
  summary: string;
  next_action: string;
  follow_up_days: number | null;
};

function buildSystemPrompt(): string {
  return `Tu es l'assistant d'un commercial B2B qui prospecte des TPE françaises par téléphone.
On te donne sa note de débrief d'appel, écrite en vrac, parfois en style télégraphique.
Tu dois en extraire une analyse structurée, factuelle, SANS rien inventer qui ne soit dans la note.

RÉSULTAT (outcome) — choisis EXACTEMENT une valeur :
- "interested" : le prospect est intéressé, veut un RDV, un devis, en savoir plus, signaux d'achat clairs.
- "callback"   : il faut le rappeler (pas dispo, demande de rappeler plus tard, à recontacter à une date).
- "no_answer"  : pas de réponse, répondeur, pas pu le joindre, ligne occupée.
- "refused"    : pas intéressé, refus net, "j'ai déjà ce qu'il faut", "ne rappelez plus".
- "note"       : simple information sans suite d'appel claire (note de contexte).

DÉLAI DE RELANCE (follow_up_days) — nombre de jours avant la prochaine relance :
- Si la note mentionne un moment ("demain"=1, "la semaine prochaine"=7, "dans 15 jours"=15, "lundi"=jours jusqu'à lundi, "le mois prochain"=30), utilise-le.
- Sinon, valeur par défaut selon le résultat : interested=1, callback=2, no_answer=2, refused=null, note=null.
- "refused" et "note" → follow_up_days = null (pas de relance).

RÈGLES :
- summary : reformule proprement en 1-2 phrases, en français, à la 3e personne. Reste fidèle.
- next_action : l'action concrète suivante, courte et impérative ("Envoyer l'aperçu par email", "Rappeler mardi matin", "Préparer un devis").
- N'invente jamais d'info absente de la note.`;
}

function buildUserPrompt(note: string, p?: { first_name?: string; company?: string; status?: string }): string {
  const ctx: string[] = [];
  if (p?.company) ctx.push(`Entreprise : ${p.company}`);
  if (p?.first_name && p.first_name.toLowerCase() !== "contact") ctx.push(`Interlocuteur : ${p.first_name}`);
  if (p?.status) ctx.push(`Statut CRM actuel : ${p.status}`);
  return `${ctx.length ? ctx.join("\n") + "\n\n" : ""}NOTE DE DÉBRIEF (en vrac) :\n"""\n${note}\n"""\n\nAnalyse cette note.`;
}

function sanitize(a: Partial<Analysis>): Analysis {
  const outcome = (OUTCOMES as readonly string[]).includes(a.outcome as string) ? a.outcome as Outcome : "note";
  let days = a.follow_up_days;
  if (outcome === "refused" || outcome === "note") days = null;
  if (typeof days === "number") days = Math.max(0, Math.min(120, Math.round(days)));
  else days = days === null ? null : null;
  return {
    outcome,
    summary: (a.summary || "").toString().slice(0, 500),
    next_action: (a.next_action || "").toString().slice(0, 200),
    follow_up_days: days,
  };
}

async function withGemini(system: string, user: string): Promise<{ result: Analysis; model: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            outcome: { type: "string", enum: OUTCOMES as unknown as string[] },
            summary: { type: "string" },
            next_action: { type: "string" },
            follow_up_days: { type: "integer", nullable: true },
          },
          required: ["outcome", "summary", "next_action"],
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const completion = await res.json();
  const text = completion.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini : réponse vide");
  return { result: sanitize(JSON.parse(text)), model: GEMINI_MODEL };
}

async function withAnthropic(system: string, user: string): Promise<{ result: Analysis; model: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
      tools: [{
        name: "save_analysis",
        description: "Enregistre l'analyse du débrief d'appel.",
        input_schema: {
          type: "object",
          properties: {
            outcome: { type: "string", enum: OUTCOMES as unknown as string[] },
            summary: { type: "string" },
            next_action: { type: "string" },
            follow_up_days: { type: ["integer", "null"] },
          },
          required: ["outcome", "summary", "next_action"],
        },
      }],
      tool_choice: { type: "tool", name: "save_analysis" },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const completion = await res.json();
  const toolUse = (completion.content || []).find((c: { type: string }) => c.type === "tool_use") as { input: Partial<Analysis> } | undefined;
  if (!toolUse?.input) throw new Error("Anthropic : pas de tool_use");
  return { result: sanitize(toolUse.input), model: ANTHROPIC_MODEL };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { note, prospect } = await req.json();
    if (!note || !note.trim()) return json({ ok: false, error: "Note vide" }, 400);
    if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "Aucune clé IA configurée (GEMINI_API_KEY ou ANTHROPIC_API_KEY)" }, 500);
    }
    const system = buildSystemPrompt();
    const userPrompt = buildUserPrompt(note, prospect);

    let out: { result: Analysis; model: string };
    if (GEMINI_API_KEY) {
      try { out = await withGemini(system, userPrompt); }
      catch (e) {
        if (!ANTHROPIC_API_KEY) throw e;
        out = await withAnthropic(system, userPrompt);
      }
    } else {
      out = await withAnthropic(system, userPrompt);
    }

    return json({ ok: true, ...out.result, model: out.model });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
