import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
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
import { Plus, Pencil, Trash2, Mail, Sparkles, Eye, Users, User, Wand2, Brain, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AVAILABLE_VARS, renderTemplate } from "@/lib/render-template";
import { EmailGeneratorForProspect } from "@/components/email-generator-for-prospect";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
  head: () => ({ meta: [{ title: "Génération d'emails — Wyngo Workspace" }] }),
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
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [seedFromAI, setSeedFromAI] = useState<{ name: string; subject: string; body: string; category: string } | null>(null);

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
            Génération d'emails
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centre de génération d'emails pour ton équipe : IA personnalisée par prospect, templates réutilisables.
            Chaque envoi est automatiquement loggé dans le suivi de la fiche prospect.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" onClick={() => setAiOpen(true)} className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white">
            <Wand2 className="h-4 w-4 mr-1.5" />
            Générer avec l'IA
          </Button>
          <Button variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Manuel
          </Button>
        </div>
      </div>

      {/* ═══ GÉNÉRATEUR EMAIL IA POUR UN PROSPECT — section centrale ═══
          Picker prospect + flux PitchGeneratorDialog. L'email envoyé est
          loggé automatiquement dans la fiche prospect (table messages
          via gmail-send). C'est LE point d'entrée unique pour rédiger un
          cold email IA — la fiche prospect ne sert plus qu'au SUIVI. */}
      <EmailGeneratorForProspect />

      {/* Contexte IA — bloc pliable */}
      <AIContextCard
        open={aiContextOpen}
        onToggle={() => setAiContextOpen((v) => !v)}
        isAdmin={role === "admin"}
      />

      {/* Le bloc "Variables disponibles" a été retiré du haut de page :
          il polluait visuellement la nouvelle page "Génération d'emails"
          alors qu'il n'est utile QUE pendant l'édition d'un template
          (où les variables apparaissent déjà — voir l'éditeur lignes ~666). */}

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
      {(creating || editing || seedFromAI) && (
        <TemplateEditor
          template={editing}
          seed={seedFromAI}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            setSeedFromAI(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["templates"] })}
        />
      )}

      {/* Dialog IA */}
      {aiOpen && (
        <AIGenerateDialog
          onClose={() => setAiOpen(false)}
          onGenerated={(result) => {
            setAiOpen(false);
            setSeedFromAI(result);
          }}
          onOpenContext={() => {
            setAiOpen(false);
            setAiContextOpen(true);
          }}
        />
      )}
    </div>
  );
}

