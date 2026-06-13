import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

// ─── PREVIEW PROXY ─────────────────────────────────────────────────────
// Route /p/<slug> : sert les Aperçus Instantanés depuis le Cloudflare Worker.
//
// Pourquoi pas direct depuis Supabase Storage ?
//   Supabase force Content-Type: text/plain + nosniff + CSP sandbox sur les
//   .html (protection XSS). Résultat : Safari affiche le code source au
//   lieu de rendre la page.
//
// Pourquoi pas via une Supabase Edge Function ?
//   Même problème : Supabase impose nosniff + CSP "default-src 'none'; sandbox"
//   sur TOUTES les réponses des edge functions.
//
// Solution : Cloudflare Worker proxy. On fetch les bytes HTML depuis le
// bucket public Storage (bytes corrects, juste le content-type est cassé)
// et on les ressert avec les BONS headers (text/html + CSP raisonnable).
//
// URL des previews : https://<worker>.workers.dev/p/<slug>
//                    (ou https://workspace.wyngo.fr/p/<slug> avec custom domain)
const SUPABASE_PROJECT_ID = "mwkkgubvdswmdaiswepl";

// ─── DEVIS PUBLIC PROXY ────────────────────────────────────────────────
// Route /devis/<token> : page publique de signature d'un devis.
// Même problème que les previews (Supabase casse le content-type des edge
// functions) → on proxie l'edge function `devis-public` et on réémet le
// HTML / JSON avec les bons headers. GET = rendu page, POST = signature.
// Clé anon (publishable) — publique par nature (déjà embarquée dans le bundle
// client). En dur ici pour fiabiliser le proxy worker (pas de dépendance au
// remplacement build-time de import.meta.env côté Worker).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13a2tndWJ2ZHN3bWRhaXN3ZXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODU1MjksImV4cCI6MjA5NDk2MTUyOX0.voOfEzx1Cy4ERDpH_T1EBmjeCHBqREgOUZFuLp4Or-A";

async function serveDevis(token: string, request: Request): Promise<Response> {
  const clean = token.replace(/[^a-z0-9\-]/gi, "");
  if (!clean) return new Response("Lien invalide", { status: 400 });

  const fnUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/devis-public?token=${clean}`;
  const isPost = request.method === "POST";
  const upstream = await fetch(fnUrl, {
    method: isPost ? "POST" : "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "content-type": "application/json",
    },
    body: isPost ? await request.text() : undefined,
  });

  const bodyText = await upstream.text();
  const ct = upstream.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return new Response(bodyText, {
      status: upstream.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(bodyText, {
    status: upstream.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
      "content-security-policy":
        "default-src 'self' https: data:; img-src 'self' https: data: blob:; " +
        "style-src 'self' https: 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
        "font-src 'self' https: data:; connect-src 'self' https:;",
    },
  });
}

async function servePreview(slug: string): Promise<Response> {
  // Nettoyage défensif : pas de slash, pas de traversée
  const clean = slug.replace(/[^a-z0-9\-]/gi, "");
  if (!clean) {
    return new Response("Slug manquant", { status: 400 });
  }
  const storageUrl = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/previews/${clean}.html`;
  const upstream = await fetch(storageUrl);
  if (!upstream.ok) {
    return new Response(`Aperçu introuvable (${clean})`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const html = await upstream.text();
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600",
      "x-robots-tag": "noindex", // les previews ne doivent pas indexer
      // CSP raisonnable : autorise Tailwind CDN + Google Fonts + photos HTTPS
      "content-security-policy":
        "default-src 'self' https: data:; " +
        "img-src 'self' https: data: blob:; " +
        "style-src 'self' https: 'unsafe-inline'; " +
        "script-src 'self' https: 'unsafe-inline'; " +
        "font-src 'self' https: data:; " +
        "connect-src 'self' https:;",
    },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Route preview proxy avant TanStack handler
      if (url.pathname.startsWith("/p/")) {
        const slug = url.pathname.slice(3);
        return await servePreview(slug);
      }

      // Route page publique de signature de devis
      if (url.pathname.startsWith("/devis/")) {
        const token = url.pathname.slice("/devis/".length);
        return await serveDevis(token, request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
