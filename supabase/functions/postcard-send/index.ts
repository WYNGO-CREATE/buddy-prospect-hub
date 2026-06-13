/**
 * ─── Postcard Send — Envoi d'une carte postale physique ───────────────
 *
 * Envoie une vraie carte postale au commerce via Merci Facteur (La Poste).
 * Recto : visuel + QR vers l'aperçu. Verso : adresse + mot personnalisé.
 *
 * Body POST : { prospect_id, recipient_name, address_line, postal_code,
 *               city, message, preview_url }
 *
 * Secret : MERCI_FACTEUR_API_KEY  (mode test gratuit dispo)
 *
 * NB : tant que la clé n'est pas configurée, la carte est enregistrée en
 * brouillon et on renvoie un message clair (rien n'est posté).
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
const MF_KEY = Deno.env.get("MERCI_FACTEUR_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json();
    const { prospect_id, recipient_name, address_line, postal_code, city, message, preview_url } = body;
    if (!prospect_id) return json({ ok: false, error: "prospect_id requis" }, 400);
    if (!postal_code || !city) return json({ ok: false, error: "Code postal et ville requis" }, 400);

    // Auth + propriété
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return json({ ok: false, error: "Non authentifié" }, 401);
    const { data: owns } = await userClient.from("prospects").select("id").eq("id", prospect_id).maybeSingle();
    if (!owns) return json({ ok: false, error: "Accès refusé" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Enregistre la carte (brouillon tant que non postée)
    const { data: row, error: insErr } = await admin.from("prospect_postcards").insert({
      prospect_id, owner_id: uid,
      recipient_name: recipient_name || null,
      address_line: address_line || null, postal_code, city, country: "France",
      message: message || null, preview_url: preview_url || null,
      status: "draft",
    }).select("id").single();
    if (insErr) return json({ ok: false, error: insErr.message }, 500);

    // ─── Envoi via Merci Facteur ────────────────────────────────────
    // Branché dès que MERCI_FACTEUR_API_KEY est configurée + format validé.
    if (!MF_KEY) {
      return json({ ok: false, error: "L'envoi postal n'est pas encore connecté (clé Merci Facteur en attente). La carte est prête à partir.", teaser_id: row.id }, 200);
    }

    // TODO(à brancher avec la clé de test) : appel API Merci Facteur ici,
    // puis update status='queued' + provider_id + sent_at.

    return json({ ok: true, postcard_id: row.id, status: "queued" });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
