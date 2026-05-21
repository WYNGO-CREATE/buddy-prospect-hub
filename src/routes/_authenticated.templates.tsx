import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Mail, Sparkles, Eye, Users, User } from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_VARS, renderTemplate } from "@/lib/render-template";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
  head: () => ({ meta: [{ title: "Templates — Wyngo Workspace" }] }),
});

type Template = {
  id: string;
  owner_id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
};

const CATEGORIES = [
  { id: "prospection", label: "Prospection" },
  { id: "relance", label: "Relance" },
  { id: "rdv", label: "Prise de RDV" },
  { id: "remerciement", label: "Remerciement" },
  { id: "autre", label: "Autre" },
];

function TemplatesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Template[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template supprimé");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Templates d'emails
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vos modèles réutilisables avec variables{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{`{{prenom}}`}</code>{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{`{{entreprise}}`}</code>{" "}
            — utilisables dans l'Inbox et les Workflows.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau template
        </Button>
      </div>

      {/* Variables disponibles */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">VARIABLES DISPONIBLES</p>
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
        </CardContent>
      </Card>

      {/* Liste */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Mail className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">Aucun template</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Créez votre premier modèle réutilisable.
            </p>
            <Button onClick={() => setCreating(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> Nouveau template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="hover:shadow-md transition">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{t.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      {t.is_shared ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-primary">
                          <Users className="h-3 w-3" /> Partagé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                          <User className="h-3 w-3" /> Privé
                        </span>
                      )}
                      {t.category && (
                        <span className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">
                          · {CATEGORIES.find((c) => c.id === t.category)?.label || t.category}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs font-medium truncate">{t.subject}</p>
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{t.body}</p>
                <div className="flex gap-1 pt-2">
                  {t.owner_id === user?.id && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Éditer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Supprimer le template "${t.name}" ?`)) deleteMut.mutate(t.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog création / édition */}
      {(creating || editing) && (
        <TemplateEditor
          template={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["templates"] })}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(template?.name || "");
  const [subject, setSubject] = useState(template?.subject || "");
  const [body, setBody] = useState(template?.body || "");
  const [category, setCategory] = useState(template?.category || "prospection");
  const [isShared, setIsShared] = useState(template?.is_shared || false);
  const [saving, setSaving] = useState(false);

  // Preview avec un prospect fictif
  const previewCtx = useMemo(() => ({
    first_name: "Marie", last_name: "Dupont", company: "ACME SAS",
    email: "marie@acme.fr", sender_name: "Vous", agency_name: "Wyngo",
  }), []);

  const save = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast.error("Tous les champs sont obligatoires");
      return;
    }
    setSaving(true);
    if (template) {
      const { error } = await supabase
        .from("email_templates")
        .update({ name: name.trim(), subject: subject.trim(), body: body.trim(), category, is_shared: isShared })
        .eq("id", template.id);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Template mis à jour");
    } else {
      const { error } = await supabase.from("email_templates").insert({
        owner_id: user!.id,
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
        category,
        is_shared: isShared,
      });
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Template créé");
    }
    onSaved();
    onClose();
  };

  const insertVar = (key: string, target: "subject" | "body") => {
    if (target === "subject") setSubject((s) => s + `{{${key}}}`);
    else setBody((b) => b + `{{${key}}}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Modifier" : "Nouveau"} template</DialogTitle>
          <DialogDescription>
            Utilisez les variables pour personnaliser. La preview s'affiche en bas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nom interne</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Prospection J0" />
            </div>
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Objet</Label>
              <div className="flex gap-1">
                {AVAILABLE_VARS.slice(0, 3).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key, "subject")}
                    className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 hover:bg-muted font-mono"
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex : Bonjour {{prenom}}" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Corps du message</Label>
              <div className="flex flex-wrap gap-1">
                {AVAILABLE_VARS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key, "body")}
                    className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/50 hover:bg-muted font-mono"
                  >
                    {`{{${v.key}}}`}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={`Bonjour {{prenom}},\n\nJ'espère que vous allez bien...`}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
            />
            <span className="text-sm">Partager avec toute l'équipe (lecture seule pour les autres)</span>
          </label>

          {/* Preview */}
          {(subject || body) && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" /> Aperçu (avec Marie Dupont, ACME SAS)
              </p>
              <p className="text-sm font-medium">{renderTemplate(subject, previewCtx)}</p>
              <p className="text-xs whitespace-pre-wrap text-foreground/80">{renderTemplate(body, previewCtx)}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
