/**
 * preview-ping — log de l'ouverture du preview par le prospect.
 * Appelé en fire-and-forget depuis le HTML généré. Pas d'auth.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { preview_id } = await req.json();
    if (!preview_id) return new Response("ok", { headers: cors });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // Incrément atomique + set opened_at si premier vu
    await sb.rpc("increment_preview_view", { p_id: preview_id }).then(() => {}, async () => {
      // Fallback si la fonction RPC n'existe pas : update direct
      const { data: cur } = await sb.from("prospect_previews").select("view_count, opened_at").eq("id", preview_id).single();
      await sb.from("prospect_previews").update({
        view_count: (cur?.view_count || 0) + 1,
        opened_at: cur?.opened_at || new Date().toISOString(),
      }).eq("id", preview_id);
    });

    return new Response("ok", { headers: cors });
  } catch {
    return new Response("ok", { headers: cors });
  }
});
