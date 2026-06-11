/**
 * ─── Debrief Analyze — Cerveau de closer (texte OU voix) ───────────────
 *
 * Le commercial débriefe son appel (écrit ou parlé). L'IA ne se contente
 * pas de noter : elle analyse la SITUATION COMPLÈTE du prospect (historique
 * des appels, statut de l'aperçu, site web, offre de l'agence) et coache
 * le commercial pour CONVERTIR ce prospect précis en client.
 *
 * Contexte injecté automatiquement (côté serveur, service_role) :
 *   - Fiche prospect (secteur, ville, statut site web, statut CRM)
 *   - Historique des derniers appels (où on en est dans le cycle)
 *   - Statut de l'Aperçu Instantané (envoyé ? ouvert ? combien de fois ?)
 *   - Identité + offre + philosophie de vente de l'agence
 *
 * Sortie (analyse de closer) :
 *   - outcome, summary, next_action, follow_up_days
 *   - temperature (0-100 : proximité de la signature)
 *   - buying_signals[] : signaux d'achat à exploiter
 *   - objections[] : { objection, handled, rebuttal (adossé à la méthode) }
 *   - blocker : LE frein principal à lever pour signer
 *   - closing_move : le move concret recommandé pour faire signer
 *   - suggested_message : message de relance prêt à envoyer
 *   - coaching[] : conseils pour progresser
 *   - transcript (mode voix)
 *
 * Providers : texte → Gemini (gratuit) → Claude ; audio → Gemini.
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

type Objection = { objection: string; handled: boolean; rebuttal: string };
type Analysis = {
  outcome: Outcome;
  summary: string;
  next_action: string;
  follow_up_days: number | null;
  temperature: number;
  buying_signals: string[];
  objections: Objection[];
  blocker: string;
  closing_move: string;
  suggested_message: string;
  coaching: string[];
  transcript?: string;
};

// ─── Récupère TOUT le contexte du prospect pour une analyse situationnelle
async function getContext(prospectId?: string): Promise<string> {
  if (!prospectId) return "";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const lines: string[] = [];
  try {
    const [{ data: p }, { data: calls }, { data: prev }, { data: agency }] = await Promise.all([
      admin.from("prospects").select("first_name, last_name, company, status, industry, location, website_status, website_score, notes, created_at").eq("id", prospectId).maybeSingle(),
      admin.from("call_logs").select("outcome, summary, called_at").eq("prospect_id", prospectId).order("called_at", { ascending: false }).limit(5),
      admin.from("prospect_previews").select("generated_at, opened_at, view_count").eq("prospect_id", prospectId).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("agency_settings").select("name, business_brief, value_props, philosophy, call_dos, call_donts").eq("id", true).maybeSingle(),
    ]);

    if (p) {
      lines.push(`# LE PROSPECT`);
      if (p.company) lines.push(`Entreprise : ${p.company}`);
      const fn = (p.first_name || "").toLowerCase() === "contact" ? "" : p.first_name;
      if (fn || p.last_name) lines.push(`Interlocuteur : ${fn || ""} ${p.last_name || ""}`.trim());
      if (p.industry) lines.push(`Secteur : ${p.industry}`);
      if (p.location) lines.push(`Ville : ${p.location}`);
      if (p.status) lines.push(`Statut CRM : ${p.status}`);
      if (p.website_status) {
        const wsLabel = p.website_status === "none" ? "AUCUN site web (cible idéale)"
          : p.website_status === "outdated" ? `site VIEILLISSANT (score ${p.website_score ?? "?"}/100 — argument fort)`
          : "a déjà un site correct";
        lines.push(`Présence web : ${wsLabel}`);
      }
      if (p.created_at) {
        const days = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86_400_000);
        lines.push(`Dans le pipe depuis : ${days} jour(s)`);
      }
      if (p.notes) lines.push(`Notes : ${String(p.notes).slice(0, 300)}`);
    }

    if (prev) {
      lines.push(``, `# APERÇU INSTANTANÉ`);
      if (prev.opened_at) lines.push(`Aperçu OUVERT ${prev.view_count ?? 1}× (signal d'intérêt fort !) — dernière ouverture ${new Date(prev.opened_at).toLocaleDateString("fr-FR")}`);
      else if (prev.generated_at) lines.push(`Aperçu envoyé le ${new Date(prev.generated_at).toLocaleDateString("fr-FR")} mais PAS encore ouvert`);
    } else {
      lines.push(``, `# APERÇU INSTANTANÉ : aucun aperçu créé pour l'instant`);
    }

    if (calls && calls.length > 0) {
      lines.push(``, `# HISTORIQUE DES ${calls.length} DERNIERS APPELS (du + récent au + ancien)`);
      for (const c of calls) {
        const d = new Date(c.called_at).toLocaleDateString("fr-FR");
        lines.push(`- ${d} [${c.outcome || "?"}] ${c.summary ? String(c.summary).slice(0, 150) : ""}`);
      }
    }

    if (agency) {
      lines.push(``, `# TON AGENCE (l'offre que tu vends)`);
      if (agency.name) lines.push(`Nom : ${agency.name}`);
      if (agency.business_brief) lines.push(`Offre : ${String(agency.business_brief).slice(0, 400)}`);
      if (agency.value_props) lines.push(`Arguments de valeur : ${String(agency.value_props).slice(0, 400)}`);
      if (agency.philosophy) lines.push(`PHILOSOPHIE DE VENTE (respecte-la dans tes conseils) : ${String(agency.philosophy).slice(0, 500)}`);
      if (agency.call_dos) lines.push(`Toujours faire : ${String(agency.call_dos).slice(0, 300)}`);
      if (agency.call_donts) lines.push(`Ne jamais faire : ${String(agency.call_donts).slice(0, 300)}`);
    }
  } catch (_e) { /* contexte best-effort */ }
  return lines.join("\n");
}

