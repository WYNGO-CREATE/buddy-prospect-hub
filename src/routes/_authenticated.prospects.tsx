import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { PROSPECT_STATUSES, STATUS_LABELS, STATUS_VARIANTS, type ProspectStatus } from "@/lib/crm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

export const Route = createFileRoute("/_authenticated/prospects")({
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
});

function ProspectsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [pendingPayload, setPendingPayload] = useState<any | null>(null);
  const [checking, setChecking] = useState(false);

  const { data: prospects, isLoading } = useQuery({
    queryKey: ["prospects", search, statusFilter],
    queryFn: async () => {
      let q = supabase.from("prospects").select("*").order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as ProspectStatus);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`first_name.ilike.${s},last_name.ilike.${s},company.ilike.${s},email.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries());
      const parsed = prospectSchema.safeParse(raw);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const payload: any = { ...parsed.data, owner_id: user!.id };
      Object.keys(payload).forEach((k) => payload[k] === "" && (payload[k] = null));
      const { error } = await supabase.from("prospects").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prospect ajouté");
      qc.invalidateQueries({ queryKey: ["prospects"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Prospects</h1>
          <p className="text-muted-foreground">Gérez vos contacts et leur statut</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nouveau prospect
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau prospect</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(new FormData(e.currentTarget));
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="first_name">Prénom *</Label><Input id="first_name" name="first_name" required /></div>
                <div className="space-y-2"><Label htmlFor="last_name">Nom *</Label><Input id="last_name" name="last_name" required /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="company">Société</Label><Input id="company" name="company" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
                <div className="space-y-2"><Label htmlFor="phone">Téléphone</Label><Input id="phone" name="phone" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="source">Source</Label><Input id="source" name="source" placeholder="LinkedIn, Salon…" /></div>
              <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={3} /></div>
              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>{create.isPending ? "Ajout…" : "Ajouter"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                  <TableHead>Contact</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prospects.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer">
                    <TableCell>
                      <Link to="/prospects/$id" params={{ id: p.id }} className="font-medium hover:underline">
                        {p.first_name} {p.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.company || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {p.email && <div>{p.email}</div>}
                      {p.phone && <div>{p.phone}</div>}
                      {!p.email && !p.phone && "—"}
                    </TableCell>
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
                  </TableRow>
                ))}
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
