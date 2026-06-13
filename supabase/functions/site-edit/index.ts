/**
 * ─── Site Edit — Éditeur de site IA BLINDÉ (Wyngo Studio) ─────────────
 *
 * Objectif : n'importe quelle demande de modif doit s'appliquer, 0 bug.
 *
 * Stratégie multi-niveaux (on s'arrête au 1er qui réussit) :
 *   1. Réécriture HTML COMPLET (Gemini → Claude) — idéal pour tout type
 *      de changement. Validé (anti-troncature, anti-réponse cassée).
 *   2. Si invalide/tronqué → 2e tentative de réécriture (les LLM sont
 *      stochastiques, un retry suffit souvent).
 *   3. Si encore KO → éditions ciblées find/replace (Gemini schéma →
 *      Claude tool) avec correspondance TOLÉRANTE aux espaces.
 *   4. Sinon → message clair, le HTML d'origine est préservé (jamais cassé).
 *
 * Body POST : { site_id, instruction }
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

// ════════════ NIVEAU 1-2 : RÉÉCRITURE HTML COMPLET ════════════════════

const SYSTEM_REWRITE = `Tu es un éditeur de sites web expert. On te donne le HTML COMPLET d'un site (page unique, Tailwind/CSS inline) et une instruction de modification en français.

Tu RENVOIES LE DOCUMENT HTML COMPLET MODIFIÉ, du <!doctype html> au </html> final.

RÈGLES ABSOLUES :
- Applique EXACTEMENT ce que demande l'instruction. Fais toujours de ton mieux pour réaliser la demande, même approximative — ne refuse jamais.
- Conserve TOUT le reste à l'identique : structure, styles, sections, images (mêmes URLs src), scripts. Ne touche QUE ce qui est concerné.
- Ne raccourcis JAMAIS, pas de "...", pas de résumé. Renvoie l'INTÉGRALITÉ du HTML.
- N'invente pas d'infos fausses (téléphone, adresse réels…). Si une info manque, garde un placeholder neutre.
- Réponse = UNIQUEMENT le HTML. Aucune phrase hors du HTML, aucune balise markdown (pas de \`\`\`).
- En toute 1re ligne, avant le <!doctype>, mets : <!--SUMMARY: ce que tu as changé, court-->`;

function extractHtml(raw: string): { html: string; summary: string } {
  let t = (raw || "").trim();
  t = t.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let summary = "";
  const m = t.match(/<!--\s*SUMMARY:\s*([\s\S]*?)-->/i);
  if (m) summary = m[1].trim();
  t = t.replace(/<!--\s*SUMMARY:[\s\S]*?-->/i, "").trim();
  // Extraction stricte : du 1er <!doctype/<html au dernier </html>
  const lower = t.toLowerCase();
  let start = lower.indexOf("<!doctype");
  if (start < 0) start = lower.indexOf("<html");
  const end = lower.lastIndexOf("</html>");
  if (start >= 0 && end > start) t = t.slice(start, end + 7);
  return { html: t, summary };
}

function isValidRewrite(rewritten: string, original: string): boolean {
  if (!rewritten || rewritten.length < 200) return false;
  const lower = rewritten.toLowerCase();
  const complete = lower.includes("</html>") || lower.includes("</body>"); // pas tronqué
  const hasContent = lower.includes("<body") || lower.includes("<main") || lower.includes("<section") || lower.includes("<div");
  const lenOk = rewritten.length >= original.length * 0.5 && rewritten.length <= original.length * 3.5;
  return complete && hasContent && lenOk;
}

// Renvoie { html, summary, truncated }. truncated = sortie coupée (MAX_TOKENS).
async function geminiRewrite(html: string, instruction: string): Promise<{ html: string; summary: string; truncated: boolean } | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_REWRITE }] },
        contents: [{ role: "user", parts: [{ text: `INSTRUCTION : ${instruction}\n\n=== HTML ACTUEL ===\n${html}` }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 65536 },
      }),
    });
    if (!res.ok) { console.log("[site-edit] gemini", res.status, (await res.text()).slice(0, 160)); return null; }
    const c = await res.json();
    const cand = c.candidates?.[0];
    const t = cand?.content?.parts?.[0]?.text;
    if (!t) return null;
    const truncated = cand?.finishReason === "MAX_TOKENS";
    return { ...extractHtml(t), truncated };
  } catch (e) { console.log("[site-edit] gemini err", (e as Error).message); return null; }
}

async function claudeRewrite(html: string, instruction: string): Promise<{ html: string; summary: string; truncated: boolean } | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 32000, temperature: 0.15, system: SYSTEM_REWRITE,
        messages: [{ role: "user", content: `INSTRUCTION : ${instruction}\n\n=== HTML ACTUEL ===\n${html}` }],
      }),
    });
    if (!res.ok) { console.log("[site-edit] claude", res.status, (await res.text()).slice(0, 160)); return null; }
    const c = await res.json();
    const t = (c.content || []).find((x: { type: string }) => x.type === "text")?.text;
    if (!t) return null;
    const truncated = c.stop_reason === "max_tokens";
    return { ...extractHtml(t), truncated };
  } catch (e) { console.log("[site-edit] claude err", (e as Error).message); return null; }
}

// ════════════ NIVEAU 3 : ÉDITIONS CIBLÉES (fallback) ══════════════════

type Edit = { find: string; replace: string };
const SYSTEM_EDITS = `Tu es un éditeur de sites web. On te donne le HTML d'un site et une instruction. Renvoie des éditions ciblées en JSON.
- Chaque "find" = sous-chaîne EXACTE présente dans le HTML (recopie au caractère près, assez longue pour être unique).
- "replace" = le nouveau texte.
- Fais le minimum d'éditions, ciblées sur la demande. Renvoie { "edits":[{"find","replace"}], "summary":"..." }.`;
const EDITS_SCHEMA = { type: "object", properties: { edits: { type: "array", items: { type: "object", properties: { find: { type: "string" }, replace: { type: "string" } }, required: ["find", "replace"] } }, summary: { type: "string" } }, required: ["edits", "summary"] };

async function aiFindReplace(html: string, instruction: string): Promise<{ edits: Edit[]; summary: string }> {
  const user = `INSTRUCTION : ${instruction}\n\n=== HTML ===\n${html}`;
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_EDITS }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 8000, responseMimeType: "application/json", responseSchema: EDITS_SCHEMA } }),
      });
      if (res.ok) { const c = await res.json(); const t = c.candidates?.[0]?.content?.parts?.[0]?.text; if (t) { const p = JSON.parse(t); return { edits: p.edits || [], summary: p.summary || "" }; } }
    } catch (e) { console.log("[site-edit] gemini edits err", (e as Error).message); }
  }
  if (ANTHROPIC_API_KEY) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 8000, temperature: 0.2, system: SYSTEM_EDITS, messages: [{ role: "user", content: user }], tools: [{ name: "apply_edits", description: "Éditions du site.", input_schema: EDITS_SCHEMA }], tool_choice: { type: "tool", name: "apply_edits" } }),
    });
    if (res.ok) { const c = await res.json(); const tool = (c.content || []).find((x: { type: string }) => x.type === "tool_use") as { input: { edits: Edit[]; summary: string } } | undefined; if (tool?.input) return { edits: tool.input.edits || [], summary: tool.input.summary || "" }; }
  }
  return { edits: [], summary: "" };
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Applique les éditions avec correspondance TOLÉRANTE (exacte puis espaces souples).
function applyEdits(html: string, edits: Edit[]): { html: string; applied: number } {
  let out = html, applied = 0;
  for (const e of edits) {
    if (!e.find) continue;
    const idx = out.indexOf(e.find);
    if (idx !== -1) { out = out.slice(0, idx) + (e.replace ?? "") + out.slice(idx + e.find.length); applied++; continue; }
    // Tolérance aux espaces : transforme les runs d'espaces de "find" en \s+
    try {
      const pattern = escapeRe(e.find.trim()).replace(/\s+/g, "\\s+");
      const re = new RegExp(pattern);
      if (re.test(out)) { out = out.replace(re, () => e.replace ?? ""); applied++; }
    } catch { /* skip */ }
  }
  return { html: out, applied };
}

