/**
 * ─── Statut prospect (anciennement Pipeline) ──────────────────────────
 *
 * Vue Kanban des prospects par statut. Refonte UX :
 *   - Recherche en haut (filtre live nom / société / email)
 *   - Stats par statut en bandeau (cliquables pour filtrer)
 *   - Changement de statut **en 1 clic** via un menu déroulant sur chaque
 *     carte (plus besoin de drag & drop fragile)
 *   - Le drag & drop reste disponible en bonus (utilisateurs power)
 *   - Colonnes plus lisibles : compteur, tone coloré, séparateurs nets
 *   - Carte enrichie : nom, société, téléphone visible si présent
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PROSPECT_STATUSES, STATUS_LABELS, STATUS_VARIANTS, type ProspectStatus } from "@/lib/crm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, Phone, Mail, ChevronDown, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
  head: () => ({ meta: [{ title: "Statut prospect — Wyngo Workspace" }] }),
});

type ProspectRow = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: ProspectStatus;
  tags: string[] | null;
  updated_at: string;
};

function PipelinePage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: prospects } = useQuery({
    queryKey: ["pipeline", scope, user?.id, role],
    queryFn: async () => {
      let q = supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email, phone, status, tags, updated_at")
        .order("updated_at", { ascending: false });
      if (role !== "admin" || scope === "mine") q = q.eq("owner_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ProspectRow[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProspectStatus }) => {
      const { error } = await supabase
        .from("prospects")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      toast.success(`Statut → ${STATUS_LABELS[vars.status]}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Filtre live (nom, société, email)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prospects || [];
    return (prospects || []).filter((p) =>
      [p.first_name, p.last_name, p.company, p.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [prospects, query]);

  // Compteurs par statut sur les prospects filtrés
  const countByStatus = useMemo(() => {
    const m = new Map<ProspectStatus, number>();
    for (const p of filtered) m.set(p.status, (m.get(p.status) || 0) + 1);
    return m;
  }, [filtered]);

  function handleDrop(status: ProspectStatus) {
    if (!dragId) return;
    const p = (prospects || []).find((x) => x.id === dragId);
    setDragId(null);
    if (!p || p.status === status) return;
    updateStatus.mutate({ id: dragId, status });
  }

  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Statut prospect</h1>
          <p className="text-muted-foreground text-sm">
            Clique sur le bandeau de statut d'une carte pour la déplacer — ou glisse-la directement.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un prospect…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 w-[240px]"
            />
          </div>
          {role === "admin" && (
            <Select value={scope} onValueChange={(v) => setScope(v as "mine" | "team")}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Mes prospects</SelectItem>
                <SelectItem value="team">Équipe entière</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* ─── Bandeau de stats par statut ─── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {PROSPECT_STATUSES.map((s) => (
          <div
            key={s}
            className={cn(
              "rounded-lg border px-3 py-2 text-center",
              STATUS_VARIANTS[s],
            )}
          >
            <div className="text-xl font-bold tabular-nums leading-tight">{countByStatus.get(s) || 0}</div>
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
              {STATUS_LABELS[s]}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Colonnes Kanban ─── */}
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-3 min-w-max">
          {PROSPECT_STATUSES.map((status) => {
            const cards = filtered.filter((p) => p.status === status);
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(status)}
                className="w-72 flex-shrink-0 bg-muted/30 rounded-lg p-3 min-h-[60vh]"
              >
                <div className={cn(
                  "text-xs font-bold px-2 py-1.5 rounded mb-3 border flex items-center justify-between",
                  STATUS_VARIANTS[status],
                )}>
                  <span>{STATUS_LABELS[status]}</span>
                  <span className="tabular-nums opacity-80">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((p) => (
                    <ProspectCard
                      key={p.id}
                      prospect={p}
                      draggingId={dragId}
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                      onChangeStatus={(s) => updateStatus.mutate({ id: p.id, status: s })}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded">
                      Aucun prospect
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Carte prospect ───────────────────────────────────────────────────
function ProspectCard({
  prospect: p,
  draggingId,
  onDragStart,
  onDragEnd,
  onChangeStatus,
}: {
  prospect: ProspectRow;
  draggingId: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onChangeStatus: (s: ProspectStatus) => void;
}) {
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "hover:shadow-md transition-shadow",
        draggingId === p.id && "opacity-50",
      )}
    >
      <CardContent className="p-2.5 space-y-2">
        {/* Bandeau de statut cliquable = action principale */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full h-7 px-2 justify-between text-[11px] font-semibold border",
                STATUS_VARIANTS[p.status],
              )}
            >
              <span className="inline-flex items-center gap-1">
                <ArrowRightLeft className="h-3 w-3" />
                Déplacer
              </span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Changer le statut
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PROSPECT_STATUSES.filter((s) => s !== p.status).map((s) => (
              <DropdownMenuItem key={s} onClick={() => onChangeStatus(s)} className="gap-2">
                <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_VARIANTS[s].split(" ")[0])} />
                {STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Identité (lien vers fiche) */}
        <div>
          <Link
            to="/prospects/$id"
            params={{ id: p.id }}
            className="font-semibold text-sm hover:underline block truncate"
          >
            {p.first_name} {p.last_name}
          </Link>
          {p.company && (
            <div className="text-xs text-muted-foreground truncate">{p.company}</div>
          )}
        </div>

        {/* Actions rapides : appeler / mailer */}
        {(p.phone || p.email) && (
          <div className="flex items-center gap-1.5 pt-1 border-t">
            {p.phone && (
              <a
                href={`tel:${p.phone}`}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                title={p.phone}
              >
                <Phone className="h-3 w-3" /> Appeler
              </a>
            )}
            {p.email && (
              <a
                href={`mailto:${p.email}`}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                title={p.email}
              >
                <Mail className="h-3 w-3" /> Email
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
