/**
 * ─── Enrich Prospect — Enrichissement d'un prospect ajouté à la main ───
 *
 * Reproduit l'enrichissement de la Chasse sur UN prospect (créé
 * manuellement ou venu d'un lead entrant) pour qu'il ait les MÊMES infos :
 *   1. Google Places (nom + ville) → téléphone, site web, adresse
 *   2. website-checker → statut du site (no/outdated/has) + score
 *   3. email-finder → email (si manquant)
 *   4. enrich-prospect-brief → brief pour l'Aperçu Instantané (activité,
 *      objectif, ton, mots-clés)
 *
 * Résultat : un prospect manuel devient aussi complet qu'un prospect chassé
 * → l'Aperçu Instantané, la prépa d'appel, etc. fonctionnent pleinement.
 *
 * Body POST : { prospect_id: string }
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

// Appel edge→edge fiable (service_role + apikey).
async function invokeEdge<T = unknown>(name: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.log(`[enrich-prospect] ${name} HTTP ${res.status}`); return null; }
    return await res.json() as T;
  } catch (e) { console.log(`[enrich-prospect] ${name} err`, (e as Error).message); return null; }
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: p } = await admin.from("prospects")
      .select("id, owner_id, company, last_name, first_name, location, website, email, phone")
      .eq("id", prospect_id).maybeSingle();
    if (!p) return json({ ok: false, error: "Prospect introuvable" }, 404);
    if (p.owner_id !== u.user.id) return json({ ok: false, error: "Accès refusé" }, 403);

    const company = (p.company || p.last_name || "").trim();
    const city = (p.location || "").trim();
    if (!company) return json({ ok: false, error: "Renseigne au moins le nom de l'entreprise." }, 422);

    const update: Record<string, unknown> = {};
    const done: string[] = [];

    // ─── 1. Google Places (téléphone, site, adresse) ────────────────
    const places = await invokeEdge<{ ok?: boolean; place?: { phone?: string | null; website?: string | null; address?: string | null } }>(
      "places-enrich", { name: company, city: city || undefined });
    const place = places?.place;
    if (place) {
      if (!p.phone && place.phone) { update.phone = place.phone; done.push("téléphone"); }
      if (!p.website && place.website) { update.website = place.website; done.push("site web"); }
      if (place.address && (!city || city.length < 8)) { update.location = place.address; done.push("adresse"); }
    }

    const knownWebsite = (update.website as string) || p.website || place?.website || undefined;

    // ─── 2. Statut du site web ──────────────────────────────────────
    const wc = await invokeEdge<{ status?: string; score?: number; url?: string | null }>(
      "website-checker", { company_name: company, trusted_url: place?.website || undefined, hint_url: p.website || undefined });
    if (wc?.status) {
      update.website_status = wc.status;
      update.website_score = wc.score ?? null;
      update.website_checked_at = new Date().toISOString();
      if (!update.website && !p.website && wc.url) update.website = wc.url;
      done.push("statut du site");
    }

    // ─── 3. Email (si manquant) ─────────────────────────────────────
    if (!p.email) {
      const ef = await invokeEdge<{ email?: string | null }>("email-finder", {
        company_name: company, city: city || "", website_url: knownWebsite,
        dirigeant_first_name: p.first_name && p.first_name.toLowerCase() !== "contact" ? p.first_name : undefined,
        dirigeant_last_name: p.last_name || undefined,
        skip_dropcontact: true,
      });
      if (ef?.email) { update.email = ef.email; done.push("email"); }
    }

    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString();
      await admin.from("prospects").update(update).eq("id", prospect_id);
    }

    // ─── 4. Brief pour l'Aperçu Instantané (persisté) ───────────────
    await invokeEdge("enrich-prospect-brief", { prospect_id, persist: true });
    done.push("brief aperçu");

    return json({ ok: true, enriched: done, update });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
