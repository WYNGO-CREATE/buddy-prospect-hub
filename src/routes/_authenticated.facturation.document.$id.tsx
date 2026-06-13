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
import { ArrowLeft, Plus, Trash2, Loader2, Save, Send, UserSearch } from "lucide-react";
import { parseFrenchAddress } from "@/lib/address";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/facturation/document/$id")({
  component: DocumentEditor,
  head: () => ({ meta: [{ title: "Document — Facturation Wyngo" }] }),
});

type Line = { description: string; quantity: number; unit_price_ht: number; vat_rate: number };
const money = (n: number) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

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

  // État local
  const [client, setClient] = useState({ name: "", address: "", postal_code: "", city: "", siret: "", email: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!doc) return;
    setClient({
      name: doc.client_name || "", address: doc.client_address || "", postal_code: doc.client_postal_code || "",
      city: doc.client_city || "", siret: doc.client_siret || "", email: doc.client_email || "",
    });
    setLines(Array.isArray(doc.lines) ? (doc.lines as Line[]) : []);
    setNotes(doc.notes || "");
    setDueDate(doc.due_date || "");
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
        lines: lines as never, total_ht: totals.ht, total_vat: totals.vat, total_ttc: totals.ttc, notes: notes || null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      return number;
    },
    onSuccess: (number) => { qc.invalidateQueries({ queryKey: ["document", id] }); qc.invalidateQueries({ queryKey: ["documents"] }); toast.success(`Émis — ${number}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !doc) return <div className="p-6 text-muted-foreground">{isLoading ? "Chargement…" : "Document introuvable."}</div>;
  const isFacture = doc.type === "facture";
  const emitted = doc.status !== "brouillon";

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="gap-1"><Link to="/facturation"><ArrowLeft className="h-4 w-4" /> Facturation</Link></Button>
          <h1 className="text-xl font-bold">{isFacture ? "Facture" : "Devis"} {doc.number ? `· ${doc.number}` : <span className="text-muted-foreground font-normal">(brouillon)</span>}</h1>
          {emitted && <Badge className="border-0 bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">{doc.status}</Badge>}
        </div>
        <div className="flex gap-2">
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
          <Field label="Adresse"><Input value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} /></Field>
          <div className="grid grid-cols-[110px_1fr_180px] gap-3">
            <Field label="Code postal"><Input value={client.postal_code} onChange={(e) => setClient({ ...client, postal_code: e.target.value })} /></Field>
            <Field label="Ville"><Input value={client.city} onChange={(e) => setClient({ ...client, city: e.target.value })} /></Field>
            <Field label="SIRET"><Input value={client.siret} onChange={(e) => setClient({ ...client, siret: e.target.value })} /></Field>
          </div>
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
          </div>
          <Field label="Note / conditions"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Acompte de 30% à la commande…" /></Field>
        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground pb-4">🔜 Prochaine étape : descriptions générées par l'IA, vérification de conformité, et PDF.</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
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