// ─── Bloc "Contexte IA" : ce que l'agence renseigne UNE FOIS ───
function AIContextCard({ open, onToggle, isAdmin }: { open: boolean; onToggle: () => void; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: agency } = useQuery({
    queryKey: ["agency-settings-ai"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agency_settings")
        .select("name, activity, business_brief, target_client, value_props, default_tone")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  const [activity, setActivity] = useState("");
  const [brief, setBrief] = useState("");
  const [target, setTarget] = useState("");
  const [props, setProps] = useState("");
  const [tone, setTone] = useState("professionnel");
  const [saving, setSaving] = useState(false);

  // Hydrate quand les données arrivent
  useEffect(() => {
    if (agency) {
      setActivity(agency.activity || "");
      setBrief(agency.business_brief || "");
      setTarget(agency.target_client || "");
      setProps(agency.value_props || "");
      setTone(agency.default_tone || "professionnel");
    }
  }, [agency]);

  const save = async () => {
    if (!isAdmin) {
      toast.error("Seul un admin peut modifier le contexte IA partagé");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("agency_settings")
      .update({
        activity: activity.trim() || null,
        business_brief: brief.trim() || null,
        target_client: target.trim() || null,
        value_props: props.trim() || null,
        default_tone: tone,
      })
      .eq("id", true);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Contexte IA mis à jour");
    qc.invalidateQueries({ queryKey: ["agency-settings-ai"] });
  };

  const isConfigured = !!(agency?.business_brief && agency?.target_client);

  return (
    <Card className={isConfigured ? "" : "border-violet-300 bg-violet-50/50 dark:bg-violet-950/20"}>
      <CardHeader className="pb-3">
        <button
          onClick={onToggle}
          className="w-full flex items-start justify-between gap-3 text-left"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white flex-shrink-0">
              <Brain className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                Contexte IA
                {isConfigured ? (
                  <span className="text-[10px] uppercase font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 px-1.5 py-0.5 rounded">Configuré</span>
                ) : (
                  <span className="text-[10px] uppercase font-medium text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-400 px-1.5 py-0.5 rounded">À configurer</span>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Ce que l'IA sait de ton activité. Renseigne-le une seule fois — utilisé pour chaque génération.
                {!isAdmin && <span className="block mt-1 text-muted-foreground">Lecture seule (admin uniquement)</span>}
              </CardDescription>
            </div>
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">{open ? "Replier" : "Déplier"} ↓</span>
        </button>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Activité (1 ligne)</Label>
            <Input
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="Ex : Agence de création de sites web pour cabinets médicaux"
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description détaillée de votre activité</Label>
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder="Décrivez en 4-5 phrases ce que vous faites, votre méthode, vos résultats typiques. L'IA s'en servira pour rédiger des emails crédibles."
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Client cible / ICP (Ideal Customer Profile)</Label>
            <Textarea
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              rows={2}
              placeholder="Ex : Médecins libéraux (généralistes, kinés, ostéopathes) installés en cabinet, sans site web ou avec un site obsolète."
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Propositions de valeur (1 par ligne)</Label>
            <Textarea
              value={props}
              onChange={(e) => setProps(e.target.value)}
              rows={3}
              placeholder={"- Livraison en 14 jours\n- Site sur mesure, pas un template\n- Optimisé pour la prise de RDV en ligne"}
              disabled={!isAdmin}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Ton par défaut</Label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              disabled={!isAdmin}
            >
              <option value="professionnel">Professionnel</option>
              <option value="chaleureux">Chaleureux</option>
              <option value="direct">Direct</option>
              <option value="consultatif">Consultatif (expert)</option>
            </select>
          </div>

          {isAdmin && (
            <Button onClick={save} disabled={saving} size="sm">
              <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Enregistrement…" : "Enregistrer le contexte"}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Dialog : générer un template via IA ───
function AIGenerateDialog({
  onClose,
  onGenerated,
  onOpenContext,
}: {
  onClose: () => void;
  onGenerated: (result: { name: string; subject: string; body: string; category: string }) => void;
  onOpenContext: () => void;
}) {
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState("standard");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  // Check si contexte configuré
  const { data: agency } = useQuery({
    queryKey: ["agency-settings-ai-check"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agency_settings")
        .select("business_brief, target_client")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  const contextConfigured = !!(agency?.business_brief && agency?.target_client);

  const generate = async () => {
    if (!objective.trim()) {
      toast.error("Décris l'objectif de l'email");
      return;
    }
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("template-generate", {
      body: {
        objective: objective.trim(),
        tone: tone || undefined,
        length,
        extra_notes: notes.trim() || undefined,
      },
    });
    setGenerating(false);
    if (error || data?.error) {
      // Quand la edge function renvoie 4xx/5xx, supabase-js met l'erreur dans `error`
      // et le body de réponse est dans error.context.body (un Response).
      let bodyDetails: any = data;
      try {
        // @ts-ignore
        if (!bodyDetails && error?.context?.json) bodyDetails = await error.context.json();
        // @ts-ignore
        else if (!bodyDetails && error?.context?.text) bodyDetails = JSON.parse(await error.context.text());
      } catch {}

      console.error("[template-generate] FULL response:", { data, error, bodyDetails });
      const headline = bodyDetails?.error || data?.error || error?.message || "Génération échouée";
      toast.error(headline, { duration: 12000 });
      if (bodyDetails?.details) toast.error("Détails : " + String(bodyDetails.details).slice(0, 400), { duration: 16000 });
      if (bodyDetails?.hint) toast.info(bodyDetails.hint, { duration: 12000 });
      if (bodyDetails?.model) toast.info("Modèle utilisé : " + bodyDetails.provider + " / " + bodyDetails.model, { duration: 10000 });
      return;
    }
    toast.success(`Template généré (${data.tokens_in}+${data.tokens_out} tokens, ${data.duration_ms}ms)`);
    onGenerated(data);
  };

  const SUGGESTIONS = [
    "Prise de contact à froid avec un prospect qui ne nous connaît pas",
    "Relancer un prospect qui n'a pas répondu à mon premier email (après 4 jours)",
    "Proposer un appel découverte de 15 minutes",
    "Remercier un prospect après un appel et envoyer la suite",
    "Réveiller un prospect froid (>30 jours sans contact)",
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-violet-600" />
            Générer un template avec l'IA
          </DialogTitle>
          <DialogDescription>
            Décris l'objectif et le contexte. L'IA s'appuiera sur le contexte de ton agence pour rédiger un email pro.
          </DialogDescription>
        </DialogHeader>

        {!contextConfigured && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-xs">
            <p className="font-medium text-amber-900 dark:text-amber-200 mb-1">⚠ Contexte IA pas encore configuré</p>
            <p className="text-amber-800 dark:text-amber-300 mb-2">
              Sans contexte, l'IA va générer des templates génériques. Renseigne ton activité, ton client cible et tes propositions de valeur pour avoir des résultats vraiment pertinents.
            </p>
            <Button size="sm" variant="outline" onClick={onOpenContext}>
              Configurer maintenant
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Objectif de l'email *</Label>
            <Textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="Décris en 1-2 phrases ce que tu veux obtenir avec cet email."
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setObjective(s)}
                  className="text-[10px] px-2 py-1 rounded border bg-muted/40 hover:bg-muted"
                >
                  {s.length > 40 ? s.slice(0, 40) + "…" : s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ton (optionnel)</Label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Défaut de l'agence</option>
                <option value="professionnel">Professionnel</option>
                <option value="chaleureux">Chaleureux</option>
                <option value="direct">Direct</option>
                <option value="consultatif">Consultatif (expert)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Longueur</Label>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="court">Court (80-120 mots)</option>
                <option value="standard">Standard (120-180 mots)</option>
                <option value="long">Long (180-280 mots)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Contraintes ou détails supplémentaires (optionnel)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ex : Ne pas mentionner le prix. Insister sur la rapidité de livraison."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={generate} disabled={generating} className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Génération…</>
            ) : (
              <><Wand2 className="h-4 w-4 mr-1.5" /> Générer</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({
  template,
  seed,
  onClose,
  onSaved,
}: {
  template: Template | null;
  seed?: { name: string; subject: string; body: string; category: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(template?.name || seed?.name || "");
  const [subject, setSubject] = useState(template?.subject || seed?.subject || "");
  const [body, setBody] = useState(template?.body || seed?.body || "");
  const [category, setCategory] = useState(template?.category || seed?.category || "prospection");
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
