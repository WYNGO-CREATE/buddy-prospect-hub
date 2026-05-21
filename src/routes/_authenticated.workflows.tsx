import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, Workflow as WorkflowIcon, Play, Pause, Clock, Mail, Linkedin,
  StickyNote, Hourglass, ArrowRight, Users, ChevronUp, ChevronDown, Activity, AlertCircle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/workflows")({
  component: WorkflowsPage,
  head: () => ({ meta: [{ title: "Workflows — Wyngo Workspace" }] }),
});

type Workflow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: "manual" | "on_status";
  trigger_status: string | null;
  created_at: string;
  updated_at: string;
};

type Step = {
  id: string;
  workflow_id: string;
  position: number;
  kind: "email" | "linkedin_task" | "note" | "wait";
  delay_days: number;
  template_id: string | null;
  subject: string | null;
  body: string | null;
};

const KIND_META = {
  email: { label: "Email", icon: Mail, tone: "text-sky-600 bg-sky-50" },
  linkedin_task: { label: "Tâche LinkedIn", icon: Linkedin, tone: "text-blue-700 bg-blue-50" },
  note: { label: "Note interne", icon: StickyNote, tone: "text-amber-600 bg-amber-50" },
  wait: { label: "Attente", icon: Hourglass, tone: "text-muted-foreground bg-muted" },
};

function WorkflowsPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Workflow[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("workflows").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workflows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workflow supprimé");
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (editingId) {
    return <WorkflowEditor workflowId={editingId} onClose={() => setEditingId(null)} />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <WorkflowIcon className="h-6 w-6 text-primary" />
            Workflows
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatisez vos séquences : J0 email → J3 relance → J7 tâche LinkedIn…
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau workflow
        </Button>
      </div>

      <RunsOverview />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <WorkflowIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">Aucun workflow</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Créez votre première séquence automatisée.
            </p>
            <Button onClick={() => setCreating(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> Créer un workflow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {workflows.map((w) => (
            <WorkflowCard
              key={w.id}
              workflow={w}
              onEdit={() => setEditingId(w.id)}
              onToggle={() => toggleActive.mutate({ id: w.id, is_active: !w.is_active })}
              onDelete={() => {
                if (confirm(`Supprimer "${w.name}" ? Tous les runs en cours seront supprimés.`)) {
                  deleteMut.mutate(w.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateWorkflowDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setEditingId(id);
            qc.invalidateQueries({ queryKey: ["workflows"] });
          }}
        />
      )}
    </div>
  );
}

function WorkflowCard({
  workflow, onEdit, onToggle, onDelete,
}: {
  workflow: Workflow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  // Compteurs de runs
  const { data: counts } = useQuery({
    queryKey: ["workflow-run-counts", workflow.id],
    queryFn: async () => {
      const [{ count: running }, { count: completed }] = await Promise.all([
        supabase.from("workflow_runs").select("*", { count: "exact", head: true }).eq("workflow_id", workflow.id).eq("status", "running"),
        supabase.from("workflow_runs").select("*", { count: "exact", head: true }).eq("workflow_id", workflow.id).eq("status", "completed"),
      ]);
      return { running: running ?? 0, completed: completed ?? 0 };
    },
  });

  const { data: stepCount } = useQuery({
    queryKey: ["workflow-step-count", workflow.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("workflow_steps")
        .select("*", { count: "exact", head: true })
        .eq("workflow_id", workflow.id);
      return count ?? 0;
    },
  });

  return (
    <Card className="hover:shadow-md transition">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              {workflow.name}
              {!workflow.is_active && (
                <span className="text-[10px] uppercase font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Désactivé</span>
              )}
            </CardTitle>
            {workflow.description && (
              <CardDescription className="mt-1 text-xs line-clamp-2">{workflow.description}</CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" /> {stepCount ?? 0} étape{(stepCount ?? 0) > 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {counts?.running ?? 0} en cours · {counts?.completed ?? 0} terminés
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button variant="default" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Éditer
          </Button>
          <Button variant="outline" size="sm" onClick={onToggle}>
            {workflow.is_active ? <><Pause className="h-3.5 w-3.5 mr-1" /> Pauser</> : <><Play className="h-3.5 w-3.5 mr-1" /> Activer</>}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RunsOverview() {
  const { data: runs = [] } = useQuery({
    queryKey: ["all-running-runs"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("workflow_runs")
        .select("id, workflow_id, prospect_id, status, next_run_at, last_error, started_at, workflows(name), prospects(first_name, last_name, company)")
        .in("status", ["running", "errored"])
        .order("next_run_at", { ascending: true })
        .limit(10);
      return data || [];
    },
  });

  if (runs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Prochaines exécutions ({runs.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {runs.map((r: any) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {r.status === "errored" && <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
                <span className="font-medium truncate">
                  <Link to="/prospects/$id" params={{ id: r.prospect_id }} className="hover:underline">
                    {r.prospects?.first_name} {r.prospects?.last_name}
                  </Link>
                  {r.prospects?.company && <span className="text-muted-foreground"> · {r.prospects.company}</span>}
                </span>
                <span className="text-xs text-muted-foreground truncate">→ {r.workflows?.name}</span>
              </div>
              <div className="text-xs text-muted-foreground flex-shrink-0">
                {r.status === "errored" ? (
                  <span className="text-destructive">⚠ {r.last_error?.slice(0, 40) || "Erreur"}</span>
                ) : r.next_run_at ? (
                  formatDistanceToNow(new Date(r.next_run_at), { addSuffix: true, locale: fr })
                ) : (
                  "–"
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CreateWorkflowDialog({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) { toast.error("Nom obligatoire"); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("workflows")
      .insert({ owner_id: user!.id, name: name.trim(), description: description.trim() || null })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message || "Erreur"); return; }
    onCreated(data.id);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau workflow</DialogTitle>
          <DialogDescription>Donnez-lui un nom — vous ajouterez les étapes ensuite.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Séquence prospection froide" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optionnel)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={create} disabled={saving}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ÉDITEUR DE WORKFLOW ───
function WorkflowEditor({ workflowId, onClose }: { workflowId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: workflow } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflows").select("*").eq("id", workflowId).single();
      if (error) throw error;
      return data as Workflow;
    },
  });

  const { data: steps = [] } = useQuery({
    queryKey: ["workflow-steps", workflowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("position");
      if (error) throw error;
      return (data || []) as Step[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates-for-workflow"],
    queryFn: async () => {
      const { data } = await supabase.from("email_templates").select("id, name").order("name");
      return data || [];
    },
  });

  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [addingStep, setAddingStep] = useState(false);

  const reorder = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const idx = steps.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= steps.length) return;
      const a = steps[idx], b = steps[swapIdx];
      await Promise.all([
        supabase.from("workflow_steps").update({ position: b.position }).eq("id", a.id),
        supabase.from("workflow_steps").update({ position: a.position }).eq("id", b.id),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflow-steps", workflowId] }),
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workflow_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Étape supprimée");
      qc.invalidateQueries({ queryKey: ["workflow-steps", workflowId] });
    },
  });

  if (!workflow) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground mb-1">
            ← Retour
          </button>
          <h1 className="text-2xl font-bold">{workflow.name}</h1>
          {workflow.description && (
            <p className="text-sm text-muted-foreground mt-1">{workflow.description}</p>
          )}
        </div>
        <EnrollProspectDialog workflowId={workflowId} />
      </div>

      {/* Réglages */}
      <WorkflowSettings workflow={workflow} />

      {/* Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Séquence ({steps.length} étape{steps.length > 1 ? "s" : ""})</span>
            <Button size="sm" onClick={() => setAddingStep(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Aucune étape — commencez par ajouter un premier email.
            </p>
          ) : (
            <ol className="space-y-2">
              {steps.map((s, i) => {
                const meta = KIND_META[s.kind];
                const Icon = meta.icon;
                const templateName = templates.find((t) => t.id === s.template_id)?.name;
                return (
                  <li key={s.id} className="flex items-center gap-3 p-3 rounded-md border bg-card">
                    <div className={`size-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground">#{i + 1}</span>
                        <span className="text-sm font-medium">{meta.label}</span>
                        {s.delay_days > 0 && (
                          <span className="text-[10px] uppercase font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            +{s.delay_days}j
                          </span>
                        )}
                        {i === 0 && s.delay_days === 0 && (
                          <span className="text-[10px] uppercase font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            Immédiat
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {s.kind === "email"
                          ? templateName ? `Template : ${templateName}` : s.subject || "(sans sujet)"
                          : s.body?.slice(0, 80) || "(vide)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => reorder.mutate({ id: s.id, direction: "up" })}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={i === steps.length - 1} onClick={() => reorder.mutate({ id: s.id, direction: "down" })}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingStep(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("Supprimer cette étape ?")) deleteStep.mutate(s.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {(editingStep || addingStep) && (
        <StepEditor
          workflowId={workflowId}
          step={editingStep}
          nextPosition={steps.length > 0 ? Math.max(...steps.map((s) => s.position)) + 1 : 1}
          templates={templates as any[]}
          onClose={() => { setEditingStep(null); setAddingStep(false); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["workflow-steps", workflowId] })}
        />
      )}
    </div>
  );
}

function WorkflowSettings({ workflow }: { workflow: Workflow }) {
  const qc = useQueryClient();
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description || "");
  const [isActive, setIsActive] = useState(workflow.is_active);
  const [trigger, setTrigger] = useState(workflow.trigger_type);
  const [triggerStatus, setTriggerStatus] = useState<"nouveau" | "en_cours" | "interesse" | "a_relancer">((workflow.trigger_status as any) || "nouveau");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workflows")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          is_active: isActive,
          trigger_type: trigger,
          trigger_status: trigger === "on_status" ? triggerStatus : null,
        })
        .eq("id", workflow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Workflow mis à jour");
      qc.invalidateQueries({ queryKey: ["workflow", workflow.id] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Réglages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Déclenchement</Label>
            <Select value={trigger} onValueChange={(v) => setTrigger(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manuel (j'enrôle moi-même)</SelectItem>
                <SelectItem value="on_status">Auto à un changement de statut</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {trigger === "on_status" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Déclencher quand le prospect passe à</Label>
            <Select value={triggerStatus} onValueChange={(v) => setTriggerStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nouveau">Nouveau</SelectItem>
                <SelectItem value="en_cours">En cours</SelectItem>
                <SelectItem value="interesse">Intéressé</SelectItem>
                <SelectItem value="a_relancer">À relancer</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              ⚠ Pour l'instant, l'enrôlement automatique sur changement de statut n'est pas encore implémenté côté serveur.
              Utilisez le mode manuel pour démarrer.
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Workflow actif</span>
        </label>
        <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">Enregistrer</Button>
      </CardContent>
    </Card>
  );
}

function StepEditor({
  workflowId, step, nextPosition, templates, onClose, onSaved,
}: {
  workflowId: string;
  step: Step | null;
  nextPosition: number;
  templates: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<Step["kind"]>(step?.kind || "email");
  const [delayDays, setDelayDays] = useState(String(step?.delay_days ?? 0));
  const [templateId, setTemplateId] = useState(step?.template_id || "");
  const [subject, setSubject] = useState(step?.subject || "");
  const [body, setBody] = useState(step?.body || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const payload = {
      workflow_id: workflowId,
      kind,
      delay_days: Number(delayDays) || 0,
      template_id: kind === "email" && templateId ? templateId : null,
      subject: subject.trim() || null,
      body: body.trim() || null,
    };
    setSaving(true);
    if (step) {
      const { error } = await supabase.from("workflow_steps").update(payload).eq("id", step.id);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Étape mise à jour");
    } else {
      const { error } = await supabase.from("workflow_steps").insert({ ...payload, position: nextPosition });
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Étape ajoutée");
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{step ? "Modifier" : "Ajouter"} une étape</DialogTitle>
          <DialogDescription>
            Choisissez le type d'action et le délai depuis l'étape précédente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">📧 Envoyer un email</SelectItem>
                  <SelectItem value="linkedin_task">💼 Créer tâche LinkedIn</SelectItem>
                  <SelectItem value="note">📝 Créer une note interne</SelectItem>
                  <SelectItem value="wait">⏳ Attendre (rien faire)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Délai depuis étape précédente (jours)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={delayDays}
                onChange={(e) => setDelayDays(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">0 = immédiat. 3 = 3 jours après. 0.04 ≈ 1h.</p>
            </div>
          </div>

          {kind === "email" && (
            <>
              <div className="space-y-1.5">
                <Label>Template (recommandé)</Label>
                <Select value={templateId || "none"} onValueChange={(v) => setTemplateId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Choisir un template" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Pas de template (saisir ci-dessous) —</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!templateId && (
                <>
                  <div className="space-y-1.5">
                    <Label>Objet</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Bonjour {{prenom}}" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Corps</Label>
                    <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Bonjour {{prenom}}, …" />
                  </div>
                </>
              )}
            </>
          )}

          {(kind === "note" || kind === "linkedin_task") && (
            <div className="space-y-1.5">
              <Label>Contenu de la {kind === "note" ? "note" : "tâche"}</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder={kind === "linkedin_task"
                ? "Envoyer un message LinkedIn personnalisé à {{prenom}}"
                : "Rappel : appeler {{prenom}} pour faire le point"} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrollProspectDialog({ workflowId }: { workflowId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prospectId, setProspectId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: prospects = [] } = useQuery({
    queryKey: ["prospects-for-enroll"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company")
        .order("first_name");
      return data || [];
    },
  });

  const { data: steps = [] } = useQuery({
    queryKey: ["workflow-steps", workflowId],
    queryFn: async () => {
      const { data } = await supabase
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("position");
      return (data || []) as Step[];
    },
  });

  const enroll = async () => {
    if (!prospectId) { toast.error("Choisis un prospect"); return; }
    if (steps.length === 0) { toast.error("Workflow sans étape — ajoute des étapes d'abord"); return; }
    const firstStep = steps[0];
    const delayMs = Math.max(0, Number(firstStep.delay_days) * 86_400_000);
    setSaving(true);
    const { error } = await supabase.from("workflow_runs").insert({
      workflow_id: workflowId,
      prospect_id: prospectId,
      owner_id: user!.id,
      status: "running",
      current_step_id: firstStep.id,
      next_run_at: new Date(Date.now() + delayMs).toISOString(),
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce prospect est déjà enrôlé dans ce workflow");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Prospect enrôlé — la séquence va démarrer");
    setProspectId("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["all-running-runs"] });
    qc.invalidateQueries({ queryKey: ["workflow-run-counts"] });
  };

  const triggerNow = async () => {
    const { error } = await supabase.functions.invoke("workflow-tick");
    if (error) toast.error(error.message);
    else toast.success("Tick lancé — recharge dans quelques secondes");
    qc.invalidateQueries({ queryKey: ["all-running-runs"] });
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={triggerNow}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tick maintenant
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Enrôler un prospect
        </Button>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enrôler un prospect</DialogTitle>
            <DialogDescription>La séquence démarrera immédiatement (ou avec le délai de la 1re étape).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={prospectId} onValueChange={setProspectId}>
              <SelectTrigger><SelectValue placeholder="Choisir un prospect" /></SelectTrigger>
              <SelectContent>
                {prospects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}{p.company ? ` · ${p.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={enroll} disabled={saving}>Enrôler</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
