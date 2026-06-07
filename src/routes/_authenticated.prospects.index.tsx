import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, AlertTriangle, Download, Upload, PhoneCall, PhoneOff, PhoneIncoming, Trash2, ChevronRight } from "lucide-react";
import { PROSPECT_STATUSES, STATUS_LABELS, STATUS_VARIANTS, SUGGESTION_TONE, suggestNextAction, type ProspectStatus } from "@/lib/crm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { toCSV, downloadCSV } from "@/lib/csv";
import { computeSmartTags } from "@/lib/smart-tags";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { ImportCSVDialog } from "@/components/import-csv-dialog";

type DuplicateMatch = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  owner_name: string | null;
  match_email: boolean;
  match_phone: boolean;
  match_website: boolean;
};

export const Route = createFileRoute("/_authenticated/prospects/")({
  component: ProspectsPage,
  head: () => ({ meta: [{ title: "Prospects — Wyngo Workspace" }] }),
});

const prospectSchema = z.object({
  first_name: z.string().trim().min(1, "Prénom requis").max(80),
  last_name: z.string().trim().min(1, "Nom requis").max(80),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Email invalide").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  website: z.string().trim().max(255).optional().or(z.literal("")),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.string().trim().max(255).optional().or(z.literal("")),
  next_action: z.string().trim().max(255).optional().or(z.literal("")),
  next_action_at: z.string().optional().or(z.literal("")),
});

function ProspectsPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [callFilter, setCallFilter] = useState<"all" | "never" | "recent" | "stale">("all");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [open, setOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [pendingPayload, setPendingPayload] = useState<any | null>(null);
  const [checking, setChecking] = useState(false);
  // Vérification doublons en direct dans le formulaire
  const [liveEmail, setLiveEmail] = useState("");
  const [livePhone, setLivePhone] = useState("");
  const [liveWebsite, setLiveWebsite] = useState("");
  const [liveDups, setLiveDups] = useState<DuplicateMatch[]>([]);

  const { data: profiles } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles || []).forEach((p) => m.set(p.id, p.full_name || p.email || "—"));
    return m;
  }, [profiles]);

  const { data: prospects, isLoading } = useQuery({
    queryKey: ["prospects", search, statusFilter, scope, user?.id, role],
    queryFn: async () => {
      let q = supabase.from("prospects").select("*").order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as ProspectStatus);
      if (role !== "admin" || scope === "mine") q = q.eq("owner_id", user!.id);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`first_name.ilike.${s},last_name.ilike.${s},company.ilike.${s},email.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Dernier contact + prochaine relance pour calculer la suggestion
  const { data: lastContacts } = useQuery({
    queryKey: ["last-contacts-list"],
    queryFn: async () => {
      const { data } = await supabase.rpc("prospects_last_contact");
      return (data || []) as Array<{ prospect_id: string; last_contact_at: string }>;
    },
  });
  const { data: nextFollowups } = useQuery({
    queryKey: ["next-followups-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("follow_ups")
        .select("prospect_id, scheduled_at")
        .eq("completed", false)
        .order("scheduled_at", { ascending: true });
      return data || [];
    },
  });
  const lastContactMap = useMemo(() => {
    const m = new Map<string, string>();
    (lastContacts || []).forEach((r) => m.set(r.prospect_id, r.last_contact_at));
    return m;
  }, [lastContacts]);
  const nextFollowupMap = useMemo(() => {
    const m = new Map<string, string>();
    (nextFollowups || []).forEach((r: any) => { if (!m.has(r.prospect_id)) m.set(r.prospect_id, r.scheduled_at); });
    return m;
  }, [nextFollowups]);

  // ─── Dernier appel par prospect (pour la colonne "Appel" + le filtre) ───
  const { data: allCalls } = useQuery({
    queryKey: ["all-calls-list"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_logs")
        .select("id, prospect_id, called_at")
        .order("called_at", { ascending: false });
      return data || [];
    },
  });
  const lastCallMap = useMemo(() => {
    const m = new Map<string, string>();
    (allCalls || []).forEach((c: any) => {
      if (!m.has(c.prospect_id)) m.set(c.prospect_id, c.called_at);
    });
    return m;
  }, [allCalls]);

  // ─── Batch : ouvertures aperçus + nb messages inbound pour smart-tags ──
  const { data: previewStats } = useQuery({
    queryKey: ["preview-stats-list"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_previews")
        .select("prospect_id, opened_at, view_count, source_data");
      return data || [];
    },
  });
  // Map prospect_id → { last_opened_at, view_count, has_generated, rating }
  const previewMap = useMemo(() => {
    const m = new Map<string, { last_opened_at: string | null; view_count: number; has_generated: boolean; rating: number | null }>();
    (previewStats || []).forEach((p: any) => {
      const existing = m.get(p.prospect_id);
      const newOpened = p.opened_at && (!existing?.last_opened_at || p.opened_at > existing.last_opened_at) ? p.opened_at : existing?.last_opened_at ?? null;
      const newViewCount = Math.max(existing?.view_count || 0, p.view_count || 0);
      const rating = p.source_data?.places?.rating ?? existing?.rating ?? null;
      m.set(p.prospect_id, {
        last_opened_at: newOpened,
        view_count: newViewCount,
        has_generated: true,
        rating,
      });
    });
    return m;
  }, [previewStats]);

  const { data: lastInbounds } = useQuery({
    queryKey: ["last-inbound-list"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("prospect_id, occurred_at")
        .eq("direction", "inbound")
        .not("prospect_id", "is", null)
        .order("occurred_at", { ascending: false });
      return data || [];
    },
  });
  const lastInboundMap = useMemo(() => {
    const m = new Map<string, string>();
    (lastInbounds || []).forEach((msg: any) => {
      if (!m.has(msg.prospect_id)) m.set(msg.prospect_id, msg.occurred_at);
    });
    return m;
  }, [lastInbounds]);

  // Catégorisation appel : never / recent (<14 j) / stale (>14 j)
  const callBucket = (prospectId: string): "never" | "recent" | "stale" => {
    const ts = lastCallMap.get(prospectId);
    if (!ts) return "never";
    const days = (Date.now() - new Date(ts).getTime()) / (24 * 60 * 60 * 1000);
    return days <= 14 ? "recent" : "stale";
  };

  // ─── Toggle appelé / pas appelé en 1 clic ───
  const toggleCalled = useMutation({
    mutationFn: async (prospectId: string) => {
      const existingTs = lastCallMap.get(prospectId);
      if (existingTs) {
        // Déjà appelé → on supprime TOUS les appels de ce prospect pour le marquer "non appelé"
        const { error } = await supabase.from("call_logs").delete().eq("prospect_id", prospectId);
        if (error) throw error;
        return { action: "uncalled" };
      } else {
        // Jamais appelé → on crée une trace minimale
        const { error } = await supabase.from("call_logs").insert({
          prospect_id: prospectId,
          owner_id: user!.id,
          called_at: new Date().toISOString(),
          outcome: "logged_quick",
        });
        if (error) throw error;
        return { action: "called" };
      }
    },
    onSuccess: (res) => {
      toast.success(res.action === "called" ? "Marqué comme appelé ✓" : "Marqué comme non appelé");
      qc.invalidateQueries({ queryKey: ["all-calls-list"] });
      qc.invalidateQueries({ queryKey: ["last-contacts-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Vérification en direct des doublons (email / téléphone / site) — debounce 400ms
  useEffect(() => {
    if (!open) { setLiveDups([]); setLiveEmail(""); setLivePhone(""); setLiveWebsite(""); return; }
    const e = liveEmail.trim();
    const p = livePhone.trim();
    const w = liveWebsite.trim();
    if (e.length < 4 && p.length < 4 && w.length < 4) { setLiveDups([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("find_prospect_duplicates", {
        _email: e || undefined, _phone: p || undefined, _website: w || undefined, _exclude_id: undefined as any,
      });
      setLiveDups((data as DuplicateMatch[]) || []);
    }, 400);
    return () => clearTimeout(t);
  }, [liveEmail, livePhone, liveWebsite, open]);

  async function checkDuplicates(payload: any): Promise<DuplicateMatch[]> {
    const { data, error } = await supabase.rpc("find_prospect_duplicates", {
      _email: payload.email,
      _phone: payload.phone,
      _website: payload.website,
      _exclude_id: undefined as any,
    });
    if (error) throw error;
    return (data as DuplicateMatch[]) || [];
  }

  const create = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("prospects").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prospect ajouté");
      qc.invalidateQueries({ queryKey: ["prospects"] });
      setOpen(false);
      setPendingPayload(null);
      setDuplicates([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function buildPayload(parsed: z.infer<typeof prospectSchema>) {
    const tags = parsed.tags
      ? parsed.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const payload: any = {
      ...parsed,
      tags,
      next_action_at: parsed.next_action_at ? new Date(parsed.next_action_at).toISOString() : null,
      owner_id: user!.id,
    };
    Object.keys(payload).forEach((k) => payload[k] === "" && (payload[k] = null));
    return payload;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const parsed = prospectSchema.safeParse(raw);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    const payload = buildPayload(parsed.data);
    setChecking(true);
    try {
      const dups = await checkDuplicates(payload);
      setChecking(false);
      if (dups.length > 0) {
        setPendingPayload(payload);
        setDuplicates(dups);
        return;
      }
      create.mutate(payload);
    } catch (err: any) {
      setChecking(false);
      toast.error(err.message || "Erreur de vérification");
    }
  }

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProspectStatus }) => {
      const { error } = await supabase.from("prospects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospects"] });
      toast.success("Statut mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Suppression d'un prospect (cascade : call_logs, follow_ups, messages, etc.
  // sont supprimés grâce aux FK ON DELETE CASCADE déclarées dans le schéma).
  const deleteProspect = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prospects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospects"] });
      qc.invalidateQueries({ queryKey: ["imported-sirets"] });
      toast.success("Prospect supprimé");
    },
    onError: (e: Error) => toast.error("Suppression impossible", { description: e.message }),
  });

  function exportCSV() {
    if (!prospects || prospects.length === 0) { toast.error("Rien à exporter"); return; }
    const rows = prospects.map((p) => ({
      prenom: p.first_name,
      nom: p.last_name,
      societe: p.company || "",
      email: p.email || "",
      telephone: p.phone || "",
      site_web: p.website || "",
      statut: STATUS_LABELS[p.status as ProspectStatus] || p.status,
      tags: (p.tags || []).join(", "),
      prochaine_action: p.next_action || "",
      date_action: p.next_action_at ? format(new Date(p.next_action_at), "yyyy-MM-dd HH:mm") : "",
      proprietaire: profileMap.get(p.owner_id) || "",
      cree_le: format(new Date(p.created_at), "yyyy-MM-dd"),
    }));
    const headers = Object.keys(rows[0]);
    downloadCSV(`prospects-${format(new Date(), "yyyyMMdd")}.csv`, toCSV(rows, headers));
  }

  // Note : l'import CSV est géré par <ImportCSVDialog /> (wizard avec
  // détection auto Apollo/LinkedIn, dédup, mapping configurable, tags batch).

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Prospects</h1>
          <p className="text-muted-foreground">Gérez vos contacts et leur statut</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportCSVDialog>
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" /> Importer CSV
            </Button>
          </ImportCSVDialog>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Exporter
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Nouveau prospect
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nouveau prospect</DialogTitle>
                <DialogDescription>Créez un nouveau contact dans votre base</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="first_name">Prénom *</Label><Input id="first_name" name="first_name" required /></div>
                  <div className="space-y-2"><Label htmlFor="last_name">Nom *</Label><Input id="last_name" name="last_name" required /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="company">Société</Label><Input id="company" name="company" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" value={liveEmail} onChange={(e) => setLiveEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="phone">Téléphone</Label><Input id="phone" name="phone" value={livePhone} onChange={(e) => setLivePhone(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="website">Site web</Label><Input id="website" name="website" placeholder="exemple.com" value={liveWebsite} onChange={(e) => setLiveWebsite(e.target.value)} /></div>
                {liveDups.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium">
                      <AlertTriangle className="h-4 w-4" /> {liveDups.length} doublon{liveDups.length > 1 ? "s" : ""} potentiel{liveDups.length > 1 ? "s" : ""}
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {liveDups.map((d) => (
                        <div key={d.id} className="text-xs">
                          <Link to="/prospects/$id" params={{ id: d.id }} className="font-medium hover:underline" onClick={() => setOpen(false)}>
                            {d.first_name} {d.last_name}{d.company ? ` — ${d.company}` : ""}
                          </Link>
                          <span className="text-muted-foreground"> · {[d.match_email && "email", d.match_phone && "tél", d.match_website && "site"].filter(Boolean).join(", ")} identique</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2"><Label htmlFor="source">Source</Label><Input id="source" name="source" placeholder="LinkedIn, Salon…" /></div>
                <div className="space-y-2"><Label htmlFor="tags">Étiquettes (séparées par virgule)</Label><Input id="tags" name="tags" placeholder="VIP, Salon Paris 2026" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="next_action">Prochaine action</Label><Input id="next_action" name="next_action" placeholder="Envoyer devis…" /></div>
                  <div className="space-y-2"><Label htmlFor="next_action_at">Date</Label><Input id="next_action_at" name="next_action_at" type="datetime-local" /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={3} /></div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending || checking}>
                    {checking ? "Vérification…" : create.isPending ? "Ajout…" : "Ajouter"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={duplicates.length > 0} onOpenChange={(o) => { if (!o) { setDuplicates([]); setPendingPayload(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Prospect potentiellement déjà existant
            </DialogTitle>
            <DialogDescription>
              Un ou plusieurs prospects partagent un email, téléphone ou site web identique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {duplicates.map((d) => (
              <div key={d.id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Link to="/prospects/$id" params={{ id: d.id }} className="font-medium hover:underline" onClick={() => { setDuplicates([]); setPendingPayload(null); setOpen(false); }}>
                    {d.first_name} {d.last_name}{d.company ? ` — ${d.company}` : ""}
                  </Link>
                  <span className="text-xs text-muted-foreground">Géré par {d.owner_name || "?"}</span>
                </div>
                <div className="text-xs text-muted-foreground space-x-2">
                  {d.email && <span className={d.match_email ? "text-amber-600 font-medium" : ""}>{d.email}</span>}
                  {d.phone && <span className={d.match_phone ? "text-amber-600 font-medium" : ""}>· {d.phone}</span>}
                  {d.website && <span className={d.match_website ? "text-amber-600 font-medium" : ""}>· {d.website}</span>}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDuplicates([]); setPendingPayload(null); }}>Annuler</Button>
            <Button onClick={() => pendingPayload && create.mutate(pendingPayload)} disabled={create.isPending}>
              Ajouter quand même
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {PROSPECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={callFilter} onValueChange={(v) => setCallFilter(v as any)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">📞 Tous (appels)</SelectItem>
              <SelectItem value="never">📞 Jamais appelés</SelectItem>
              <SelectItem value="recent">📞 Appelés ≤ 14 j</SelectItem>
              <SelectItem value="stale">📞 À rappeler (&gt; 14 j)</SelectItem>
            </SelectContent>
          </Select>
          {role === "admin" && (
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Mes prospects</SelectItem>
                <SelectItem value="team">Équipe entière</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-muted-foreground">Chargement…</p>
          ) : prospects && prospects.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Société</TableHead>
                  <TableHead>Appel</TableHead>
                  <TableHead>Étiquettes</TableHead>
                  <TableHead>Prochaine action</TableHead>
                  <TableHead>Suggestion</TableHead>
                  {role === "admin" && scope === "team" && <TableHead>Propriétaire</TableHead>}
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.filter((p) => {
                  // Filtre Appel
                  if (callFilter === "all") return true;
                  return callBucket(p.id) === callFilter;
                }).map((p) => {
                  const sugg = suggestNextAction({
                    status: p.status as ProspectStatus,
                    createdAt: p.created_at,
                    lastContactAt: lastContactMap.get(p.id) || null,
                    nextFollowupAt: nextFollowupMap.get(p.id) || null,
                    nextActionLabel: p.next_action,
                    nextActionAt: p.next_action_at,
                  });
                  const lastCallAt = lastCallMap.get(p.id);
                  const bucket = callBucket(p.id);
                  return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={(e) => {
                      // Si l'utilisateur clique sur un élément interactif interne
                      // (bouton, lien, select, menu), on laisse l'élément agir
                      // sans naviguer. Sinon → SPA navigation via TanStack Router.
                      const target = e.target as HTMLElement;
                      if (
                        target.closest(
                          "button, a, input, select, [role='menuitem'], [role='button'], [role='combobox'], [data-state]"
                        )
                      )
                        return;
                      navigate({ to: "/prospects/$id", params: { id: p.id } });
                    }}
                  >
                    <TableCell>
                      <Link
                        to="/prospects/$id"
                        params={{ id: p.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-foreground hover:text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {p.first_name} {p.last_name}
                      </Link>
                      {(p.email || p.phone) && (
                        <div className="text-xs text-muted-foreground">{p.email || p.phone}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.company || "—"}</TableCell>
                    <TableCell>
                      {bucket === "never" ? (
                        <button
                          type="button"
                          onClick={() => toggleCalled.mutate(p.id)}
                          disabled={toggleCalled.isPending}
                          title="Cliquer pour marquer comme appelé"
                          className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition cursor-pointer"
                        >
                          <PhoneOff className="h-3 w-3" />
                          Jamais
                        </button>
                      ) : bucket === "recent" ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Annuler le marquage 'appelé' pour ce prospect ?")) toggleCalled.mutate(p.id);
                          }}
                          disabled={toggleCalled.isPending}
                          title={(lastCallAt ? `Appelé le ${format(new Date(lastCallAt), "PPp", { locale: fr })}\n` : "") + "Cliquer pour annuler"}
                          className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition cursor-pointer"
                        >
                          <PhoneIncoming className="h-3 w-3" />
                          {lastCallAt && formatDistanceToNow(new Date(lastCallAt), { addSuffix: true, locale: fr })}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Annuler le marquage 'appelé' pour ce prospect ?")) toggleCalled.mutate(p.id);
                          }}
                          disabled={toggleCalled.isPending}
                          title={(lastCallAt ? `Dernier appel : ${format(new Date(lastCallAt), "PPp", { locale: fr })}\n` : "") + "Cliquer pour annuler"}
                          className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition cursor-pointer"
                        >
                          <PhoneCall className="h-3 w-3" />
                          {lastCallAt && formatDistanceToNow(new Date(lastCallAt), { addSuffix: true, locale: fr })}
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Smart tags auto-calculés (signal vs manuel pourri) */}
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          const previewInfo = previewMap.get(p.id);
                          const smartTags = computeSmartTags({
                            status: p.status,
                            website_status: (p as { website_status?: "no_website" | "outdated" | "has_website" | "unknown" | null }).website_status,
                            created_at: p.created_at,
                            last_preview_opened_at: previewInfo?.last_opened_at ?? null,
                            preview_view_count: previewInfo?.view_count ?? 0,
                            has_preview_generated: previewInfo?.has_generated ?? false,
                            last_called_at: lastCallMap.get(p.id) ?? null,
                            last_inbound_at: lastInboundMap.get(p.id) ?? null,
                            google_rating: previewInfo?.rating ?? null,
                          });
                          if (smartTags.length === 0) {
                            return <span className="text-[10px] text-muted-foreground italic">—</span>;
                          }
                          return smartTags.map((t) => (
                            <span
                              key={t.key}
                              title={t.tooltip}
                              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${t.cls}`}
                            >
                              <span>{t.icon}</span>
                              <span>{t.label}</span>
                            </span>
                          ));
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.next_action ? (
                        <div>
                          <div>{p.next_action}</div>
                          {p.next_action_at && (
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(p.next_action_at), "PP", { locale: fr })}
                            </div>
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn("text-xs px-2 py-1 rounded border inline-block whitespace-nowrap", SUGGESTION_TONE[sugg.tone])}
                        title={sugg.reason}
                      >
                        {sugg.label}
                      </span>
                    </TableCell>
                    {role === "admin" && scope === "team" && (
                      <TableCell className="text-xs text-muted-foreground">{profileMap.get(p.owner_id) || "—"}</TableCell>
                    )}
                    <TableCell>
                      <Select
                        value={p.status}
                        onValueChange={(v) => updateStatus.mutate({ id: p.id, status: v as ProspectStatus })}
                      >
                        <SelectTrigger className={cn("w-[140px] border", STATUS_VARIANTS[p.status as ProspectStatus])}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROSPECT_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* Bouton "Ouvrir la fiche" → chevron très visible, navigation
                            garantie via Link de TanStack Router (asChild pas dispo, on
                            wrappe directement le Link comme un bouton). */}
                        <Link
                          to="/prospects/$id"
                          params={{ id: p.id }}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition inline-flex"
                          title="Ouvrir la fiche prospect"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                        {/* Suppression du prospect (avec confirmation). */}
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Supprimer définitivement « ${p.first_name} ${p.last_name} » ? Cette action est irréversible.`)) {
                              deleteProspect.mutate(p.id);
                            }
                          }}
                          disabled={deleteProspect.isPending}
                          title="Supprimer ce prospect"
                          className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950/50 text-muted-foreground hover:text-rose-700 dark:hover:text-rose-300 transition disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              Aucun prospect. Cliquez sur "Nouveau prospect" pour commencer.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
