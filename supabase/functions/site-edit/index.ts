/**
 * ─── Site Edit — Éditeur de site piloté par l'IA (Wyngo Studio) ────────
 *
 * Le commercial décrit la modif en français ("change le titre en X",
 * "mets à jour les horaires", "ajoute une section avis", "couleurs plus
 * chaudes"). L'IA renvoie une liste d'éditions ciblées (find/replace)
 * qu'on applique sur le HTML du site, puis on sauvegarde.
 *
 * Pourquoi find/replace et pas le HTML complet : rapide, pas cher, et ça
 * évite la troncature des longs documents par le LLM.
 *
 * Body POST : { site_id: string, instruction: string }
 * Réponse   : { ok, html, applied, skipped, summary }
 *
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

type Edit = { find: string; replace: string };

const SYSTEM = `Tu es un éditeur de sites web expert. On te donne le HTML COMPLET d'un site (page unique, Tailwind/CSS inline) et une instruction de modification en français.

Tu renvoies une liste d'éditions ciblées à appliquer sur ce HTML, au format JSON.

RÈGLES STRICTES :
- Chaque "find" doit être une sous-chaîne EXACTE et UNIQUE présente telle quelle dans le HTML fourni (assez longue pour être sans ambiguïté, recopie-la au caractère près, espaces compris).
- "replace" est le nouveau texte qui remplace ce "find".
- Fais le MINIMUM d'éditions nécessaires, ciblées précisément sur ce que demande l'instruction.
- Préserve le style, la structure et la cohérence visuelle. N'invente pas d'infos fausses.
- Pour modifier du texte : trouve le texte exact et remplace-le.
- Pour changer une couleur/classe : trouve la classe exacte et remplace-la.
- Pour AJOUTER une section : trouve une balise de fermeture précise (ex un </section> existant unique) et remplace-la par "nouvelle section + </section>".
- Si l'instruction est impossible ou trop vague, renvoie une liste vide et explique dans "summary".

Renvoie un objet JSON : { "edits": [{ "find": "...", "replace": "..." }], "summary": "résumé court de ce que tu as changé" }`;

const SCHEMA = {
  type: "object",
  properties: {
    edits: { type: "array", items: { type: "object", properties: { find: { type: "string" }, replace: { type: "string" } }, required: ["find", "replace"] } },
    summary: { type: "string" },
  },
  required: ["edits", "summary"],
};

async function aiEdits(html: string, instruction: string): Promise<{ edits: Edit[]; summary: string }> {
  const user = `INSTRUCTION : ${instruction}\n\n=== HTML DU SITE ===\n${html}`;
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 8000, responseMimeType: "application/json", responseSchema: SCHEMA },
        }),
      });
      if (res.ok) {
        const c = await res.json();
        const t = c.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t) { const p = JSON.parse(t); return { edits: p.edits || [], summary: p.summary || "" }; }
      } else { console.log("[site-edit] gemini", res.status, (await res.text()).slice(0, 200)); }
    } catch (e) { console.log("[site-edit] gemini err", (e as Error).message); }
  }
  if (ANTHROPIC_API_KEY) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 8000, temperature: 0.2, system: SYSTEM,
        messages: [{ role: "user", content: user }],
        tools: [{ name: "apply_edits", description: "Applique les éditions au site.", input_schema: SCHEMA }],
        tool_choice: { type: "tool", name: "apply_edits" },
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const c = await res.json();
    const tool = (c.content || []).find((x: { type: string }) => x.type === "tool_use") as { input: { edits: Edit[]; summary: string } } | undefined;
    if (tool?.input) return { edits: tool.input.edits || [], summary: tool.input.summary || "" };
  }
  throw new Error("Aucune IA configurée");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { site_id, instruction } = await req.json();
    if (!site_id || !instruction?.trim()) return json({ ok: false, error: "site_id et instruction requis" }, 400);

    // Contrôle de propriété : seul le propriétaire du site peut l'éditer.
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ ok: false, error: "Non authentifié" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: site } = await admin.from("client_sites").select("id, html, preview_id, prospect_id, owner_id").eq("id", site_id).maybeSingle();
    if (!site) return json({ ok: false, error: "Site introuvable" }, 404);
    if (site.owner_id !== uid) return json({ ok: false, error: "Accès refusé" }, 403);

    // Charge le HTML de travail (ou initialise depuis la maquette)
    let html: string | null = site.html;
    if (!html) {
      const { data: prev } = await admin.from("prospect_previews")
        .select("html_url").eq("prospect_id", site.prospect_id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
      if (prev?.html_url) {
        try { const r = await fetch(prev.html_url); if (r.ok) html = await r.text(); } catch { /* */ }
      }
    }
    if (!html) return json({ ok: false, error: "Pas de maquette à éditer pour ce site." }, 422);

    // IA → éditions
    const { edits, summary } = await aiEdits(html, instruction);

    // Applique les find/replace (1ère occurrence de chaque find)
    let applied = 0, skipped = 0;
    for (const e of edits) {
      if (!e.find) { skipped++; continue; }
      const idx = html.indexOf(e.find);
      if (idx === -1) { skipped++; continue; }
      html = html.slice(0, idx) + (e.replace ?? "") + html.slice(idx + e.find.length);
      applied++;
    }

    // Sauvegarde
    await admin.from("client_sites").update({ html, updated_at: new Date().toISOString() }).eq("id", site_id);

    return json({ ok: true, html, applied, skipped, summary });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
