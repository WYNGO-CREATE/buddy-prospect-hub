/**
 * ─── Call Prep — Préparation d'appel IA (avant d'appeler) ──────────────
 *
 * Donné un prospect, l'IA prépare le commercial à l'appel en s'appuyant
 * sur TOUT le contexte (fiche, statut site web, aperçu, historique des
 * appels, offre + philosophie de l'agence) :
 *   - objectif : le but concret de CET appel (selon où on en est)
 *   - accroche : la phrase d'ouverture EXACTE à dire, taillée pour ce
 *                prospect, dans la voix de l'agence (jamais générique)
 *   - points_cles : 2-4 angles/faits à mobiliser ("pas de site", note
 *                Google, aperçu déjà ouvert…)
 *   - objections_probables : [{ objection, reponse }] adossées à la méthode
 *   - prochaine_etape : à quoi ressemble un appel réussi
 *
 * Body POST : { prospect_id: string }
 * Providers : Gemini (gratuit) → Claude (fallback).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Prep = {
  objectif: string;
  accroche: string;
  points_cles: string[];
  objections_probables: { objection: string; reponse: string }[];
  prochaine_etape: string;
};

async function getContext(prospectId: string): Promise<{ ctx: string; firstName: string }> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const lines: string[] = [];
  let firstName = "";
  try {
    const [{ data: p }, { data: calls }, { data: prev }, { data: agency }] = await Promise.all([
      admin.from("prospects").select("first_name, last_name, company, status, industry, location, website_status, website_score, notes, created_at").eq("id", prospectId).maybeSingle(),
      admin.from("call_logs").select("outcome, summary, called_at").eq("prospect_id", prospectId).order("called_at", { ascending: false }).limit(5),
      admin.from("prospect_previews").select("generated_at, opened_at, view_count").eq("prospect_id", prospectId).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("agency_settings").select("name, business_brief, value_props, philosophy, call_dos, call_donts").eq("id", true).maybeSingle(),
    ]);

    if (p) {
      const fn = (p.first_name || "").toLowerCase() === "contact" ? "" : (p.first_name || "");
      firstName = fn;
      lines.push(`# LE PROSPECT À APPELER`);
      if (p.company) lines.push(`Entreprise : ${p.company}`);
      if (fn || p.last_name) lines.push(`Interlocuteur : ${fn} ${p.last_name || ""}`.trim());
      if (p.industry) lines.push(`Secteur : ${p.industry}`);
      if (p.location) lines.push(`Ville : ${p.location}`);
      if (p.status) lines.push(`Statut CRM : ${p.status}`);
      if (p.website_status) {
        const w = p.website_status === "none" ? "AUCUN site web (angle d'attaque idéal : il rate des clients en ligne)"
          : p.website_status === "outdated" ? `site VIEILLISSANT (score ${p.website_score ?? "?"}/100 — angle : il a un site mais qui le dessert)`
          : "a déjà un site correct (angle : amélioration / fonctionnalités)";
        lines.push(`Présence web : ${w}`);
      }
      if (p.created_at) {
        const d = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86_400_000);
        lines.push(`Dans le pipe depuis : ${d} jour(s)`);
      }
      if (p.notes) lines.push(`Notes : ${String(p.notes).slice(0, 300)}`);
    }
    if (prev) {
      if (prev.opened_at) lines.push(`\n# APERÇU : déjà OUVERT ${prev.view_count ?? 1}× (signal d'intérêt — rebondis dessus !)`);
      else if (prev.generated_at) lines.push(`\n# APERÇU : envoyé mais pas encore ouvert`);
    } else {
      lines.push(`\n# APERÇU : aucun pour l'instant (tu peux proposer d'en faire un)`);
    }
    if (calls && calls.length > 0) {
      lines.push(`\n# HISTORIQUE DES ${calls.length} DERNIERS APPELS`);
      for (const c of calls) lines.push(`- ${new Date(c.called_at).toLocaleDateString("fr-FR")} [${c.outcome || "?"}] ${c.summary ? String(c.summary).slice(0, 140) : ""}`);
    } else {
      lines.push(`\n# HISTORIQUE : premier appel (jamais contacté par téléphone)`);
    }
    if (agency) {
      lines.push(`\n# TON AGENCE (ce que tu vends)`);
      if (agency.name) lines.push(`Nom : ${agency.name}`);
      if (agency.business_brief) lines.push(`Offre : ${String(agency.business_brief).slice(0, 400)}`);
      if (agency.value_props) lines.push(`Arguments : ${String(agency.value_props).slice(0, 400)}`);
      if (agency.philosophy) lines.push(`PHILOSOPHIE (respecte-la dans l'accroche) : ${String(agency.philosophy).slice(0, 500)}`);
      if (agency.call_dos) lines.push(`Toujours faire : ${String(agency.call_dos).slice(0, 300)}`);
      if (agency.call_donts) lines.push(`Ne jamais faire : ${String(agency.call_donts).slice(0, 300)}`);
    }
  } catch { /* best effort */ }
  return { ctx: lines.join("\n"), firstName };
}

