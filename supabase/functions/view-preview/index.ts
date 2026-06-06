/**
 * ─── view-preview — Proxy public pour les previews HTML ─────────────────
 *
 * Pourquoi : Supabase Storage applique une protection XSS qui force tous
 * les fichiers .html à être servis avec Content-Type: text/plain (et
 * X-Content-Type-Options: nosniff). Résultat : Safari affiche le code
 * source au lieu de rendre la page.
 *
 * Cette edge function lit le fichier depuis le bucket privé (via service
 * role) et le sert avec Content-Type: text/html — le browser rend la
 * page normalement, le partage iMessage/Mail/WhatsApp génère un vrai
 * link preview avec les meta Open Graph.
 *
 * URL : /functions/v1/view-preview/<slug>
 *       /functions/v1/view-preview?slug=<slug>
 *
 * Pas d'auth requise (les previews sont publics par design — le
 * commercial envoie le lien au prospect par SMS).
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
    const url = new URL(req.url);
    // Extrait le slug depuis le path OU le query param
    // Path : /functions/v1/view-preview/<slug>
    // Query : /functions/v1/view-preview?slug=<slug>
    const pathParts = url.pathname.split("/").filter(Boolean);
    const fromPath = pathParts[pathParts.length - 1];
    const fromQuery = url.searchParams.get("slug");
    let slug = (fromQuery || fromPath || "").replace(/\.html$/, "");

    if (!slug || slug === "view-preview") {
      return new Response("Slug manquant", { status: 400, headers: cors });
    }

    // Nettoyage défensif : pas de slash, pas de remontée
    slug = slug.replace(/[^a-z0-9\-]/gi, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Télécharge le HTML depuis le bucket
    const { data, error } = await sb.storage.from("previews").download(`${slug}.html`);
    if (error || !data) {
      return new Response(`Aperçu introuvable : ${error?.message || slug}`, {
        status: 404,
        headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const html = await data.text();

    return new Response(html, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/html; charset=utf-8",
        // Pas de nosniff → le browser respecte text/html
        "Cache-Control": "public, max-age=300, s-maxage=600",
        // CSP minimale pour autoriser Tailwind CDN + Google Fonts + Google Places photos
        "Content-Security-Policy":
          "default-src 'self' https: data:; img-src 'self' https: data: blob:; " +
          "style-src 'self' https: 'unsafe-inline'; script-src 'self' https: 'unsafe-inline'; " +
          "font-src 'self' https: data:; connect-src 'self' https:;",
      },
    });
  } catch (e) {
    return new Response(`Erreur : ${e instanceof Error ? e.message : String(e)}`, {
      status: 500,
      headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
