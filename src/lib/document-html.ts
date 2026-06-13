/**
 * ─── Rendu HTML conforme d'un devis / facture (A4, imprimable PDF) ─────
 *
 * Intègre TOUTES les mentions obligatoires (guide micro-entreprise EI,
 * franchise de TVA, 2026) :
 *  - Émetteur : Nom + "EI", adresse, SIRET, "Immatriculé au RNE"
 *  - Client : nom, adresse (+ livraison si différente), SIREN si pro (B2B)
 *  - Mot FACTURE/DEVIS apparent · n° séquentiel · date d'émission ·
 *    date/période de prestation
 *  - Lignes : désignation, qté, prix unitaire HT · "Prestation de services"
 *  - Prix HT partout · "TVA non applicable, art. 293 B du CGI" (franchise)
 *  - B2B : échéance, pénalités 3× taux légal, indemnité forfaitaire 40 €
 *  - IBAN/BIC · (devis) validité + "Bon pour accord"
 */

export type DocLine = { description: string; quantity: number; unit_price_ht: number; vat_rate: number };

export type RenderDoc = {
  type: "devis" | "facture";
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  service_date_text: string | null;
  client_name: string; client_address: string; client_postal_code: string; client_city: string;
  client_siret: string; client_email: string; client_delivery_address?: string; client_is_pro?: boolean;
  lines: DocLine[];
  notes: string;
};

