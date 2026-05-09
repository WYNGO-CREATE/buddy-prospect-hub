import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, PhoneCall, CalendarClock, History, Check } from "lucide-react";
import { PROSPECT_STATUSES, STATUS_LABELS, STATUS_VARIANTS, EVENT_LABELS, type ProspectStatus } from "@/lib/crm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prospects/$id")({
  component: ProspectDetail,
  head: () => ({ meta: [{ title: "Fiche prospect — Wyngo Workspace" }] }),
});

function ProspectDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);

  const { data: prospect, isLoading } = useQuery({
    queryKey: ["prospect", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("prospects").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: calls } = useQuery({
    queryKey: ["calls", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("call_logs").select("*").eq("prospect_id", id).order("called_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: followUps } = useQuery({
    queryKey: ["followups", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("follow_ups").select("*").eq("prospect_id", id).order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: events } = useQuery({
    queryKey: ["events", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("prospect_events").select("*").eq("prospect_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: ProspectStatus) => {
      const { error } = await supabase.from("prospects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect", id] });
      qc.invalidateQueries({ queryKey: ["events", id] });
      toast.success("Statut mis à jour");
    },
  });

  const updateProspect = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries());
      const schema = z.object({
        first_name: z.string().trim().min(1).max(80),
        last_name: z.string().trim().min(1).max(80),
        company: z.string().trim().max(120).optional().or(z.literal("")),
        email: z.string().trim().email().max(255).optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional().or(z.literal("")),
        source: z.string().trim().max(80).optional().or(z.literal("")),
        notes: z.string().trim().max(2000).optional().or(z.literal("")),
      });
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const payload: any = { ...parsed.data };
      Object.keys(payload).forEach((k) => payload[k] === "" && (payload[k] = null));
      const { error } = await supabase.from("prospects").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect", id] });
      setEditing(false);
      toast.success("Coordonnées mises à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCall = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries());
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("call_logs").insert({
        prospect_id: id,
        owner_id: user!.id,
        called_at: raw.called_at ? new Date(String(raw.called_at)).toISOString() : new Date().toISOString(),
        duration_minutes: raw.duration_minutes ? Number(raw.duration_minutes) : null,
        outcome: String(raw.outcome || "") || null,
        summary: String(raw.summary || "") || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calls", id] });
      qc.invalidateQueries({ queryKey: ["events", id] });
      setCallOpen(false);
      toast.success("Appel enregistré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFollowUp = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries());
      if (!raw.scheduled_at) throw new Error("Date requise");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("follow_ups").insert({
        prospect_id: id,
        owner_id: user!.id,
        scheduled_at: new Date(String(raw.scheduled_at)).toISOString(),
        reason: String(raw.reason || "") || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups", id] });
      qc.invalidateQueries({ queryKey: ["events", id] });
      setFollowOpen(false);
      toast.success("Relance programmée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeFollowUp = useMutation({
    mutationFn: async (fid: string) => {
      const { error } = await supabase.from("follow_ups").update({ completed: true }).eq("id", fid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups", id] }),
  });

  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!prospect) return <p>Prospect introuvable.</p>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/prospects"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{prospect.first_name} {prospect.last_name}</h1>
            {prospect.company && <p className="text-muted-foreground">{prospect.company}</p>}
          </div>
        </div>
        <Select value={prospect.status} onValueChange={(v) => updateStatus.mutate(v as ProspectStatus)}>
          <SelectTrigger className={cn("w-[160px] border", STATUS_VARIANTS[prospect.status as ProspectStatus])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROSPECT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Coordonnées</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
            {editing ? "Annuler" : "Modifier"}
          </Button>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form
              onSubmit={(e) => { e.preventDefault(); updateProspect.mutate(new FormData(e.currentTarget)); }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Prénom</Label><Input name="first_name" defaultValue={prospect.first_name} required /></div>
                <div className="space-y-2"><Label>Nom</Label><Input name="last_name" defaultValue={prospect.last_name} required /></div>
              </div>
              <div className="space-y-2"><Label>Société</Label><Input name="company" defaultValue={prospect.company || ""} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" defaultValue={prospect.email || ""} /></div>
                <div className="space-y-2"><Label>Téléphone</Label><Input name="phone" defaultValue={prospect.phone || ""} /></div>
              </div>
              <div className="space-y-2"><Label>Source</Label><Input name="source" defaultValue={prospect.source || ""} /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea name="notes" rows={3} defaultValue={prospect.notes || ""} /></div>
              <Button type="submit" disabled={updateProspect.isPending}>Enregistrer</Button>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-muted-foreground">Email</dt><dd>{prospect.email || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Téléphone</dt><dd>{prospect.phone || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Source</dt><dd>{prospect.source || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Créé le</dt><dd>{format(new Date(prospect.created_at), "PP", { locale: fr })}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{prospect.notes || "—"}</dd></div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="calls">
        <TabsList>
          <TabsTrigger value="calls"><PhoneCall className="h-4 w-4 mr-2" />Appels</TabsTrigger>
          <TabsTrigger value="followups"><CalendarClock className="h-4 w-4 mr-2" />Relances</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-2" />Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="calls" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Appels & échanges</CardTitle>
              <Dialog open={callOpen} onOpenChange={setCallOpen}>
                <DialogTrigger asChild><Button size="sm">Ajouter</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nouvel appel</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); addCall.mutate(new FormData(e.currentTarget)); }} className="space-y-3">
                    <div className="space-y-2"><Label>Date & heure</Label><Input name="called_at" type="datetime-local" defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} /></div>
                    <div className="space-y-2"><Label>Durée (min)</Label><Input name="duration_minutes" type="number" min="0" /></div>
                    <div className="space-y-2"><Label>Issue</Label><Input name="outcome" placeholder="Pas de réponse, RDV pris…" /></div>
                    <div className="space-y-2"><Label>Résumé</Label><Textarea name="summary" rows={3} /></div>
                    <DialogFooter><Button type="submit" disabled={addCall.isPending}>Enregistrer</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!calls || calls.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun appel enregistré.</p>
              ) : (
                <ul className="divide-y">
                  {calls.map((c) => (
                    <li key={c.id} className="py-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{c.outcome || "Appel"}</span>
                        <span className="text-muted-foreground">{format(new Date(c.called_at), "PPp", { locale: fr })}</span>
                      </div>
                      {c.duration_minutes != null && <p className="text-xs text-muted-foreground">{c.duration_minutes} min</p>}
                      {c.summary && <p className="text-sm mt-1 whitespace-pre-wrap">{c.summary}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followups" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Relances</CardTitle>
              <Dialog open={followOpen} onOpenChange={setFollowOpen}>
                <DialogTrigger asChild><Button size="sm">Programmer</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Nouvelle relance</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); addFollowUp.mutate(new FormData(e.currentTarget)); }} className="space-y-3">
                    <div className="space-y-2"><Label>Date & heure *</Label><Input name="scheduled_at" type="datetime-local" required /></div>
                    <div className="space-y-2"><Label>Motif</Label><Textarea name="reason" rows={2} /></div>
                    <DialogFooter><Button type="submit" disabled={addFollowUp.isPending}>Programmer</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!followUps || followUps.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune relance programmée.</p>
              ) : (
                <ul className="divide-y">
                  {followUps.map((f) => (
                    <li key={f.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{format(new Date(f.scheduled_at), "PPp", { locale: fr })}</div>
                        {f.reason && <p className="text-sm text-muted-foreground">{f.reason}</p>}
                      </div>
                      {f.completed ? (
                        <span className="text-xs text-emerald-600 font-medium">Terminée</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => completeFollowUp.mutate(f.id)}>
                          <Check className="h-4 w-4 mr-1" /> Terminer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Historique des échanges</CardTitle></CardHeader>
            <CardContent>
              {!events || events.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun événement.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-3 text-sm">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-medium">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                          <span className="text-muted-foreground text-xs">{format(new Date(e.created_at), "PPp", { locale: fr })}</span>
                        </div>
                        {e.payload && (
                          <p className="text-muted-foreground text-xs mt-1">
                            {formatPayload(e.event_type, e.payload as any)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatPayload(type: string, payload: any) {
  if (!payload) return "";
  if (type === "status_changed") return `${STATUS_LABELS[payload.from as ProspectStatus] || payload.from} → ${STATUS_LABELS[payload.to as ProspectStatus] || payload.to}`;
  if (type === "call_logged") return [payload.outcome, payload.duration ? `${payload.duration} min` : null].filter(Boolean).join(" — ");
  if (type === "follow_up_scheduled") return payload.reason || "";
  if (type === "created") return `Statut initial : ${STATUS_LABELS[payload.status as ProspectStatus] || payload.status}`;
  return "";
}