function buildSystemPrompt(): string {
  return `Tu es un CLOSER B2B d'élite et le coach personnel d'un commercial qui prospecte des TPE françaises par téléphone pour leur vendre un site web / une présence en ligne (via une "maquette/aperçu" offerte).

Ton unique obsession : faire SIGNER ce prospect précis. Tu analyses le débrief de l'appel À LA LUMIÈRE de tout le contexte fourni (historique, statut de l'aperçu, site actuel, offre de l'agence) et tu donnes un plan de closing concret, pas des banalités.

Tu dois produire :

1. outcome — EXACTEMENT une valeur :
   interested (intéressé/RDV/signaux d'achat) · callback (à rappeler) · no_answer (pas joint) · refused (refus net) · note (info sans suite claire).

2. follow_up_days — délai de relance en jours. Langage naturel : "demain"=1, "semaine prochaine"=7, "lundi"=jours jusqu'à lundi, "le mois prochain"=30. Défaut : interested=1, callback=2, no_answer=2. refused/note=null. NE LAISSE JAMAIS un prospect chaud sans relance rapprochée.

3. summary — 1-2 phrases fidèles, en français, 3e personne.

4. temperature — entier 0-100 : à quel point ce prospect est PROCHE de signer, d'après TOUTES les preuves (a-t-il ouvert l'aperçu ? signaux d'achat ? objections levées ? historique ?). Sois lucide, pas optimiste.

5. buying_signals — les signaux d'achat concrets repérés (verbatim ou faits). Vide si aucun.

6. objections — pour CHAQUE objection/frein exprimé : { objection, handled (l'a-t-il bien traité ?), rebuttal (LA meilleure réponse à donner la prochaine fois, adossée à la philosophie et aux arguments de l'agence) }. Vide si aucune.

7. blocker — LE frein numéro 1 qui empêche la signature aujourd'hui (1 phrase). Si tout est ok : "Aucun frein majeur — il faut demander la signature".

8. closing_move — le PROCHAIN MOVE concret et précis pour avancer vers la signature de CE prospect (pas générique). Ex : "Envoie l'aperçu maintenant et propose un créneau de 10 min mardi pour le commenter ensemble", "Lève le doute prix en rappelant le risque zéro de la maquette offerte, puis propose de démarrer".

9. suggested_message — un message de relance COURT (SMS/WhatsApp, 2-3 phrases max), prêt à copier-coller, taillé pour ce prospect et son contexte, qui pousse vers la prochaine étape. Ton naturel, humain, jamais robotique. Pas de "j'espère que vous allez bien".

10. coaching — 1 à 3 conseils courts et actionnables pour que le commercial progresse, basés sur ce qu'il a (mal) fait dans cet appel. Adossés à la philosophie de l'agence.

RÈGLES D'OR :
- N'invente JAMAIS un fait, une objection ou un signal absent du débrief.
- Sois concret et spécifique à CE prospect — bannis les conseils génériques.
- Pense conversion à chaque ligne : ton job c'est de transformer ce prospect en client.`;
}

