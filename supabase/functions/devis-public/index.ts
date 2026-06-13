// ─── Devis public — page de signature en ligne + orchestration ─────────
//
//  GET  ?token=<share_token>   → page HTML propre : le devis + panneau « Bon
//                                pour accord » (nom + signature). Marque vu.
//  POST { token, action, signer_name }
//        action=sign   → devis « accepté », horodaté + signataire ;
//                        crée la facture brouillon ; passe le prospect
//                        « converti » ; logue l'event. Tout s'enchaîne.
//        action=refuse → devis « refusé ».
//
//  Servie en clair via le Worker Cloudflare (/devis/<token>) qui réémet le
//  HTML avec les bons headers (Supabase casse le content-type des edge fns).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const eur = (n: number) =>
  (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const dateFr = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const sirenFrom = (siret: string) => (siret || "").replace(/\D/g, "").slice(0, 9);

type Line = { description: string; quantity: number; unit_price_ht: number; vat_rate: number };

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

// ── Rendu de la page publique ──────────────────────────────────────────
function renderPage(doc: any, s: any): string {
  const franchise = s?.vat_regime !== "normal";
  const lines: Line[] = Array.isArray(doc.lines) ? doc.lines : [];
  const sellerName = (() => {
    let n = esc(s?.legal_name || "—");
    if (s?.is_ei && !/\bEI\b/i.test(s?.legal_name || "")) n += " EI";
    return n;
  })();
  const clientSiren = sirenFrom(doc.client_siret);
  const accepted = doc.status === "accepte";
  const refused = doc.status === "refuse";
  const closed = accepted || refused;

  const rows = lines.map((l) => {
    const lht = (Number(l.quantity) || 0) * (Number(l.unit_price_ht) || 0);
    return `<tr>
      <td>${esc(l.description) || "—"}</td>
      <td class="num">${Number(l.quantity) || 0}</td>
      <td class="num">${eur(Number(l.unit_price_ht) || 0)}</td>
      <td class="num">${eur(lht)}</td>
    </tr>`;
  }).join("");

  const banner = accepted
    ? `<div class="state ok">✓ Devis accepté le ${dateFr(doc.accepted_at)}${doc.signed_by_name ? ` par <b>${esc(doc.signed_by_name)}</b>` : ""}. Merci !</div>`
    : refused
      ? `<div class="state ko">Ce devis a été décliné.</div>`
      : "";

  const signPanel = closed ? "" : `
    <div class="sign" id="signCard">
      <h3>Bon pour accord</h3>
      <p class="muted">Validez ce devis en ligne. En signant, vous acceptez les conditions et le montant ci-dessus.</p>
      <label class="lbl">Votre nom et prénom</label>
      <input id="name" type="text" placeholder="Ex : Marie Dupont" autocomplete="name" />
      <label class="chk"><input id="agree" type="checkbox" /> <span>J'accepte ce devis (« Bon pour accord »).</span></label>
      <button id="signBtn" class="btn">Signer et accepter le devis</button>
      <button id="refuseBtn" class="link">Je ne souhaite pas donner suite</button>
      <p class="err" id="err"></p>
    </div>`;

  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Devis ${esc(doc.number || "")} — ${esc(s?.trade_name || s?.legal_name || "Devis")}</title>
<style>
  *{box-sizing:border-box} html,body{margin:0}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#f1f5f9;font-size:14px;line-height:1.55}
  .wrap{max-width:760px;margin:0 auto;padding:20px 16px 60px}
  .doc{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,.08);overflow:hidden}
  .head{display:flex;justify-content:space-between;gap:20px;padding:28px 30px;border-bottom:1px solid #eef1f5}
  .seller .brand{font-weight:800;font-size:17px}
  .seller .sub{color:#475569;font-size:12px}
  .seller div{margin-top:1px}
  .docttl{text-align:right}
  .docttl h1{margin:0;font-size:26px;letter-spacing:2px;color:#0f172a}
  .docttl .n{color:#64748b;font-size:13px;margin-top:2px}
  .body{padding:24px 30px}
  .grid2{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:18px}
  .card{border:1px solid #eef1f5;border-radius:12px;padding:12px 14px;flex:1;min-width:220px}
  .card .k{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{background:#0f172a;color:#fff;text-align:left;padding:9px 11px;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
  th.num,td.num{text-align:right}
  td{padding:10px 11px;border-bottom:1px solid #f1f5f9}
  .tot{display:flex;justify-content:flex-end;margin-top:14px}
  .tot table{width:300px}
  .tot td{border:0;padding:4px 11px}
  .tot .g{font-weight:800;font-size:16px;border-top:2px solid #0f172a}
  .mentions{margin-top:22px;font-size:11px;color:#64748b;border-top:1px solid #eef1f5;padding-top:14px}
  .nature{font-style:italic;color:#475569;margin:14px 0 4px;font-size:12px}
  .state{margin:18px 0 0;padding:14px 16px;border-radius:12px;font-weight:600}
  .state.ok{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
  .state.ko{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
  .sign{margin:22px 0 0;padding:22px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc}
  .sign h3{margin:0 0 4px;font-size:18px}
  .sign .muted{color:#64748b;font-size:12.5px;margin:0 0 14px}
  .lbl{display:block;font-size:12px;font-weight:600;margin:0 0 5px}
  #name{width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;margin-bottom:12px}
  #name:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
  .chk{display:flex;align-items:flex-start;gap:9px;font-size:13px;margin-bottom:16px;cursor:pointer}
  .chk input{margin-top:2px;width:16px;height:16px}
  .btn{width:100%;background:#4f46e5;color:#fff;border:0;padding:14px;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;transition:.15s}
  .btn:hover{background:#4338ca} .btn:disabled{opacity:.6;cursor:not-allowed}
  .link{display:block;width:100%;background:none;border:0;color:#94a3b8;font-size:12.5px;margin-top:12px;cursor:pointer;text-decoration:underline}
  .err{color:#dc2626;font-size:13px;margin:10px 0 0;min-height:1px}
  .foot{text-align:center;color:#94a3b8;font-size:11px;margin-top:22px}
  .muted{color:#64748b}
  @media(max-width:560px){.head{flex-direction:column;gap:14px}.docttl{text-align:left}}
</style></head>
<body><div class="wrap">
  <div class="doc">
    <div class="head">
      <div class="seller">
        <div class="brand">${esc(s?.trade_name || s?.legal_name || "—")}</div>
        ${s?.trade_name ? `<div class="sub">${sellerName}</div>` : ""}
        ${s?.address ? `<div class="sub">${esc(s.address)}</div>` : ""}
        ${(s?.postal_code || s?.city) ? `<div class="sub">${esc(s.postal_code)} ${esc(s.city)}</div>` : ""}
        ${s?.siret ? `<div class="sub">SIRET : ${esc(s.siret)}</div>` : ""}
        ${s?.email ? `<div class="sub">${esc(s.email)}</div>` : ""}
      </div>
      <div class="docttl"><h1>DEVIS</h1><div class="n">${doc.number ? esc(doc.number) : "Proposition"}</div></div>
    </div>
    <div class="body">
      <div class="grid2">
        <div class="card">
          <div class="k">${doc.client_is_pro === false ? "Client" : "Client"}</div>
          <div style="font-weight:700">${esc(doc.client_name) || "—"}</div>
          ${doc.client_address ? `<div>${esc(doc.client_address)}</div>` : ""}
          ${(doc.client_postal_code || doc.client_city) ? `<div>${esc(doc.client_postal_code)} ${esc(doc.client_city)}</div>` : ""}
          ${(doc.client_is_pro !== false && clientSiren) ? `<div>SIREN : ${esc(clientSiren)}</div>` : ""}
        </div>
        <div class="card" style="flex:0 0 240px">
          <div class="k">Détails</div>
          <div><b>Émis le :</b> ${dateFr(doc.issue_date)}</div>
          ${doc.service_date_text ? `<div><b>Prestation :</b> ${esc(doc.service_date_text)}</div>` : ""}
          <div><b>Valable jusqu'au :</b> ${dateFr(doc.due_date)}</div>
        </div>
      </div>

      <div class="nature">Nature de l'opération : Prestation de services.</div>
      <table>
        <thead><tr><th>Désignation</th><th class="num">Qté</th><th class="num">Prix HT</th><th class="num">Total HT</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">Aucune ligne</td></tr>`}</tbody>
      </table>
      <div class="tot"><table>
        <tr><td>Total HT</td><td class="num">${eur(Number(doc.total_ht) || 0)}</td></tr>
        ${franchise ? "" : `<tr><td>TVA</td><td class="num">${eur(Number(doc.total_vat) || 0)}</td></tr>`}
        <tr class="g"><td>Total ${franchise ? "" : "TTC"}</td><td class="num">${eur(Number(doc.total_ttc) || 0)}</td></tr>
      </table></div>

      ${doc.notes ? `<p style="margin-top:14px;font-size:12.5px"><b>Note :</b> ${esc(doc.notes)}</p>` : ""}

      ${banner}
      ${signPanel}

      <div class="mentions">
        ${franchise ? `<p><b>TVA non applicable, art. 293 B du CGI.</b></p>` : ""}
        ${s?.custom_mentions ? `<p>${esc(s.custom_mentions)}</p>` : ""}
        <p>Devis valable jusqu'au ${dateFr(doc.due_date)}. Sans réponse passé ce délai, il sera caduc.</p>
      </div>
    </div>
  </div>
  <div class="foot">Document émis via Wyngo · signature électronique horodatée</div>
</div>
<script>
  var token = ${JSON.stringify(doc.share_token)};
  var btn = document.getElementById('signBtn');
  var refuse = document.getElementById('refuseBtn');
  var err = document.getElementById('err');
  function post(action){
    var name = (document.getElementById('name')||{}).value || '';
    if(action==='sign'){
      if(!name.trim()){ err.textContent='Indiquez votre nom pour signer.'; return; }
      if(!document.getElementById('agree').checked){ err.textContent='Cochez « J\\'accepte ce devis ».'; return; }
    }
    err.textContent=''; if(btn){btn.disabled=true; btn.textContent='Validation…';}
    fetch(window.location.pathname,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({token:token,action:action,signer_name:name})})
      .then(function(r){return r.json()})
      .then(function(d){ if(d.ok){ location.reload(); } else { err.textContent=d.error||'Erreur, réessayez.'; if(btn){btn.disabled=false;btn.textContent='Signer et accepter le devis';} } })
      .catch(function(){ err.textContent='Erreur réseau, réessayez.'; if(btn){btn.disabled=false;btn.textContent='Signer et accepter le devis';} });
  }
  if(btn) btn.onclick=function(){post('sign')};
  if(refuse) refuse.onclick=function(){ if(confirm('Confirmer le refus de ce devis ?')) post('refuse'); };
</script>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const db = admin();

  try {
    // ── POST : signature / refus ──────────────────────────────────────
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = body.token;
      const action = body.action;
      if (!token) return json({ ok: false, error: "Lien invalide." }, 400);

      const { data: doc } = await db.from("documents").select("*").eq("share_token", token).eq("type", "devis").maybeSingle();
      if (!doc) return json({ ok: false, error: "Devis introuvable." }, 404);
      if (doc.status === "accepte") return json({ ok: false, error: "Ce devis est déjà accepté." }, 409);
      if (doc.status === "refuse") return json({ ok: false, error: "Ce devis a déjà été décliné." }, 409);

      const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || null;

      if (action === "refuse") {
        await db.from("documents").update({ status: "refuse", refused_at: new Date().toISOString() }).eq("id", doc.id);
        return json({ ok: true });
      }

      // ── action = sign ──
      const signer = String(body.signer_name || "").trim().slice(0, 120);
      if (!signer) return json({ ok: false, error: "Nom requis." }, 400);

      // 1. Devis → accepté (signature horodatée)
      const now = new Date().toISOString();
      await db.from("documents").update({
        status: "accepte", accepted_at: now, signed_by_name: signer, signer_ip: ip,
      }).eq("id", doc.id);

      // 2. Facture brouillon auto-créée (à partir du devis) — n° légal à l'émission
      const { data: settings } = await db.from("billing_settings").select("payment_terms_days").eq("id", true).maybeSingle();
      const terms = Number(settings?.payment_terms_days ?? 30);
      const today = now.slice(0, 10);
      const due = new Date(Date.now() + terms * 86400000).toISOString().slice(0, 10);
      await db.from("documents").insert({
        owner_id: doc.owner_id, type: "facture", status: "brouillon",
        prospect_id: doc.prospect_id, converted_from: doc.id,
        client_name: doc.client_name, client_address: doc.client_address, client_postal_code: doc.client_postal_code,
        client_city: doc.client_city, client_siret: doc.client_siret, client_email: doc.client_email,
        client_is_pro: doc.client_is_pro, client_delivery_address: doc.client_delivery_address,
        service_date_text: doc.service_date_text, lines: doc.lines,
        total_ht: doc.total_ht, total_vat: doc.total_vat, total_ttc: doc.total_ttc,
        notes: doc.notes, issue_date: today, due_date: due,
      });

      // 3. Prospect → converti (apparaît dans Studio Production) + event
      if (doc.prospect_id) {
        await db.from("prospects").update({ status: "converti" }).eq("id", doc.prospect_id);
        await db.from("prospect_events").insert({
          owner_id: doc.owner_id, prospect_id: doc.prospect_id, event_type: "devis_signe",
          payload: { document_id: doc.id, number: doc.number, total_ttc: doc.total_ttc, signer },
        });
      }

      return json({ ok: true });
    }

    // ── GET : rendu de la page ────────────────────────────────────────
    const token = url.searchParams.get("token");
    if (!token) return html("<h1>Lien invalide</h1>", 400);

    const { data: doc } = await db.from("documents").select("*").eq("share_token", token).eq("type", "devis").maybeSingle();
    if (!doc) return html(`<div style="font-family:sans-serif;text-align:center;padding:60px">
      <h1 style="font-size:22px">Devis introuvable</h1>
      <p style="color:#64748b">Ce lien n'est plus valide ou a expiré.</p></div>`, 404);

    // brouillon non émis : on ne montre rien
    if (doc.status === "brouillon") {
      return html(`<div style="font-family:sans-serif;text-align:center;padding:60px">
        <h1 style="font-size:22px">Devis indisponible</h1>
        <p style="color:#64748b">Ce devis n'a pas encore été envoyé.</p></div>`, 403);
    }

    // 1re ouverture → marque "vu" (sans écraser un statut accepté/refusé)
    if (!doc.viewed_at && (doc.status === "envoye")) {
      await db.from("documents").update({ viewed_at: new Date().toISOString() }).eq("id", doc.id);
    }

    const { data: settings } = await db.from("billing_settings").select("*").eq("id", true).maybeSingle();
    return html(renderPage(doc, settings || {}));
  } catch (e) {
    console.error("devis-public error", e);
    return html(`<div style="font-family:sans-serif;text-align:center;padding:60px"><h1>Erreur</h1></div>`, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json" } });
}
function html(body: string, status = 200) {
  return new Response(body, { status, headers: { ...cors, "content-type": "text/html; charset=utf-8" } });
}