export type RenderSettings = {
  legal_name?: string | null; is_ei?: boolean | null; legal_form?: string | null;
  address?: string | null; postal_code?: string | null; city?: string | null;
  siret?: string | null; rne_registered?: boolean | null; vat_number?: string | null;
  vat_regime?: string | null; iban?: string | null; bic?: string | null;
  payment_terms_days?: number | null; late_penalty?: string | null; custom_mentions?: string | null;
  email?: string | null; phone?: string | null; logo_url?: string | null;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const eur = (n: number) => (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const dateFr = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const sirenFrom = (siret: string) => (siret || "").replace(/\D/g, "").slice(0, 9);

export function renderDocumentHtml(doc: RenderDoc, s: RenderSettings): string {
  const franchise = s.vat_regime !== "normal";
  const isFacture = doc.type === "facture";
  const docWord = isFacture ? "FACTURE" : "DEVIS";

  // Nom émetteur avec mention EI
  let sellerName = esc(s.legal_name || "—");
  if (s.is_ei && !/\bEI\b/i.test(s.legal_name || "")) sellerName += " EI";

  // Totaux
  let ht = 0, vat = 0;
  for (const l of doc.lines) {
    const lht = (Number(l.quantity) || 0) * (Number(l.unit_price_ht) || 0);
    ht += lht;
    if (!franchise) vat += lht * ((Number(l.vat_rate) || 0) / 100);
  }
  const ttc = ht + vat;

  const clientSiren = sirenFrom(doc.client_siret);
  const penalty = esc(s.late_penalty || "Pénalités de retard : 3 fois le taux d'intérêt légal.");
  const indemnite = "Indemnité forfaitaire de 40 € pour frais de recouvrement en cas de retard de paiement.";

  const lineRows = doc.lines.map((l) => {
    const lht = (Number(l.quantity) || 0) * (Number(l.unit_price_ht) || 0);
    return `<tr>
      <td>${esc(l.description) || "—"}</td>
      <td class="num">${Number(l.quantity) || 0}</td>
      <td class="num">${eur(Number(l.unit_price_ht) || 0)} HT</td>
      ${franchise ? "" : `<td class="num">${Number(l.vat_rate) || 0} %</td>`}
      <td class="num">${eur(lht)} HT</td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docWord} ${esc(doc.number || "")}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.5; margin: 0; background: #f3f4f6; }
  .toolbar { position: sticky; top: 0; background: #111827; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; }
  .toolbar button { background: #fff; color: #111827; border: 0; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; }
  .page { max-width: 800px; margin: 16px auto; background: #fff; padding: 36px 40px; box-shadow: 0 2px 20px rgba(0,0,0,.08); }
  .top { display: flex; justify-content: space-between; gap: 24px; }
  .seller { font-size: 11px; }
  .seller .name { font-weight: 800; font-size: 14px; }
  .title { text-align: right; }
  .title h1 { margin: 0; font-size: 30px; letter-spacing: 2px; color: #111827; }
  .title .num { font-size: 13px; color: #6b7280; margin-top: 2px; }
  .meta { margin-top: 22px; display: flex; justify-content: space-between; gap: 24px; }
  .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
  .box.client { flex: 1; }
  .box .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; font-weight: 700; margin-bottom: 4px; }
  .dates { text-align: right; font-size: 11px; }
  .dates div { margin-bottom: 2px; }
  .nature { margin: 18px 0 8px; font-size: 11px; color: #374151; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #111827; color: #fff; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
  th.num, td.num { text-align: right; }
  td { padding: 9px 10px; border-bottom: 1px solid #eef0f2; }
  .totals { margin-top: 14px; display: flex; justify-content: flex-end; }
  .totals table { width: 280px; }
  .totals td { border: 0; padding: 4px 10px; }
  .totals .grand { font-weight: 800; font-size: 14px; border-top: 2px solid #111827; }
  .mentions { margin-top: 26px; font-size: 10px; color: #4b5563; border-top: 1px solid #e5e7eb; padding-top: 14px; }
  .mentions p { margin: 3px 0; }
  .mentions strong { color: #111827; }
  .pay { margin-top: 18px; font-size: 11px; }
  .signature { margin-top: 28px; font-size: 11px; display: flex; justify-content: flex-end; }
  .signature .sig { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px 18px; width: 240px; text-align: center; color: #6b7280; }
  @media print { body { background: #fff; } .toolbar { display: none; } .page { box-shadow: none; margin: 0; max-width: none; padding: 0; } }
</style></head>
<body>
  <div class="toolbar">
    <span>${docWord}${doc.number ? " · " + esc(doc.number) : " (brouillon)"}</span>
    <button onclick="window.print()">Imprimer / Enregistrer en PDF</button>
  </div>
  <div class="page">
    <div class="top">
      <div class="seller">
        <div class="name">${sellerName}</div>
        ${s.address ? `<div>${esc(s.address)}</div>` : ""}
        ${(s.postal_code || s.city) ? `<div>${esc(s.postal_code)} ${esc(s.city)}</div>` : ""}
        ${s.siret ? `<div>SIRET : ${esc(s.siret)}</div>` : ""}
        ${s.vat_number ? `<div>TVA : ${esc(s.vat_number)}</div>` : ""}
        ${s.email ? `<div>${esc(s.email)}</div>` : ""}${s.phone ? `<div>${esc(s.phone)}</div>` : ""}
        ${s.rne_registered ? `<div style="margin-top:4px;color:#6b7280;">Immatriculé au RNE (Registre National des Entreprises)</div>` : ""}
      </div>
      <div class="title">
        <h1>${docWord}</h1>
        <div class="num">${doc.number ? esc(doc.number) : "Brouillon"}</div>
      </div>
    </div>

    <div class="meta">
      <div class="box client">
        <div class="lbl">${doc.client_is_pro === false ? "Client" : "Client (professionnel)"}</div>
        <div style="font-weight:700;">${esc(doc.client_name) || "—"}</div>
        ${doc.client_address ? `<div>${esc(doc.client_address)}</div>` : ""}
        ${(doc.client_postal_code || doc.client_city) ? `<div>${esc(doc.client_postal_code)} ${esc(doc.client_city)}</div>` : ""}
        ${doc.client_delivery_address ? `<div style="margin-top:4px;color:#6b7280;">Livraison : ${esc(doc.client_delivery_address)}</div>` : ""}
        ${(doc.client_is_pro !== false && clientSiren) ? `<div>SIREN : ${esc(clientSiren)}</div>` : ""}
        ${doc.client_email ? `<div>${esc(doc.client_email)}</div>` : ""}
      </div>
      <div class="dates">
        <div><strong>Date d'émission :</strong> ${dateFr(doc.issue_date)}</div>
        ${doc.service_date_text ? `<div><strong>Prestation :</strong> ${esc(doc.service_date_text)}</div>` : ""}
        <div><strong>${isFacture ? "Échéance :" : "Validité jusqu'au :"}</strong> ${dateFr(doc.due_date)}</div>
      </div>
    </div>

    <div class="nature">Nature de l'opération : Prestation de services.</div>

    <table>
      <thead><tr>
        <th>Désignation</th><th class="num">Qté</th><th class="num">Prix unitaire</th>${franchise ? "" : `<th class="num">TVA</th>`}<th class="num">Total</th>
      </tr></thead>
      <tbody>${lineRows || `<tr><td colspan="${franchise ? 4 : 5}" style="color:#9ca3af;">Aucune ligne</td></tr>`}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Total HT</td><td class="num">${eur(ht)}</td></tr>
        ${franchise ? "" : `<tr><td>TVA</td><td class="num">${eur(vat)}</td></tr>`}
        <tr class="grand"><td>Total ${franchise ? "" : "TTC"}</td><td class="num">${eur(ttc)}</td></tr>
      </table>
    </div>

    ${doc.notes ? `<div class="pay" style="margin-top:16px;"><strong>Note :</strong> ${esc(doc.notes)}</div>` : ""}

    <div class="pay">
      <strong>Conditions de règlement :</strong> ${isFacture ? `Paiement sous ${s.payment_terms_days ?? 30} jours` : `Devis valable jusqu'au ${dateFr(doc.due_date)}`}.
      ${(s.iban) ? `<br>Coordonnées bancaires : IBAN ${esc(s.iban)}${s.bic ? ` · BIC ${esc(s.bic)}` : ""}.` : ""}
    </div>

    ${!isFacture ? `<div class="signature"><div class="sig">Bon pour accord<br><span style="font-size:9px;">(date + signature du client)</span></div></div>` : ""}

    <div class="mentions">
      ${franchise ? `<p><strong>TVA non applicable, art. 293 B du CGI.</strong></p>` : ""}
      ${doc.client_is_pro !== false ? `<p>${penalty}</p><p>${indemnite}</p>` : ""}
      ${s.custom_mentions ? `<p>${esc(s.custom_mentions)}</p>` : ""}
    </div>
  </div>
</body></html>`;
}
