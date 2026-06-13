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

// Réécriture du HTML COMPLET : l'IA renvoie tout le document modifié.
// Bien plus FIABLE que le find/replace (qui ratait si l'IA ne recopiait
// pas le texte au caractère près) → le changement est toujours appliqué.
const SYSTEM = `Tu es un éditeur de sites web expert. On te donne le HTML COMPLET d'un site (page unique, Tailwind/CSS inline) et une instruction de modification en français.

Tu RENVOIES LE DOCUMENT HTML COMPLET MODIFIÉ, du <!doctype html> jusqu'au </html> final.

RÈGLES ABSOLUES :
- Applique EXACTEMENT ce que demande l'instruction.
- Conserve TOUT le reste à l'identique : structure, styles, sections, images (mêmes URLs src), scripts. Ne supprime/ne réécris QUE ce qui est concerné par l'instruction.
- Ne raccourcis JAMAIS le document, ne mets pas de "...", ne résume pas. Renvoie l'intégralité du HTML.
- N'invente pas d'infos fausses (téléphone, adresse…). Si une info manque, garde un placeholder neutre.
- Réponse = UNIQUEMENT le HTML. Aucune explication, aucun texte hors du HTML, pas de balises markdown.
- Tout en haut, AVANT le <!doctype>, ajoute UNE ligne de commentaire résumant ta modif :
  <!--SUMMARY: ce que tu as changé en quelques mots-->`;

// Nettoie la sortie : retire les fences markdown éventuels, extrait le summary.
function parseAiHtml(raw: string): { html: string; summary: string } {
  let t = (raw || "").trim();
  // Retire ```html ... ``` si présent
  t = t.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let summary = "";
  const m = t.match(/^<!--\s*SUMMARY:\s*([\s\S]*?)-->\s*/i);
  if (m) { summary = m[1].trim(); t = t.slice(m[0].length).trim(); }
  return { html: t, summary };
}

async function aiRewrite(html: string, instruction: string): Promise<{ html: string; summary: string }> {
  const user = `INSTRUCTION : ${instruction}\n\n=== HTML ACTUEL DU SITE ===\n${html}`;

  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.15, maxOutputTokens: 32768 },
        }),
      });
      if (res.ok) {
        const c = await res.json();
        const t = c.candidates?.[0]?.content?.parts?.[0]?.text;
        if (t && t.length > 200) return parseAiHtml(t);
        console.log("[site-edit] gemini sortie courte/vide");
      } else { console.log("[site-edit] gemini", res.status, (await res.text()).slice(0, 200)); }
    } catch (e) { console.log("[site-edit] gemini err", (e as Error).message); }
  }
  if (ANTHROPIC_API_KEY) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 32000, temperature: 0.15, system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const c = await res.json();
    const t = (c.content || []).find((x: { type: string }) => x.type === "text") as { text?: string } | undefined;
    if (t?.text) return parseAiHtml(t.text);
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

    const original = html;

    // IA → réécriture complète du HTML
    const { html: rewritten, summary } = await aiRewrite(original, instruction);

    // Garde-fous anti-troncature / réponse cassée :
    //  - doit contenir des balises HTML
    //  - ne doit pas être anormalement plus court que l'original (troncature)
    const looksHtml = /<\/(body|html|main|section|div)>/i.test(rewritten) || rewritten.toLowerCase().includes("<!doctype");
    const tooShort = rewritten.length < Math.floor(original.length * 0.5);
    if (!looksHtml || tooShort) {
      console.log(`[site-edit] sortie rejetée (looksHtml=${looksHtml}, len ${rewritten.length}/${original.length})`);
      return json({ ok: false, error: "La modification n'a pas pu être appliquée proprement (réponse incomplète). Réessaie ou reformule." }, 200);
    }

    // Sauvegarde le HTML complet modifié
    await admin.from("client_sites").update({ html: rewritten, updated_at: new Date().toISOString() }).eq("id", site_id);

    return json({ ok: true, html: rewritten, applied: 1, skipped: 0, summary });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