function systemPrompt(): string {
  return `Tu es un coach commercial d'élite. Tu prépares un vendeur à passer un appel de prospection à une TPE française (pour lui vendre un site web / une présence en ligne via une maquette offerte).

À partir du contexte fourni, tu prépares l'appel — concret, taillé pour CE prospect, jamais générique. Tu produis :

1. objectif : le but concret de CET appel précis, selon où on en est (1 phrase).
2. accroche : la PHRASE D'OUVERTURE exacte à prononcer (1-2 phrases), naturelle, humaine, qui accroche en mentionnant un détail SPÉCIFIQUE du prospect (son secteur, sa ville, son absence de site, sa note Google, son aperçu déjà ouvert…). Respecte la philosophie de l'agence. JAMAIS "j'espère que vous allez bien". Si on connaît son prénom, tu peux l'utiliser ; sinon n'invente pas de nom.
3. points_cles : 2 à 4 angles/faits CONCRETS à mobiliser pendant l'appel (puces courtes).
4. objections_probables : 1 à 3 objections que CE prospect risque de soulever, chacune avec la meilleure réponse (adossée à la méthode de l'agence).
5. prochaine_etape : à quoi ressemble un appel réussi (l'engagement à obtenir).

RÈGLES : reste fidèle au contexte, n'invente aucun fait. Sois direct, actionnable, prêt à l'emploi. Tout en français.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    objectif: { type: "string" },
    accroche: { type: "string" },
    points_cles: { type: "array", items: { type: "string" } },
    objections_probables: { type: "array", items: { type: "object", properties: { objection: { type: "string" }, reponse: { type: "string" } }, required: ["objection", "reponse"] } },
    prochaine_etape: { type: "string" },
  },
  required: ["objectif", "accroche", "points_cles", "objections_probables", "prochaine_etape"],
};

function sanitize(a: Partial<Prep>): Prep {
  const arr = (v: unknown, n: number) => Array.isArray(v) ? v.map((x) => String(x).slice(0, 240)).filter(Boolean).slice(0, n) : [];
  const objs = Array.isArray(a.objections_probables)
    ? a.objections_probables.slice(0, 3).map((o) => ({ objection: String(o?.objection || "").slice(0, 200), reponse: String(o?.reponse || "").slice(0, 300) })).filter((o) => o.objection)
    : [];
  return {
    objectif: (a.objectif || "").toString().slice(0, 300),
    accroche: (a.accroche || "").toString().slice(0, 400),
    points_cles: arr(a.points_cles, 4),
    objections_probables: objs,
    prochaine_etape: (a.prochaine_etape || "").toString().slice(0, 300),
  };
}

async function gemini(system: string, user: string): Promise<{ result: Prep; model: string }> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1200, responseMimeType: "application/json", responseSchema: SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const c = await res.json();
  const t = c.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!t) throw new Error("Gemini vide");
  return { result: sanitize(JSON.parse(t)), model: GEMINI_MODEL };
}

async function anthropic(system: string, user: string): Promise<{ result: Prep; model: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: 1200, temperature: 0.4, system,
      messages: [{ role: "user", content: user }],
      tools: [{ name: "prep_call", description: "Prépare l'appel.", input_schema: SCHEMA }],
      tool_choice: { type: "tool", name: "prep_call" },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const c = await res.json();
  const tool = (c.content || []).find((x: { type: string }) => x.type === "tool_use") as { input: Partial<Prep> } | undefined;
  if (!tool?.input) throw new Error("Anthropic: pas de tool_use");
  return { result: sanitize(tool.input), model: ANTHROPIC_MODEL };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { prospect_id } = await req.json();
    if (!prospect_id) return json({ ok: false, error: "prospect_id requis" }, 400);

    // Auth + propriété
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user?.id) return json({ ok: false, error: "Non authentifié" }, 401);
    const { data: owns } = await userClient.from("prospects").select("id").eq("id", prospect_id).maybeSingle();
    if (!owns) return json({ ok: false, error: "Accès refusé" }, 403);

    if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) return json({ ok: false, error: "Aucune clé IA configurée" }, 500);

    const { ctx } = await getContext(prospect_id);
    const user = `=== CONTEXTE ===\n${ctx}\n\nPrépare-moi à appeler ce prospect maintenant.`;
    const sys = systemPrompt();

    let out: { result: Prep; model: string };
    if (GEMINI_API_KEY) {
      try { out = await gemini(sys, user); }
      catch (e) { if (!ANTHROPIC_API_KEY) throw e; out = await anthropic(sys, user); }
    } else { out = await anthropic(sys, user); }

    return json({ ok: true, ...out.result, model: out.model });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
