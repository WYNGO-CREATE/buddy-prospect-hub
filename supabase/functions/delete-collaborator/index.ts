/**
 * ─── delete-collaborator (ARCHIVAGE) ──────────────────────────────────
 *
 * Retire un collaborateur de l'équipe sans détruire son historique :
 *   1. Vérifie que l'appelant est admin
 *   2. Refuse l'auto-retrait
 *   3. Marque le profile comme archivé (archived_at, archived_by, is_active=false)
 *   4. Supprime son compte auth.users → il ne peut plus se connecter
 *   5. NE RÉASSIGNE PAS ses prospects → ils gardent son owner_id
 *      → l'historique reste lisible ("ancien collaborateur") et l'équipe
 *        peut continuer à voir "déjà contacté par X" pour éviter les doublons
 *   6. Retourne un résumé
 *
 * Body : { user_id: string }
 * Auth : JWT d'un admin
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);

    // 1. Vérifier que l'appelant est admin
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!roles?.some((r: { role?: string }) => r.role === "admin")) {
      return json({ error: "Réservé aux administrateurs" }, 403);
    }

    // 2. Récupérer l'ID cible
    const body = await req.json();
    const targetId = String(body.user_id ?? "").trim();
    if (!targetId) return json({ error: "user_id manquant" }, 400);

    // 3. Empêcher l'auto-retrait
    if (targetId === userData.user.id) {
      return json({ error: "Vous ne pouvez pas vous retirer vous-même" }, 400);
    }

    // 4. Vérifier que le collaborateur existe
    const { data: target, error: targetErr } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", targetId)
      .maybeSingle();
    if (targetErr || !target) {
      return json({ error: "Collaborateur introuvable" }, 404);
    }

    // 5. Stats pour le toast UI (combien de données conservées)
    const stats: Record<string, number> = {};
    try {
      const { count } = await admin.from("prospects").select("id", { count: "exact", head: true }).eq("owner_id", targetId);
      stats.prospects_kept = count || 0;
    } catch {/* table peut ne pas exister */}
    try {
      const { count } = await admin.from("call_logs").select("id", { count: "exact", head: true }).eq("owner_id", targetId);
      stats.calls_kept = count || 0;
    } catch {/* idem */}
    try {
      const { count } = await admin.from("follow_ups").select("id", { count: "exact", head: true }).eq("owner_id", targetId);
      stats.followups_kept = count || 0;
    } catch {/* idem */}

    // 6. ARCHIVAGE — on garde le profile pour préserver l'historique
    const { error: archErr } = await admin
      .from("profiles")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: userData.user.id,
        is_active: false,
      })
      .eq("id", targetId);
    if (archErr) return json({ error: `Échec archivage : ${archErr.message}` }, 500);

    // 7. Retirer son rôle (il ne doit plus avoir de permissions)
    await admin.from("user_roles").delete().eq("user_id", targetId);

    // 8. Supprimer auth.users → ne peut plus se connecter
    //    On capture l'erreur : si ça échoue, le profile reste archivé donc OK
    //    (is_active=false bloque déjà la connexion côté UI/RLS).
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      console.warn("[delete-collaborator] auth.deleteUser failed:", delErr.message);
    }

    return json({
      ok: true,
      archived: { id: target.id, email: target.email, full_name: target.full_name },
      stats,
      mode: "archive",
      message: `${target.full_name || target.email} retiré de l'équipe. Ses ${stats.prospects_kept || 0} prospects restent dans la base avec son nom comme propriétaire historique.`,
    });
  } catch (e) {
    console.error("[delete-collaborator]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
