/**
 * ─── Facturation — Tableau de bord (devis & factures) ─────────────────
 */

import { createFileRoute, Link, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Receipt, Plus, AlertTriangle, Euro, Clock, CheckCircle2, Settings } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/facturation")({
  component: FacturationLayout,
  head: () => ({ meta: [{ title: "Facturation — Wyngo" }] }),
});

// Layout : affiche le dashboard sur /facturation, sinon les sous-routes
function FacturationLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (path !== "/facturation") return <Outlet />;
  return <FacturationDashboard />;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  brouillon: { label: "Brouillon", cls: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" },
  envoye:    { label: "Envoyé",    cls: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300" },
  accepte:   { label: "Accepté",   cls: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" },
  refuse:    { label: "Refusé",    cls: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" },
  paye:      { label: "Payé",      cls: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" },
  en_retard: { label: "En retard", cls: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" },
  annule:    { label: "Annulé",    cls: "bg-slate-100 dark:bg-slate-800 text-slate-500" },
};

type Doc = { id: string; type: string; number: string | null; client_name: string | null; status: string; total_ttc: number; issue_date: string | null; created_at: string };

function FacturationDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: settings } = useQuery({
    queryKey: ["billing-settings"],
    queryFn: async () => (await supabase.from("billing_settings").select("legal_name, siret").eq("id", true).maybeSingle()).data,
  });
  const configured = !!settings?.legal_name && !!settings?.siret;

  const { data: docs } = useQuery({
    queryKey: ["documents", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Doc[]> => {
      const { data } = await supabase.from("documents")
        .select("id, type, number, client_name, status, total_ttc, issue_date, created_at")
        .order("created_at", { ascending: false });
      return (data as Doc[]) || [];
    },
  });

  const list = docs || [];
  const devis = list.filter((d) => d.type === "devis");
  const factures = list.filter((d) => d.type === "facture");
  const impayees = factures.filter((d) => d.status === "envoye" || d.status === "en_retard");
  const impayeesTotal = impayees.reduce((s, d) => s + Number(d.total_ttc || 0), 0);
  const encaisse = factures.filter((d) => d.status === "paye").reduce((s, d) => s + Number(d.total_ttc || 0), 0);

  const create = useMutation({
    mutationFn: async (type: "devis" | "facture") => {
      const { data, error } = await supabase.from("documents").insert({
        owner_id: user!.id, type, status: "brouillon",
        issue_date: new Date().toISOString().slice(0, 10), lines: [], total_ht: 0, total_vat: 0, total_ttc: 0,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["documents"] }); navigate({ to: "/facturation/document/$id", params: { id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const money = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Facturation</h1>
          <p className="text-sm text-muted-foreground">Devis, factures et suivi des paiements.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" disabled={!configured} onClick={() => create.mutate("devis")}><FileText className="h-4 w-4" /> Nouveau devis</Button>
          <Button className="gap-1.5" disabled={!configured} onClick={() => create.mutate("facture")}><Receipt className="h-4 w-4" /> Nouvelle facture</Button>
        </div>
      </div>

      {!configured && (
        <Card className="border-amber-300 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Configure tes réglages avant de facturer</p>
                <p className="text-xs text-muted-foreground">Raison sociale, SIRET, régime TVA… obligatoires sur tout document légal.</p>
              </div>
            </div>
            <Button size="sm" asChild className="gap-1.5"><Link to="/facturation/reglages"><Settings className="h-3.5 w-3.5" /> Configurer</Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={FileText} label="Devis" value={String(devis.length)} tone="sky" />
        <Stat icon={Clock} label="Factures impayées" value={money(impayeesTotal)} tone="amber" />
        <Stat icon={CheckCircle2} label="Encaissé" value={money(encaisse)} tone="emerald" />
        <Stat icon={Euro} label="Documents" value={String(list.length)} tone="violet" />
      </div>

      {/* Liste */}
      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Aucun document. {configured ? "Crée ton premier devis ou ta première facture." : "Configure tes réglages d'abord."}
            </div>
          ) : (
            <ul className="divide-y">
              {list.map((d) => {
                const m = STATUS_META[d.status] || STATUS_META.brouillon;
                return (
                  <li key={d.id}>
                    <Link to="/facturation/document/$id" params={{ id: d.id }} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        {d.type === "facture" ? <Receipt className="h-4 w-4 text-muted-foreground shrink-0" /> : <FileText className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{d.number || (d.type === "facture" ? "Facture (brouillon)" : "Devis (brouillon)")} {d.client_name ? `· ${d.client_name}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{d.issue_date ? format(new Date(d.issue_date), "PP", { locale: fr }) : format(new Date(d.created_at), "PP", { locale: fr })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">{money(Number(d.total_ttc || 0))}</span>
                        <Badge className={cn("border-0", m.cls)}>{m.label}</Badge>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const TONE: Record<string, string> = {
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};
function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div className={cn("size-9 rounded-lg flex items-center justify-center", TONE[tone])}><Icon className="size-4" /></div>
      <div className="min-w-0">
        <div className="text-lg font-bold tabular-nums leading-none truncate">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}
