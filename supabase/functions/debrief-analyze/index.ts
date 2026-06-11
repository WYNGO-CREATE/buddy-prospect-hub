/**
 * ─── Debrief Analyze — Débrief d'appel par TEXTE ou VOIX ───────────────
 *
 * Deux modes :
 *   A) note texte écrite par le commercial
 *   B) AUDIO : le commercial PARLE son débrief après l'appel (mémo vocal).
 *      Gemini traite l'audio directement (transcription + analyse en 1 appel)
 *      → aucun service de transcription externe, aucun opérateur télécom.
 *
 * L'IA extrait :
 *   - le RÉSULTAT canonique (interested / callback / no_answer / refused / note)
 *   - un résumé propre et court
 *   - la PROCHAINE ACTION + le délai de relance (langage naturel : "lundi"=…)
 *   - du COACHING (1-3 conseils) ADOSSÉ À LA PHILOSOPHIE DE VENTE de l'agence
 *   - (mode audio) la transcription
 *
 * Providers :
 *   - Texte : Gemini (gratuit) → Claude (fallback)
 *   - Audio : Gemini uniquement (capable de comprendre l'audio nativement)
 *
 * Body POST :
 *   { note?: string, audio_base64?: string, mime_type?: string,
 *     prospect?: { first_name?, company?, status? } }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OUTCOMES = ["interested", "callback", "no_answer", "refused", "note"] as const;
type Outcome = typeof OUTCOMES[number];

type Analysis = {
  outcome: Outcome;
  summary: string;
  next_action: string;
  follow_up_days: number | null;
  coaching: string[];
  transcript?: string;
};

async function getAgencyPhilosophy(): Promise<{ philosophy?: string; callDos?: string; callDonts?: string }> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await admin.from("agency_settings")
      .select("philosophy, call_dos, call_donts").eq("id", true).maybeSingle();
    return { philosophy: data?.philosophy, callDos: data?.call_dos, callDonts: data?.call_donts };
  } catch { return {}; }
}

function buildSystemPrompt(phil: { philosophy?: string; callDos?: string; callDonts?: string }): string {
  let p = `Tu es le coach commercial d'un vendeur B2B qui prospecte des TPE françaises par téléphone.
On te donne son débrief d'appel (texte écrit OU enregistrement vocal qu'il vient de dicter).
Tu en extrais une analyse structurée ET tu le coaches. Tu ne fabriques RIEN qui ne soit dans le débrief.

RÉSULTAT (outcome) — choisis EXACTEMENT une valeur :
- "interested" : intéressé, RDV, devis, signaux d'achat clairs.
- "callback"   : à rappeler (pas dispo, demande de rappeler plus tard, à une date).
- "no_answer"  : pas de réponse, répondeur, pas pu le joindre.
- "refused"    : pas intéressé, refus net, "j'ai déjà ce qu'il faut".
- "note"       : simple information sans suite d'appel claire.

DÉLAI DE RELANCE (follow_up_days), en jours :
- Si un moment est mentionné : "demain"=1, "la semaine prochaine"=7, "dans 15 jours"=15, "lundi/mardi…"=jours jusqu'à ce jour, "le mois prochain"=30.
- Sinon défaut : interested=1, callback=2, no_answer=2.
- "refused" et "note" → follow_up_days = null.

COACHING — 1 à 3 conseils COURTS, concrets et bienveillants pour le PROCHAIN appel,
basés sur ce que le débrief révèle (objections mal traitées, closing oublié, argument non utilisé…).`;

  if (phil.philosophy) p += `\n\n=== PHILOSOPHIE DE VENTE DU FONDATEUR (cadre ton coaching, respecte-la) ===\n${phil.philosophy}`;
  if (phil.callDos) p += `\n\n=== TOUJOURS FAIRE (règles d'or de l'agence) ===\n${phil.callDos}`;
  if (phil.callDonts) p += `\n\n=== À NE JAMAIS FAIRE ===\n${phil.callDonts}`;
  p += `\n\nRÈGLES : summary = 1-2 phrases en français, 3e personne, fidèle. next_action = action concrète et impérative. N'invente jamais d'info absente du débrief.`;
  return p;
}

function ctxLine(p?: { first_name?: string; company?: string; status?: string }): string {
  const ctx: string[] = [];
  if (p?.company) ctx.push(`Entreprise : ${p.company}`);
  if (p?.first_name && p.first_name.toLowerCase() !== "contact") ctx.push(`Interlocuteur : ${p.first_name}`);
  if (p?.status) ctx.push(`Statut CRM : ${p.status}`);
  return ctx.length ? ctx.join("\n") + "\n\n" : "";
}

function sanitize(a: Partial<Analysis>): Analysis {
  const outcome = (OUTCOMES as readonly string[]).includes(a.outcome as string) ? a.outcome as Outcome : "note";
  let days = a.follow_up_days ?? null;
  if (outcome === "refused" || outcome === "note") days = null;
  if (typeof days === "number") days = Math.max(0, Math.min(120, Math.round(days)));
  const coaching = Array.isArray(a.coaching) ? a.coaching.map((c) => String(c).slice(0, 240)).filter(Boolean).slice(0, 3) : [];
  return {
    outcome,
    summary: (a.summary || "").toString().slice(0, 600),
    next_action: (a.next_action || "").toString().slice(0, 240),
    follow_up_days: days,
    coaching,
    transcript: a.transcript ? String(a.transcript).slice(0, 4000) : undefined,
  };
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    outcome: { type: "string", enum: OUTCOMES as unknown as string[] },
    summary: { type: "string" },
    next_action: { type: "string" },
    follow_up_days: { type: "integer", nullable: true },
    coaching: { type: "array", items: { type: "string" } },
  },
  required: ["outcome", "summary", "next_action", "coaching"],
};

async function gemini(system: string, parts: unknown[], wantTranscript: boolean): Promise<{ result: Analysis; model: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system + (wantTranscript ? "\n\nRetourne aussi 'transcript' = la transcription fidèle de l'audio." : "") }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2, maxOutputTokens: 1200,
        responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const completion = await res.json();
  const text = completion.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini : réponse vide");
  return { result: sanitize(JSON.parse(text)), model: GEMINI_MODEL };
}

async function anthropic(system: string, userText: string): Promise<{ result: Analysis; model: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: 1000, temperature: 0.2, system,
      messages: [{ role: "user", content: userText }],
      tools: [{ name: "save_analysis", description: "Enregistre l'analyse du débrief.", input_schema: RESPONSE_SCHEMA }],
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
    const { note, audio_base64, mime_type, prospect } = await req.json();
    const hasAudio = !!audio_base64;
    if (!hasAudio && (!note || !note.trim())) return json({ ok: false, error: "Débrief vide" }, 400);

    const phil = await getAgencyPhilosophy();
    const system = buildSystemPrompt(phil);

    // ─── Mode AUDIO : Gemini uniquement ─────────────────────────────
    if (hasAudio) {
      if (!GEMINI_API_KEY) return json({ ok: false, error: "Le débrief vocal nécessite GEMINI_API_KEY." }, 500);
      const parts = [
        { text: `${ctxLine(prospect)}Voici l'enregistrement vocal du débrief d'appel. Analyse-le.` },
        { inline_data: { mime_type: mime_type || "audio/webm", data: audio_base64 } },
      ];
      const out = await gemini(system, parts, true);
      return json({ ok: true, ...out.result, model: out.model });
    }

    // ─── Mode TEXTE ─────────────────────────────────────────────────
    if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
      return json({ ok: false, error: "Aucune clé IA configurée" }, 500);
    }
    const userPrompt = `${ctxLine(prospect)}DÉBRIEF (en vrac) :\n"""\n${note}\n"""\n\nAnalyse ce débrief.`;
    let out: { result: Analysis; model: string };
    if (GEMINI_API_KEY) {
      try { out = await gemini(system, [{ text: userPrompt }], false); }
      catch (e) { if (!ANTHROPIC_API_KEY) throw e; out = await anthropic(system, userPrompt); }
    } else {
      out = await anthropic(system, userPrompt);
    }
    return json({ ok: true, ...out.result, model: out.model });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
