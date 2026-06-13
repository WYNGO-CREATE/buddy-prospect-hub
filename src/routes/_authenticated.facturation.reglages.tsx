/**
 * ─── Facturation — Réglages (infos légales du vendeur) ─────────────────
 *
 * Ces infos apparaissent sur tous les devis/factures et sont OBLIGATOIRES
 * pour la conformité française (SIRET, mentions, régime TVA…).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/facturation/reglages")({
  component: ReglagesPage,
  head: () => ({ meta: [{ title: "Réglages facturation — Wyngo" }] }),
});

type Settings = {
  legal_name: string; legal_form: string; address: string; postal_code: string; city: string;
  siret: string; vat_number: string; vat_regime: "franchise" | "normal"; default_vat_rate: number;
  iban: string; bic: string; payment_terms_days: number; late_penalty: string; custom_mentions: string;
  email: string; phone: string; is_ei: boolean; rne_registered: boolean;
};

const EMPTY: Settings = {
  legal_name: "", legal_form: "", address: "", postal_code: "", city: "", siret: "", vat_number: "",
  vat_regime: "franchise", default_vat_rate: 20, iban: "", bic: "", payment_terms_days: 30,
  late_penalty: "Pénalités de retard : 3 fois le taux d'intérêt légal en cas de retard de paiement.",
  custom_mentions: "", email: "", phone: "", is_ei: true, rne_registered: true,
};

function ReglagesPage() {
  const qc = useQueryClient();
  const [s, setS] = useState<Settings>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["billing-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("billing_settings").select("*").eq("id", true).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (data) setS((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null)) } as Settings));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("billing_settings").upsert({ id: true, ...s, updated_at: new Date().toISOString() } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["billing-settings"] }); toast.success("Réglages enregistrés"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  if (isLoading) return <div className="p-6 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="gap-1"><Link to="/facturation"><ArrowLeft className="h-4 w-4" /> Facturation</Link></Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Réglages de facturation</h1>
        <p className="text-sm text-muted-foreground">Ces infos figurent sur tous tes devis et factures — elles sont obligatoires légalement.</p>
      </div>

      {/* Identité légale */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Ton identité (vendeur)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Raison sociale *"><Input value={s.legal_name} onChange={(e) => set("legal_name", e.target.value)} placeholder="Wyngo / Jean Dupont EI" /></Field>
            <Field label="Forme juridique"><Input value={s.legal_form} onChange={(e) => set("legal_form", e.target.value)} placeholder="Micro-entreprise, SARL, SAS…" /></Field>
          </div>
          <Field label="Adresse"><Input value={s.address} onChange={(e) => set("address", e.target.value)} placeholder="12 rue des Lilas" /></Field>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <Field label="Code postal"><Input value={s.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></Field>
            <Field label="Ville"><Input value={s.city} onChange={(e) => set("city", e.target.value)} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="SIRET * (14 chiffres)"><Input value={s.siret} onChange={(e) => set("siret", e.target.value)} placeholder="123 456 789 00012" /></Field>
            <Field label="Email"><Input value={s.email} onChange={(e) => set("email", e.target.value)} /></Field>
          </div>
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={s.is_ei} onChange={(e) => set("is_ei", e.target.checked)} />
              Entreprise Individuelle — ajoute la mention <b>« EI »</b> à ton nom (obligatoire)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={s.rne_registered} onChange={(e) => set("rne_registered", e.target.checked)} />
              Afficher <b>« Immatriculé au RNE »</b> (obligatoire micro-entreprise)
            </label>
          </div>
        </CardContent>
      </Card>

      {/* TVA */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">TVA</CardTitle>
          <CardDescription className="text-xs">Détermine si la TVA apparaît sur tes documents.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Régime de TVA *">
            <Select value={s.vat_regime} onValueChange={(v) => set("vat_regime", v as "franchise" | "normal")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="franchise">Franchise en base (micro / auto-entrepreneur — pas de TVA)</SelectItem>
                <SelectItem value="normal">Assujetti à la TVA</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {s.vat_regime === "franchise" ? (
            <p className="text-xs text-muted-foreground rounded-md bg-muted/40 p-2">
              ✅ Mention automatique sur tes documents : <i>« TVA non applicable, art. 293 B du CGI »</i>. Aucune TVA n'est ajoutée.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Taux de TVA par défaut (%)"><Input type="number" value={s.default_vat_rate} onChange={(e) => set("default_vat_rate", Number(e.target.value))} /></Field>
              <Field label="N° TVA intracom"><Input value={s.vat_number} onChange={(e) => set("vat_number", e.target.value)} placeholder="FR 12 345678901" /></Field>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paiement */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Paiement</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Délai (jours)"><Input type="number" value={s.payment_terms_days} onChange={(e) => set("payment_terms_days", Number(e.target.value))} /></Field>
            <Field label="IBAN"><Input value={s.iban} onChange={(e) => set("iban", e.target.value)} /></Field>
            <Field label="BIC"><Input value={s.bic} onChange={(e) => set("bic", e.target.value)} /></Field>
          </div>
          <Field label="Pénalités de retard (mention légale)"><Textarea value={s.late_penalty} onChange={(e) => set("late_penalty", e.target.value)} rows={3} className="text-xs" /></Field>
          <Field label="Mentions additionnelles (optionnel)"><Textarea value={s.custom_mentions} onChange={(e) => set("custom_mentions", e.target.value)} rows={2} placeholder="Ex : Membre d'une association agréée…" /></Field>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-6">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !s.legal_name || !s.siret} className="gap-1.5">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