function sanitize(a: Partial<Analysis>): Analysis {
  const outcome = (OUTCOMES as readonly string[]).includes(a.outcome as string) ? a.outcome as Outcome : "note";
  let days = a.follow_up_days ?? null;
  if (outcome === "refused" || outcome === "note") days = null;
  if (typeof days === "number") days = Math.max(0, Math.min(120, Math.round(days)));
  let temp = typeof a.temperature === "number" ? Math.max(0, Math.min(100, Math.round(a.temperature))) : 0;
  if (outcome === "refused") temp = Math.min(temp, 10);
  const objections: Objection[] = Array.isArray(a.objections)
    ? a.objections.slice(0, 4).map((o) => ({
        objection: String(o?.objection || "").slice(0, 200),
        handled: !!o?.handled,
        rebuttal: String(o?.rebuttal || "").slice(0, 300),
      })).filter((o) => o.objection)
    : [];
  const arr = (v: unknown, n: number, len: number) => Array.isArray(v) ? v.map((x) => String(x).slice(0, len)).filter(Boolean).slice(0, n) : [];
  return {
    outcome,
    summary: (a.summary || "").toString().slice(0, 600),
    next_action: (a.next_action || "").toString().slice(0, 240),
    follow_up_days: days,
    temperature: temp,
    buying_signals: arr(a.buying_signals, 5, 160),
    objections,
    blocker: (a.blocker || "").toString().slice(0, 240),
    closing_move: (a.closing_move || "").toString().slice(0, 400),
    suggested_message: (a.suggested_message || "").toString().slice(0, 600),
    coaching: arr(a.coaching, 3, 240),
    transcript: a.transcript ? String(a.transcript).slice(0, 4000) : undefined,
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    transcript: { type: "string" },
    outcome: { type: "string", enum: OUTCOMES as unknown as string[] },
    summary: { type: "string" },
    next_action: { type: "string" },
    follow_up_days: { type: "integer", nullable: true },
    temperature: { type: "integer" },
    buying_signals: { type: "array", items: { type: "string" } },
    objections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          objection: { type: "string" },
          handled: { type: "boolean" },
          rebuttal: { type: "string" },
        },
        required: ["objection", "handled", "rebuttal"],
      },
    },
    blocker: { type: "string" },
    closing_move: { type: "string" },
    suggested_message: { type: "string" },
    coaching: { type: "array", items: { type: "string" } },
  },
  required: ["outcome", "summary", "next_action", "temperature", "blocker", "closing_move", "suggested_message", "coaching"],
};

async function gemini(system: string, parts: unknown[], wantTranscript: boolean): Promise<{ result: Analysis; model: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system + (wantTranscript ? "\n\nRetourne aussi 'transcript' = transcription fidèle de l'audio." : "") }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2200, responseMimeType: "application/json", responseSchema: SCHEMA },
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
      model: ANTHROPIC_MODEL, max_tokens: 2200, temperature: 0.3, system,
      messages: [{ role: "user", content: userText }],
      tools: [{ name: "save_analysis", description: "Enregistre l'analyse de closing.", input_schema: SCHEMA }],
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
    const { note, audio_base64, mime_type, prospect_id } = await req.json();
    const hasAudio = !!audio_base64;
    if (!hasAudio && (!note || !note.trim())) return json({ ok: false, error: "Débrief vide" }, 400);

    const system = buildSystemPrompt();
    const context = await getContext(prospect_id);
    const ctxBlock = context ? `=== CONTEXTE COMPLET DU PROSPECT ===\n${context}\n\n` : "";

    if (hasAudio) {
      if (!GEMINI_API_KEY) return json({ ok: false, error: "Le débrief vocal nécessite GEMINI_API_KEY." }, 500);
      const parts = [
        { text: `${ctxBlock}Voici l'enregistrement vocal du débrief de l'appel qui vient d'avoir lieu. Analyse-le pour faire signer ce prospect.` },
        { inline_data: { mime_type: mime_type || "audio/webm", data: audio_base64 } },
      ];
      const out = await gemini(system, parts, true);
      return json({ ok: true, ...out.result, model: out.model });
    }

    if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) return json({ ok: false, error: "Aucune clé IA configurée" }, 500);
    const userPrompt = `${ctxBlock}=== DÉBRIEF DE L'APPEL (en vrac) ===\n"""\n${note}\n"""\n\nAnalyse ce débrief pour faire signer ce prospect.`;
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
