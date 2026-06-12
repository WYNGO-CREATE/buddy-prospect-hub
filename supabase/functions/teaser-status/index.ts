/**
 * ─── Teaser Status — Suivi du job Higgsfield + ré-hébergement vidéo ────
 *
 * Interroge Higgsfield pour l'état du job d'un téaser. Quand c'est terminé,
 * télécharge la vidéo et la ré-héberge dans le bucket public `teasers`
 * (URL stable, envoyable par SMS/WhatsApp), puis met à jour la ligne.
 *
 * Body POST : { teaser_id: string }
 * Réponse   : { ok, status, video_url? , error? }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const HF_KEY = Deno.env.get("HIGGSFIELD_API_KEY");
const HF_SECRET = Deno.env.get("HIGGSFIELD_API_SECRET");
const HF_BASE = "https://platform.higgsfield.ai";

// Cherche récursivement une URL .mp4 dans une réponse JSON de forme inconnue.
function findVideoUrl(obj: unknown): string | null {
  if (!obj) return null;
  if (typeof obj === "string") return /^https?:\/\/.+\.(mp4|webm|mov)(\?|$)/i.test(obj) ? obj : null;
  if (Array.isArray(obj)) { for (const v of obj) { const r = findVideoUrl(v); if (r) return r; } return null; }
  if (typeof obj === "object") {
    // priorité aux clés explicites
    const rec = obj as Record<string, unknown>;
    for (const k of ["url", "video_url", "output_url"]) {
      if (typeof rec[k] === "string" && /^https?:\/\//.test(rec[k] as string)) return rec[k] as string;
    }
    for (const v of Object.values(rec)) { const r = findVideoUrl(v); if (r) return r; }
  }
  return null;
}

function readStatus(obj: Record<string, unknown>): string {
  const direct = (obj.status || obj.state) as string | undefined;
  if (direct) return String(direct).toLowerCase();
  const job = Array.isArray(obj.jobs) ? (obj.jobs[0] as Record<string, unknown>) : undefined;
  return String((job?.status || job?.state || "processing")).toLowerCase();
}

async function hfStatus(genId: string): Promise<{ ok: boolean; data: Record<string, unknown>; raw: string }> {
  const headers = { "Authorization": `Key ${HF_KEY}:${HF_SECRET}`, "User-Agent": "wyngo-server/1.0" };
  // On tente plusieurs chemins (l'API a évolué) — le 1er qui répond 200 gagne.
  const paths = [
    `${HF_BASE}/v1/requests/${genId}/status`,
    `${HF_BASE}/v1/job-sets/${genId}`,
    `${HF_BASE}/v1/requests/${genId}`,
    `${HF_BASE}/requests/${genId}/status`,
  ];
  for (const url of paths) {
    try {
      const res = await fetch(url, { headers });
      const raw = await res.text();
      if (res.ok) {
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(raw); } catch { /* */ }
        return { ok: true, data, raw };
      }
    } catch { /* try next */ }
  }
  return { ok: false, data: {}, raw: "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!HF_KEY || !HF_SECRET) return json({ ok: false, error: "Higgsfield non configuré" }, 500);
    const { teaser_id } = await req.json();
    if (!teaser_id) return json({ ok: false, error: "teaser_id requis" }, 400);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ ok: false, error: "Non authentifié" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row } = await admin.from("prospect_teasers").select("*").eq("id", teaser_id).maybeSingle();
    if (!row) return json({ ok: false, error: "Téaser introuvable" }, 404);
    if (row.owner_id !== uid) return json({ ok: false, error: "Accès refusé" }, 403);
    if (row.status === "done") return json({ ok: true, status: "done", video_url: row.video_url });
    if (row.status === "failed") return json({ ok: true, status: "failed", error: row.error });
    if (!row.generation_id) return json({ ok: true, status: "processing" });

    const { ok, data, raw } = await hfStatus(row.generation_id);
    if (!ok) return json({ ok: true, status: "processing" }); // on retentera
    console.log("[teaser-status]", row.generation_id, raw.slice(0, 400));

    const st = readStatus(data);
    if (st === "failed" || st === "nsfw" || st === "error") {
      await admin.from("prospect_teasers").update({ status: "failed", error: st === "nsfw" ? "Contenu refusé (NSFW)" : "Échec de génération", updated_at: new Date().toISOString() }).eq("id", teaser_id);
      return json({ ok: true, status: "failed", error: st });
    }
    if (st === "completed" || st === "succeeded" || st === "success") {
      const hfVideoUrl = findVideoUrl(data);
      if (!hfVideoUrl) return json({ ok: true, status: "processing" }); // pas encore l'URL
      // Ré-héberge la vidéo pour une URL stable
      let finalUrl = hfVideoUrl;
      try {
        const vid = await fetch(hfVideoUrl);
        if (vid.ok) {
          const bytes = new Uint8Array(await vid.arrayBuffer());
          const path = `${row.prospect_id}/${Date.now()}-teaser.mp4`;
          const up = await admin.storage.from("teasers").upload(path, bytes, { contentType: "video/mp4", upsert: true });
          if (!up.error) finalUrl = `${SUPABASE_URL}/storage/v1/object/public/teasers/${path}`;
        }
      } catch { /* garde l'URL Higgsfield si le ré-hébergement échoue */ }
      await admin.from("prospect_teasers").update({ status: "done", video_url: finalUrl, updated_at: new Date().toISOString() }).eq("id", teaser_id);
      return json({ ok: true, status: "done", video_url: finalUrl });
    }
    return json({ ok: true, status: "processing" });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
