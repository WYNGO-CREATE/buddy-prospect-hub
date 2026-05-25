import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Phone, Plus, Pencil, Trash2, Sparkles, MessageSquareWarning, Users, User, Download } from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_VARS } from "@/lib/render-template";
import { REFERENCE_CALL_SCRIPT, REFERENCE_OBJECTIONS } from "@/lib/call-scripts-seed";

export const Route = createFileRoute("/_authenticated/scripts")({
  component: ScriptsPage,
  head: () => ({ meta: [{ title: "Scripts d'appel — Wyngo Workspace" }] }),
});

type CallScript = {
  id: string;
  owner_id: string;
  kind: "script" | "objection";
  title: string;
  content: string;
  category: string | null;
  is_shared: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

const SCRIPT_CATEGORIES = [
  { id: "prise_contact", label: "Prise de contact" },
  { id: "qualification", label: "Qualification" },
  { id: "closing",       label: "Closing" },
  { id: "voicemail",     label: "Voicemail" },
  { id: "autre",         label: "Autre" },
];

const OBJECTION_CATEGORIES = [
  { id: "prix",       label: "Prix" },
  { id: "timing",     label: "Timing" },
  { id: "decideur",   label: "Décideur" },
  { id: "concurrent", label: "Concurrent" },
  { id: "esquive",    label: "Esquive" },
  { id: "voicemail",  label: "Voicemail" },
  { id: "autre",      label: "Autre" },
];

function ScriptsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"script" | "objection">("script");
  const [editing, setEditing] = useState<CallScript | null>(null);
  const [creating, setCreating] = useState<"script" | "objection" | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: scripts = [], isLoading } = useQuery({
    queryKey: ["call-scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_scripts")
        .select("*")
        .order("kind")
        .order("category")
        .order("position");
      if (error) throw error;
      return (data || []) as CallScript[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("call_scripts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Élément supprimé");
      qc.invalidateQueries({ queryKey: ["call-scripts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const importReference = async () => {
    if (!user) return;
    setImporting(true);
    const rows = [REFERENCE_CALL_SCRIPT, ...REFERENCE_OBJECTIONS].map((s, i) => ({
      owner_id: user.id,
      kind: s.kind,
      title: s.title,
      content: s.content,
      category: s.category,
      is_shared: false,
      position: i,
    }));
    const { error } = await supabase.from("call_scripts").insert(rows);
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Script de référence + 7 objections importés");
    qc.invalidateQueries({ queryKey: ["call-scripts"] });
  };

  const filtered = scripts.filter((s) => s.kind === tab);
  const cats = tab === "script" ? SCRIPT_CATEGORIES : OBJECTION_CATEGORIES;

  // Group by category
  const grouped: Record<string, CallScript[]> = {};
  filtered.forEach((s) => {
    const c = s.category || "autre";
    if (!grouped[c]) grouped[c] = [];
    grouped[c].push(s);
  });

  const isEmpty = scripts.length === 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6 text-primary" />
            Scripts d'appel & objections
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vos scripts d'ouverture et la banque de réponses aux objections — utilisables en direct depuis la fiche d'un prospect (bouton <strong>Mode appel</strong>).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isEmpty && (
            <Button
              variant="default"
              onClick={importReference}
              disabled={importing}
              className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white"
            >
              <Download className="h-4 w-4 mr-1.5" />
              {importing ? "Import…" : "Importer le script de référence"}
            </Button>
          )}
          <Button variant="outline" onClick={() => setCreating(tab)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nouveau {tab === "script" ? "script" : "objection"}
          </Button>
        </div>
      </div>

      {/* Variables dispo */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">VARIABLES DISPONIBLES EN MODE APPEL</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_VARS.map((v) => (
              <code
                key={v.key}
                className="text-xs bg-background border px-2 py-1 rounded font-mono"
                title={v.label}
              >
                {`{{${v.key}}}`}
              </code>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Au démarrage du Mode appel, ces variables sont remplacées par les vraies infos du prospect (prénom, entreprise, etc.).
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="inline-flex rounded-md border bg-card overflow-hidden">
        <button
          onClick={() => setTab("script")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition ${
            tab === "script"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Scripts d'ouverture
          <span className="text-[10px] bg-background/40 px-1.5 py-0.5 rounded">{scripts.filter((s) => s.kind === "script").length}</span>
        </button>
        <button
          onClick={() => setTab("objection")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition ${
            tab === "objection"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <MessageSquareWarning className="h-3.5 w-3.5" />
          Banque d'objections
          <span className="text-[10px] bg-background/40 px-1.5 py-0.5 rounded">{scripts.filter((s) => s.kind === "objection").length}</span>
        </button>
      </div>

      {/* Empty state */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            {tab === "script" ? (
              <Sparkles className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            ) : (
              <MessageSquareWarning className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            )}
            <p className="text-sm font-medium">
              {tab === "script"
                ? "Aucun script d'appel"
                : "Aucune objection enregistrée"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              {isEmpty
                ? "Démarrez en important le script de référence (méthode Wyngo + 7 objections classiques)."
                : `Créez votre premier ${tab === "script" ? "script" : "réponse à une objection"}.`}
            </p>
            {isEmpty ? (
              <Button onClick={importReference} disabled={importing} size="sm">
                <Download className="h-4 w-4 mr-1.5" /> Importer le script de référence
              </Button>
            ) : (
              <Button onClick={() => setCreating(tab)} size="sm">
                <Plus className="h-4 w-4 mr-1.5" /> Créer
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        // Liste groupée par catégorie
        <div className="space-y-6">
          {cats.map((cat) => {
            const items = grouped[cat.id] || [];
            if (items.length === 0) return null;
            return (
              <div key={cat.id}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {cat.label} <span className="text-muted-foreground/60">({items.length})</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((s) => (
                    <ScriptCard
                      key={s.id}
                      script={s}
                      isOwner={s.owner_id === user?.id}
                      onEdit={() => setEditing(s)}
                      onDelete={() => {
                        if (confirm(`Supprimer « ${s.title} » ?`)) deleteMut.mutate(s.id);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {/* Catégorie "autre" sans label si rien d'autre */}
          {grouped["autre"] && cats.find((c) => c.id === "autre") === undefined && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Autre</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {grouped["autre"].map((s) => (
                  <ScriptCard
                    key={s.id}
                    script={s}
                    isOwner={s.owner_id === user?.id}
                    onEdit={() => setEditing(s)}
                    onDelete={() => deleteMut.mutate(s.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit/Create dialog */}
      {(editing || creating) && (
        <ScriptEditor
          script={editing}
          defaultKind={creating}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["call-scripts"] })}
        />
      )}
    </div>
  );
}

function ScriptCard({
  script, isOwner, onEdit, onDelete,
}: {
  script: CallScript;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-tight">{script.title}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              {script.is_shared ? (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-primary">
                  <Users className="h-3 w-3" /> Partagé
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                  <User className="h-3 w-3" /> Privé
                </span>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed whitespace-pre-wrap">
          {script.content}
        </p>
        {isOwner && (
          <div className="flex gap-1 pt-3">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Éditer
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScriptEditor({
  script, defaultKind, onClose, onSaved,
}: {
  script: CallScript | null;
  defaultKind: "script" | "objection" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [kind, setKind] = useState<"script" | "objection">(script?.kind || defaultKind || "script");
  const [title, setTitle] = useState(script?.title || "");
  const [content, setContent] = useState(script?.content || "");
  const [category, setCategory] = useState(script?.category || (kind === "script" ? "prise_contact" : "prix"));
  const [isShared, setIsShared] = useState(script?.is_shared || false);
  const [saving, setSaving] = useState(false);

  const cats = kind === "script" ? SCRIPT_CATEGORIES : OBJECTION_CATEGORIES;

  const insertVar = (key: string) => setContent((c) => c + `{{${key}}}`);

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Titre et contenu obligatoires");
      return;
    }
    setSaving(true);
    if (script) {
      const { error } = await supabase
        .from("call_scripts")
        .update({
          kind, title: title.trim(), content: content.trim(),
          category, is_shared: isShared,
        })
        .eq("id", script.id);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Mis à jour");
    } else {
      const { error } = await supabase.from("call_scripts").insert({
        owner_id: user!.id, kind, title: title.trim(), content: content.trim(),
        category, is_shared: isShared,
      });
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Créé");
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {script ? "Modifier" : "Nouveau"} {kind === "script" ? "script d'appel" : "objection"}
          </DialogTitle>
          <DialogDescription>
            {kind === "script"
              ? "Un script affiché au commercial pendant l'appel."
              : "Une réponse-clef à servir quand le prospect oppose une résistance."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="script">Script d'ouverture</option>
                <option value="objection">Réponse à une objection</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Catégorie</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{kind === "script" ? "Nom du script" : "Phrase de l'objection"}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "script"
                ? "Ex : Appel à froid — premier contact"
                : "Ex : « C'est trop cher »"}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{kind === "script" ? "Texte du script" : "Réponse à donner"}</Label>
              <div className="flex flex-wrap gap-1">
                {AVAILABLE_VARS.slice(0, 4).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 hover:bg-muted font-mono"
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={kind === "script" ? 14 : 6}
              className="font-mono text-sm leading-relaxed"
              placeholder={kind === "script"
                ? `Bonjour {{prenom}}, c'est {{expediteur}}…`
                : `Réponse claire et directe…`}
            />
            <p className="text-[11px] text-muted-foreground">
              Les variables seront remplacées automatiquement en Mode appel avec les infos du prospect.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
            <span className="text-sm">Partager avec toute l'équipe (lecture seule pour les autres)</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