// Une tentative complète : Gemini → valider → Claude → valider.
async function tryRewrite(original: string, instruction: string): Promise<{ html: string; summary: string } | null> {
  const g = await geminiRewrite(original, instruction);
  if (g && !g.truncated && isValidRewrite(g.html, original)) return { html: g.html, summary: g.summary };
  const c = await claudeRewrite(original, instruction);
  if (c && !c.truncated && isValidRewrite(c.html, original)) return { html: c.html, summary: c.summary };
  return null;
}

// ════════════ HANDLER ═════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { site_id, instruction } = await req.json();
    if (!site_id || !instruction?.trim()) return json({ ok: false, error: "site_id et instruction requis" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ ok: false, error: "Non authentifié" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: site } = await admin.from("client_sites").select("id, html, prospect_id, owner_id").eq("id", site_id).maybeSingle();
    if (!site) return json({ ok: false, error: "Site introuvable" }, 404);
    if (site.owner_id !== uid) return json({ ok: false, error: "Accès refusé" }, 403);

    let html: string | null = site.html;
    if (!html) {
      const { data: prev } = await admin.from("prospect_previews").select("html_url").eq("prospect_id", site.prospect_id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
      if (prev?.html_url) { try { const r = await fetch(prev.html_url); if (r.ok) html = await r.text(); } catch { /* */ } }
    }
    if (!html) return json({ ok: false, error: "Pas de maquette à éditer pour ce site." }, 422);
    const original = html;

    const save = async (newHtml: string, summary: string, via: string) => {
      await admin.from("client_sites").update({ html: newHtml, updated_at: new Date().toISOString() }).eq("id", site_id);
      return json({ ok: true, html: newHtml, applied: 1, skipped: 0, summary: summary || "Site mis à jour", via });
    };

    // ── Niveaux 1-2 : réécriture complète (Gemini→Claude, 2 passes) ──
    const r1 = await tryRewrite(original, instruction);
    if (r1) return await save(r1.html, r1.summary, "rewrite");
    const r2 = await tryRewrite(original, instruction); // 2e passe (LLM stochastique)
    if (r2) return await save(r2.html, r2.summary, "rewrite2");

    // ── Niveau 3 : éditions ciblées (fallback fiable) ──
    const { edits, summary } = await aiFindReplace(original, instruction);
    if (edits.length > 0) {
      const { html: edited, applied } = applyEdits(original, edits);
      if (applied > 0) return await save(edited, summary, "edits");
    }

    // ── Niveau 4 : échec propre, original préservé ──
    return json({ ok: false, error: "Je n'ai pas réussi à appliquer cette modification. Reformule en étant plus précis (ex: « change le titre en … », « mets le bouton en rouge »)." }, 200);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
