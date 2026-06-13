/**
 * ─── Facturation — Éditeur de devis / facture ─────────────────────────
 *
 * Lignes de prestation, totaux auto (TVA selon le régime), client (saisi
 * ou importé d'un prospect), émission avec numéro séquentiel légal.
 * IA (personnalisation / vérification) + PDF : prochaine étape.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Loader2, Save, Send, UserSearch, FileDown, Link2, Copy, CheckCircle2, Eye, ExternalLink, PenLine, CreditCard } from "lucide-react";
import { parseFrenchAddress } from "@/lib/address";
import { renderDocumentHtml } from "@/lib/document-html";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/facturation/document/$id")({
  component: DocumentEditor,
  head: () => ({ meta: [{ title: "Document — Facturation Wyngo" }] }),
});

type Line = { description: string; quantity: number; unit_price_ht: number; vat_rate: number };
const money = (n: number) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const STATUS_LABEL: Record<string, string> = {
  brouillon: "Brouillon", envoye: "Envoyé", accepte: "Accepté", refuse: "Refusé",
  paye: "Payé", en_retard: "En retard", annule: "Annulé",
};
const STATUS_BADGE: Record<string, string> = {
  envoye: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
  accepte: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  refuse: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300",
  paye: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
  en_retard: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300",
  annule: "bg-slate-100 dark:bg-slate-800 text-slate-500",
};

function DocumentEditor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => (await supabase.from("documents").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: settings } = useQuery({
    queryKey: ["billing-settings"],
    queryFn: async () => (await supabase.from("billing_settings").select("*").eq("id", true).maybeSingle()).data,
  });
  const franchise = settings?.vat_regime !== "normal";
  const defaultVat = Number(settings?.default_vat_rate ?? 20);

  // Facture auto-créée à la signature de ce devis
  const { data: convertedFacture } = useQuery({
    queryKey: ["converted-facture", id],
    enabled: !!doc && doc.type === "devis" && doc.status === "accepte",
    queryFn: async () => (await supabase.from("documents").select("id, number, status").eq("converted_from", id).maybeSingle()).data,
  });
  // Devis d'origine (si ce document est une facture issue d'un devis)
  const { data: sourceDevis } = useQuery({
    queryKey: ["source-devis", doc?.converted_from],
    enabled: !!doc?.converted_from,
    queryFn: async () => (await supabase.from("documents").select("id, number, signed_by_name").eq("id", doc!.converted_from!).maybeSingle()).data,
  });

  // État local
  const [client, setClient] = useState({ name: "", address: "", postal_code: "", city: "", siret: "", email: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [delivery, setDelivery] = useState("");
  const [isPro, setIsPro] = useState(true);

  useEffect(() => {
    if (!doc) return;
    setClient({
      name: doc.client_name || "", address: doc.client_address || "", postal_code: doc.client_postal_code || "",
      city: doc.client_city || "", siret: doc.client_siret || "", email: doc.client_email || "",
    });
    setLines(Array.isArray(doc.lines) ? (doc.lines as Line[]) : []);
    setNotes(doc.notes || "");
    setDueDate(doc.due_date || "");
    setServiceDate((doc as { service_date_text?: string | null }).service_date_text || "");
    setDelivery((doc as { client_delivery_address?: string | null }).client_delivery_address || "");
    setIsPro((doc as { client_is_pro?: boolean }).client_is_pro ?? true);
  }, [doc]);

  const totals = useMemo(() => {
    let ht = 0, vat = 0;
    for (const l of lines) {
      const lht = (Number(l.quantity) || 0) * (Number(l.unit_price_ht) || 0);
      ht += lht;
      if (!franchise) vat += lht * ((Number(l.vat_rate) || 0) / 100);
    }
    return { ht, vat, ttc: ht + vat };
  }, [lines, franchise]);

  const addLine = () => setLines((l) => [...l, { description: "", quantity: 1, unit_price_ht: 0, vat_rate: franchise ? 0 : defaultVat }]);
  const setLine = (i: number, patch: Partial<Line>) => setLines((l) => l.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delLine = (i: number) => setLines((l) => l.filter((_, j) => j !== i));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents").update({
        client_name: client.name || null, client_address: client.address || null, client_postal_code: client.postal_code || null,
        client_city: client.city || null, client_siret: client.siret || null, client_email: client.email || null,
        client_is_pro: isPro, client_delivery_address: delivery || null, service_date_text: serviceDate || null,
        lines: lines as never, total_ht: totals.ht, total_vat: totals.vat, total_ttc: totals.ttc,
        notes: notes || null, due_date: dueDate || null, updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["document", id] }); qc.invalidateQueries({ queryKey: ["documents"] }); toast.success("Enregistré"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const emit = useMutation({
    mutationFn: async () => {
      if (!client.name) throw new Error("Renseigne le client avant d'émettre.");
      if (lines.length === 0) throw new Error("Ajoute au moins une ligne.");
      // 1. Numéro séquentiel (légal) si pas déjà attribué
      let number = doc?.number || null;
      if (!number) {
        const { data, error } = await supabase.rpc("next_document_number", { p_type: doc!.type });
        if (error) throw error;
        number = data as string;
      }
      const today = new Date().toISOString().slice(0, 10);
      const due = dueDate || new Date(Date.now() + (Number(settings?.payment_terms_days ?? 30)) * 86400000).toISOString().slice(0, 10);
      const { error } = await supabase.from("documents").update({
        number, status: "envoye", issue_date: today, due_date: due, sent_at: new Date().toISOString(),
        client_name: client.name, client_address: client.address || null, client_postal_code: client.postal_code || null,
        client_city: client.city || null, client_siret: client.siret || null, client_email: client.email || null,
        client_is_pro: isPro, client_delivery_address: delivery || null, service_date_text: serviceDate || null,
        lines: lines as never, total_ht: totals.ht, total_vat: totals.vat, total_ttc: totals.ttc, notes: notes || null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      return number;
    },
    onSuccess: (number) => { qc.invalidateQueries({ queryKey: ["document", id] }); qc.invalidateQueries({ queryKey: ["documents"] }); toast.success(`Émis — ${number}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPdf = () => {
    if (!doc) return;
    const html = renderDocumentHtml(
      {
        type: doc.type as "devis" | "facture", number: doc.number, issue_date: doc.issue_date || new Date().toISOString().slice(0, 10),
        due_date: dueDate || null, service_date_text: serviceDate || null,
        client_name: client.name, client_address: client.address, client_postal_code: client.postal_code, client_city: client.city,
        client_siret: client.siret, client_email: client.email, client_delivery_address: delivery, client_is_pro: isPro,
        lines, notes,
      },
      (settings || {}) as Parameters<typeof renderDocumentHtml>[1],
    );
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    else { const b = new Blob([html], { type: "text/html" }); window.open(URL.createObjectURL(b), "_blank"); }
  };

  if (isLoading || !doc) return <div className="p-6 text-muted-foreground">{isLoading ? "Chargement…" : "Document introuvable."}</div>;
  const isFacture = doc.type === "facture";
  const emitted = doc.status !== "brouillon";

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="gap-1"><Link to="/facturation"><ArrowLeft className="h-4 w-4" /> Facturation</Link></Button>
          <h1 className="text-xl font-bold">{isFacture ? "Facture" : "Devis"} {doc.number ? `· ${doc.number}` : <span className="text-muted-foreground font-normal">(brouillon)</span>}</h1>
          {emitted && <Badge className={cn("border-0", STATUS_BADGE[doc.status] || STATUS_BADGE.envoye)}>{STATUS_LABEL[doc.status] || doc.status}</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openPdf}>
            <FileDown className="h-3.5 w-3.5" /> Aperçu / PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Enregistrer
          </Button>
          {!emitted && (
            <Button size="sm" className="gap-1.5" disabled={emit.isPending} onClick={() => emit.mutate()}>
              {emit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Émettre (n° légal)
            </Button>
          )}
        </div>
      </div>

      {/* Facture issue d'un devis signé */}
      {isFacture && doc.converted_from && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-4 py-2.5 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Générée automatiquement depuis le devis {sourceDevis?.number ? <b>{sourceDevis.number}</b> : "signé"}{sourceDevis?.signed_by_name ? <> · signé par <b>{sourceDevis.signed_by_name}</b></> : ""}.</span>
        </div>
      )}

      {/* Signature en ligne (devis uniquement) */}
      {doc.type === "devis" && <SignatureCard doc={doc} facture={convertedFacture} />}

      {/* Client */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Client</CardTitle>
          <ProspectPicker onPick={(p) => setClient(p)} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom / société *"><Input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} /></Field>
            <Field label="Email"><Input value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} /></Field>
          </div>
          <Field label="Adresse de facturation"><Input value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
          <div className="grid grid-cols-[110px_1fr_200px] gap-3">
            <Field label="Code postal"><Input value={client.postal_code} onChange={(e) => setClient({ ...client, postal_code: e.target.value })} /></Field>
            <Field label="Ville"><Input value={client.city} onChange={(e) => setClient({ ...client, city: e.target.value })} /></Field>
            <Field label="SIREN / SIRET (client pro)"><Input value={client.siret} onChange={(e) => setClient({ ...client, siret: e.target.value })} placeholder="9 ou 14 chiffres" /></Field>
          </div>
          <Field label="Adresse de livraison (si différente)"><Input value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="Optionnel" /></Field>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={isPro} onChange={(e) => setIsPro(e.target.checked)} />
            Client professionnel (B2B) — affiche le SIREN + mentions de paiement obligatoires
          </label>
        </CardContent>
      </Card>

      {/* Lignes */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Prestations</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className={cn("grid gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1", franchise ? "grid-cols-[1fr_70px_110px_40px]" : "grid-cols-[1fr_60px_100px_70px_40px]")}>
            <span>Description</span><span>Qté</span><span>Prix HT</span>{!franchise && <span>TVA %</span>}<span></span>
          </div>
          {lines.map((l, i) => (
            <div key={i} className={cn("grid gap-2 items-center", franchise ? "grid-cols-[1fr_70px_110px_40px]" : "grid-cols-[1fr_60px_100px_70px_40px]")}>
              <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Création site web…" className="h-8 text-sm" />
              <Input type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="h-8 text-sm" />
              <Input type="number" value={l.unit_price_ht} onChange={(e) => setLine(i, { unit_price_ht: Number(e.target.value) })} className="h-8 text-sm" />
              {!franchise && <Input type="number" value={l.vat_rate} onChange={(e) => setLine(i, { vat_rate: Number(e.target.value) })} className="h-8 text-sm" />}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => delLine(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={addLine}><Plus className="h-3.5 w-3.5" /> Ajouter une ligne</Button>

          {/* Totaux */}
          <div className="flex justify-end pt-3">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span className="tabular-nums font-medium">{money(totals.ht)}</span></div>
              {!franchise && <div className="flex justify-between"><span className="text-muted-foreground">TVA</span><span className="tabular-nums">{money(totals.vat)}</span></div>}
              <div className="flex justify-between border-t pt-1 font-bold"><span>Total {franchise ? "" : "TTC"}</span><span className="tabular-nums">{money(totals.ttc)}</span></div>
              {franchise && <p className="text-[10px] text-muted-foreground pt-1">TVA non applicable, art. 293 B du CGI</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Échéance + notes */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={isFacture ? "Échéance de paiement" : "Validité du devis"}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            <Field label="Date / période de prestation *"><Input value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} placeholder="Livraison le 15/06/2026 · ou Période du 01/06 au 30/06" /></Field>
          </div>
          <Field label="Note / conditions"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Acompte de 30% à la commande…" /></Field>
        </CardContent>
      </Card>

      {/* Paiement en ligne (factures uniquement) */}
      {isFacture && <PaymentCard doc={doc} />}

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

// ── Signature en ligne d'un devis (lien public + suivi + orchestration) ──
type SignDoc = {
  type: string; status: string; number: string | null; share_token: string;
  viewed_at: string | null; accepted_at: string | null; refused_at: string | null; signed_by_name: string | null;
};
function SignatureCard({ doc, facture }: { doc: SignDoc; facture?: { id: string; number: string | null; status: string } | null }) {
  const navigate = Route.useNavigate();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/devis/${doc.share_token}`;
  const emitted = doc.status !== "brouillon";
  const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long" }) : "");

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Lien copié"); }
    catch { toast.error("Copie impossible — sélectionne le lien manuellement."); }
  };

  return (
    <Card className="border-indigo-200 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/50 to-transparent dark:from-indigo-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><PenLine className="h-4 w-4 text-indigo-600" /> Signature en ligne</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!emitted ? (
          <p className="text-sm text-muted-foreground">
            Émets le devis (bouton <b>Émettre</b>) pour générer le lien de signature à envoyer au client.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs font-mono" />
              <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={copy}><Copy className="h-3.5 w-3.5" /> Copier</Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" asChild>
                <a href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Ouvrir</a>
              </Button>
            </div>

            {/* Statut de signature */}
            {doc.status === "accepte" ? (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-3 space-y-2">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Accepté{doc.signed_by_name ? ` par ${doc.signed_by_name}` : ""}{doc.accepted_at ? ` le ${d(doc.accepted_at)}` : ""}
                </p>
                {facture && (
                  <button
                    onClick={() => navigate({ to: "/facturation/document/$id", params: { id: facture.id } })}
                    className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Voir la facture créée automatiquement{facture.number ? ` · ${facture.number}` : " (brouillon)"}
                  </button>
                )}
              </div>
            ) : doc.status === "refuse" ? (
              <p className="text-sm text-rose-700 dark:text-rose-400">Devis décliné par le client{doc.refused_at ? ` le ${d(doc.refused_at)}` : ""}.</p>
            ) : doc.viewed_at ? (
              <p className="text-sm text-sky-700 dark:text-sky-400 flex items-center gap-1.5"><Eye className="h-4 w-4" /> Vu par le client le {d(doc.viewed_at)} — en attente de signature.</p>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Link2 className="h-4 w-4" /> Envoie ce lien au client. Tu seras prévenu quand il l'ouvre et le signe.</p>
            )}

            <p className="text-[11px] text-muted-foreground border-t pt-2.5">
              ⚡ Dès la signature : la <b>facture</b> est créée automatiquement et le prospect passe en <b>production (Studio)</b>. Tout s'enchaîne.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Paiement en ligne d'une facture (Stripe) ────────────────────────────
type PayDoc = { id: string; status: string; payment_url: string | null; total_ttc: number };
function PaymentCard({ doc }: { doc: PayDoc }) {
  const qc = useQueryClient();
  const emitted = doc.status !== "brouillon";
  const paid = doc.status === "paye";

  const { data: stripe } = useQuery({
    queryKey: ["stripe-status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("stripe-payment-link", { body: { action: "status" } });
      return data as { configured?: boolean } | null;
    },
  });
  const configured = !!stripe?.configured;

  const gen = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("stripe-payment-link", { body: { document_id: doc.id } });
      if (error) throw error;
      const res = data as { ok?: boolean; url?: string; error?: string };
      if (res?.error) throw new Error(res.error === "stripe_not_configured" ? "Stripe n'est pas connecté." : res.error);
      return res.url as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["document", doc.id] }); toast.success("Lien de paiement créé"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async () => {
    try { await navigator.clipboard.writeText(doc.payment_url!); toast.success("Lien copié"); }
    catch { toast.error("Copie impossible — sélectionne le lien manuellement."); }
  };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-violet-600" /> Paiement en ligne</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {paid ? (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Facture payée.</p>
        ) : !emitted ? (
          <p className="text-sm text-muted-foreground">Émets la facture pour activer le paiement en ligne.</p>
        ) : !configured ? (
          <p className="text-sm text-muted-foreground">
            Connecte <b>Stripe</b> pour permettre à tes clients de régler par carte en 1 clic. La facture se marque <b>payée</b> automatiquement.
            <br /><span className="text-[11px]">→ Donne-moi tes clés Stripe pour activer (configuration en cours).</span>
          </p>
        ) : doc.payment_url ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={doc.payment_url} onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs font-mono" />
              <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={copy}><Copy className="h-3.5 w-3.5" /> Copier</Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" asChild>
                <a href={doc.payment_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Ouvrir</a>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Envoie ce lien au client. Dès le paiement, la facture passe en <b>Payé</b> automatiquement.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Génère un lien de paiement par carte pour cette facture.</p>
            <Button size="sm" className="gap-1.5" disabled={gen.isPending} onClick={() => gen.mutate()}>
              {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Créer un lien de paiement
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Importer les coordonnées d'un prospect du CRM
function ProspectPicker({ onPick }: { onPick: (c: { name: string; address: string; postal_code: string; city: string; siret: string; email: string }) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const { data: results } = useQuery({
    queryKey: ["picker-prospects", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("prospects")
        .select("id, first_name, last_name, company, email, location, siret")
        .or(`company.ilike.%${q}%,last_name.ilike.%${q}%`).limit(6);
      return data || [];
    },
  });

  return (
    <div className="relative">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen((o) => !o)}><UserSearch className="h-3.5 w-3.5" /> Importer un prospect</Button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 z-20 rounded-lg border bg-popover shadow-lg p-2 space-y-1">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou société…" className="h-8 text-sm" />
          {(results || []).map((p) => {
            const addr = parseFrenchAddress(p.location);
            return (
              <button key={p.id} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                onClick={() => {
                  onPick({ name: p.company || `${p.first_name} ${p.last_name}`.trim(), address: addr.address_line, postal_code: addr.postal_code, city: addr.city, siret: p.siret || "", email: p.email || "" });
                  setOpen(false); setQ("");
                }}>
                <span className="font-medium">{p.company || `${p.first_name} ${p.last_name}`}</span>
                {p.location && <span className="text-muted-foreground"> · {p.location}</span>}
              </button>
            );
          })}
          {q.trim().length >= 2 && (results || []).length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">Aucun résultat</p>}
        </div>
      )}
    </div>
  );
}
