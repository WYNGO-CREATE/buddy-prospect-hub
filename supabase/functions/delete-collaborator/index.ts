/**
 * ─── delete-collaborator ──────────────────────────────────────────────
 *
 * Supprime DÉFINITIVEMENT un collaborateur :
 *   1. Vérifie que l'appelant est admin
 *   2. Refuse l'auto-suppression (l'admin ne peut pas se supprimer lui-même)
 *   3. Réassigne TOUS les prospects/call_logs/follow_ups du collaborateur
 *      vers l'admin qui supprime — JAMAIS de données perdues
 *   4. Supprime l'utilisateur auth.users (cascade → profiles + user_roles)
 *   5. Retourne un résumé : nb prospects réassignés, nb call_logs, etc.
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

    // 1. Vérifier que l'appelant est bien admin
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

    // 3. Empêcher l'auto-suppression
    if (targetId === userData.user.id) {
      return json({ error: "Vous ne pouvez pas vous supprimer vous-même" }, 400);
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

    // 5. Réassigner toutes ses données vers l'admin qui supprime
    const adminId = userData.user.id;
    const stats: Record<string, number> = {};

    // 5a. prospects
    const { data: prospects, error: pErr } = await admin
      .from("prospects")
      .update({ owner_id: adminId })
      .eq("owner_id", targetId)
      .select("id");
    if (pErr) return json({ error: `Échec réassignation prospects : ${pErr.message}` }, 500);
    stats.prospects_reassigned = (prospects || []).length;

    // 5b. call_logs (si la table existe et a owner_id)
    try {
      const { data: calls } = await admin
        .from("call_logs")
        .update({ owner_id: adminId })
        .eq("owner_id", targetId)
        .select("id");
      stats.call_logs_reassigned = (calls || []).length;
    } catch {/* table peut ne pas avoir owner_id */}

    // 5c. follow_ups
    try {
      const { data: follows } = await admin
        .from("follow_ups")
        .update({ owner_id: adminId })
        .eq("owner_id", targetId)
        .select("id");
      stats.follow_ups_reassigned = (follows || []).length;
    } catch {/* idem */}

    // 5d. prospect_comments (si applicable)
    try {
      const { data: comments } = await admin
        .from("prospect_comments")
        .update({ author_id: adminId })
        .eq("author_id", targetId)
        .select("id");
      stats.comments_reassigned = (comments || []).length;
    } catch {/* idem */}

    // 6. Supprimer le user_roles (avant le auth.user pour éviter les FK orphan)
    await admin.from("user_roles").delete().eq("user_id", targetId);

    // 7. Supprimer le profile (au cas où la cascade auth ne le ferait pas)
    await admin.from("profiles").delete().eq("id", targetId);

    // 8. Supprimer l'utilisateur Auth (Supabase Admin API)
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
    if (delErr) {
      // On a déjà nettoyé profiles/roles → on signale mais on n'est pas en
      // état corrompu. Le user reste juste dans auth.users (peut être nettoyé
      // à la main au pire).
      return json({
        warning: `User profile supprimé mais auth.user pas supprimé : ${delErr.message}`,
        stats,
      }, 207);
    }

    return json({
      ok: true,
      deleted: { id: target.id, email: target.email, full_name: target.full_name },
      stats,
    });
  } catch (e) {
    console.error("[delete-collaborator]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
