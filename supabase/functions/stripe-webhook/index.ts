// ─── Stripe — webhook : marque la facture « payée » automatiquement ────
//
//  Stripe appelle cette URL quand un paiement aboutit
//  (checkout.session.completed). On retrouve la facture via la metadata
//  document_id (ou l'id du Payment Link) et on passe le statut à « payé ».
//
//  Déployer SANS vérification JWT (Stripe n'envoie pas de token Supabase) :
//    supabase functions deploy stripe-webhook --no-verify-jwt
//  Requiert STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const WH_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (!STRIPE_KEY || !WH_SECRET) return new Response("not configured", { status: 503 });

  const sig = req.headers.get("stripe-signature") || "";
  const bodyText = await req.text();
  const stripe = new Stripe(STRIPE_KEY, { httpClient: Stripe.createFetchHttpClient(), apiVersion: "2023-10-16" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(bodyText, sig, WH_SECRET, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    console.error("stripe-webhook bad signature", (e as Error).message);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.payment_status === "paid" || s.status === "complete") {
        const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
        let docId = (s.metadata && s.metadata.document_id) || null;
        if (!docId && s.payment_link) {
          const plId = typeof s.payment_link === "string" ? s.payment_link : s.payment_link.id;
          const { data } = await db.from("documents").select("id").eq("payment_provider_id", plId).maybeSingle();
          docId = data?.id ?? null;
        }
        if (docId) {
          await db.from("documents").update({ status: "paye", paid_at: new Date().toISOString() }).eq("id", docId);
        }
      }
    }
  } catch (e) {
    console.error("stripe-webhook handler", e);
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
