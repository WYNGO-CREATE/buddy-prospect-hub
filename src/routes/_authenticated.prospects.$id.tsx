import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, PhoneCall, CalendarClock, History, Check, MessageSquare, Trash2, UserCog, Headphones, Globe, ExternalLink, Sparkles, Wand2 } from "lucide-react";
// CallModeDrawer déplacé : Mode appel centralisé sur /scripts (CallLauncherForProspect)
// PitchGeneratorDialog déplacé vers la page "Génération d'emails" (centralisé)
import { InstantPreviewDialog } from "@/components/instant-preview-dialog";
import { PreviewBriefCard } from "@/components/preview-brief-card";
import { ProspectBriefingCard } from "@/components/prospect-briefing-card";
import { ProspectEmailCard } from "@/components/prospect-email-card";
import { CallDebrief } from "@/components/call-debrief";
import { CallPrep } from "@/components/call-prep";
import { PostcardSender } from "@/components/postcard-sender";
import { ProspectEnrichButton } from "@/components/prospect-enrich-button";
import { ProspectPhoneCard } from "@/components/prospect-phone-card";
import { findTradeByNaf } from "@/lib/trades-catalog";
import { Briefcase } from "lucide-react";
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
  const { user, role } = useAuth();
  const [editing, setEditing] = useState(false);
  // Onglet actif sur la section Activité (contrôlé pour la nav rapide depuis le haut de page)
  const [activeTab, setActiveTab] = useState<"comments" | "calls" | "followups" | "history">("comments");
  const [followOpen, setFollowOpen] = useState(false);
  const [comment, setComment] = useState("");

  const { data: prospect, isLoading } = useQuery({
    queryKey: ["prospect", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("prospects").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email")).data || [],
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

  const { data: comments } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("prospect_comments").select("*").eq("prospect_id", id).order("created_at", { ascending: true });
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

  const reassign = useMutation({
    mutationFn: async (newOwner: string) => {
      const { error } = await supabase.from("prospects").update({ owner_id: newOwner }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect", id] });
      toast.success("Prospect réassigné");
    },
    onError: (e: Error) => toast.error(e.message),
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
        website: z.string().trim().max(255).optional().or(z.literal("")),
        source: z.string().trim().max(80).optional().or(z.literal("")),
        notes: z.string().trim().max(2000).optional().or(z.literal("")),
        tags: z.string().trim().max(500).optional().or(z.literal("")),
        next_action: z.string().trim().max(255).optional().or(z.literal("")),
        next_action_at: z.string().optional().or(z.literal("")),
      });
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const tags = parsed.data.tags ? parsed.data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
      const payload: any = {
        ...parsed.data,
        tags,
        next_action_at: parsed.data.next_action_at ? new Date(parsed.data.next_action_at).toISOString() : null,
      };
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

  // Le débrief d'appel (texte + vocal + IA + coaching) est encapsulé dans
  // le composant <CallDebrief> — voir src/components/call-debrief.tsx.

  // Toggle rapide "appelé" / "pas appelé" pour le badge du header.
  // S'il y a au moins 1 appel logué → on supprime tout (revient à "non appelé").
  // Sinon → on crée une trace minimale.
  const hasBeenCalled = !!(calls && calls.length > 0);
  const lastCalledAt = calls && calls.length > 0 ? calls[0].called_at : null;
  const toggleCalled = useMutation({
    mutationFn: async () => {
      if (hasBeenCalled) {
        const { error } = await supabase.from("call_logs").delete().eq("prospect_id", id);
        if (error) throw error;
        return "uncalled";
      } else {
        const { error } = await supabase.from("call_logs").insert({
          prospect_id: id,
          owner_id: user!.id,
          called_at: new Date().toISOString(),
          outcome: "logged_quick",
        });
        if (error) throw error;
        return "called";
      }
    },
    onSuccess: (action) => {
      qc.invalidateQueries({ queryKey: ["calls", id] });
      qc.invalidateQueries({ queryKey: ["all-calls-list"] });
      qc.invalidateQueries({ queryKey: ["last-contacts-list"] });
      toast.success(action === "called" ? "Marqué comme appelé ✓" : "Marqué comme non appelé");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addFollowUp = useMutation({
    mutationFn: async (form: FormData) => {
      const raw = Object.fromEntries(form.entries());
      if (!raw.scheduled_at) throw new Error("Date requise");
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

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Commentaire vide");
      if (trimmed.length > 4000) throw new Error("Commentaire trop long");
      const { error } = await supabase.from("prospect_comments").insert({
        prospect_id: id, author_id: user!.id, body: trimmed,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", id] });
      setComment("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteComment = useMutation({
    mutationFn: async (cid: string) => {
      const { error } = await supabase.from("prospect_comments").delete().eq("id", cid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!prospect) return <p>Prospect introuvable.</p>;

  const profileName = (uid: string) => {
    const p = profiles?.find((x) => x.id === uid);
    return p?.full_name || p?.email || uid.slice(0, 8);
  };

  const statusEvents = (events || []).filter((e) => e.event_type === "status_changed" || e.event_type === "created");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/prospects"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{prospect.first_name} {prospect.last_name}</h1>
              {/* Badge cliquable « Appelé / Pas appelé » — toujours visible dans le header */}
              <button
                type="button"
                onClick={() => {
                  if (hasBeenCalled) {
                    if (!confirm("Annuler le marquage 'appelé' pour ce prospect ?")) return;
                  }
                  toggleCalled.mutate();
                }}
                disabled={toggleCalled.isPending}
                title={hasBeenCalled
                  ? (lastCalledAt ? `Dernier appel : ${format(new Date(lastCalledAt), "PPp", { locale: fr })} — cliquer pour annuler` : "Cliquer pour annuler")
                  : "Cliquer pour marquer comme appelé"}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition cursor-pointer",
                  hasBeenCalled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 dark:hover:bg-emerald-950/60"
                    : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900 dark:hover:bg-rose-950/60"
                )}
              >
                <PhoneCall className="h-3.5 w-3.5" />
                {hasBeenCalled ? "Appelé" : "Pas encore appelé"}
              </button>
            </div>
            {prospect.company && <p className="text-muted-foreground mt-1">{prospect.company}</p>}
            <p className="text-xs text-muted-foreground mt-1">Géré par {profileName(prospect.owner_id)}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {/* Enrichir : récupère Google + site + email + brief (utile pour un
              prospect ajouté à la main qui arrive "vide"). */}
          <ProspectEnrichButton prospectId={prospect.id} company={prospect.company} location={(prospect as { location?: string | null }).location} />
          {/* Le Mode appel est désormais centralisé sur la page "Scripts d'appel".
              Voir CallLauncherForProspect — flux : sélectionne prospect → démarrer.
              On retire le bouton de la fiche prospect pour cohérence avec la
              centralisation des outils (comme on a fait pour les emails). */}
          {/* ⚡ APERÇU INSTANTANÉ : génère un vrai site web preview pour le prospect en 15s.
              Le commercial copie le lien et l'envoie par SMS pendant l'appel : effet wahou
              garanti, plus aucune objection "je vois pas ce que ça donnerait". */}
          <InstantPreviewDialog prospectId={prospect.id}>
            <Button
              variant="default"
              size="sm"
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/30"
            >
              <Wand2 className="h-4 w-4 mr-1.5" />
              Aperçu Instantané
            </Button>
          </InstantPreviewDialog>
          {/* La génération d'emails IA est désormais centralisée dans la
              page "Génération d'emails" (/templates). On retire le bouton
              de la fiche prospect pour dissocier GÉNÉRATION (page dédiée,
              qualité contrôlée) et SUIVI (cette fiche, automatique). */}
          {role === "admin" && (
            <Select value={prospect.owner_id} onValueChange={(v) => reassign.mutate(v)}>
              <SelectTrigger className="w-[180px]">
                <UserCog className="h-3.5 w-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(profiles || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
      </div>

      {/* ─── Carte BRIEFING — synthèse 3-secondes du prospect ───
          En haut de la fiche, auto-composée à partir de tout ce qu'on sait
          (activité précise, ville, note Google, statut digital, dernière
          interaction). C'est le "qui c'est, où on en est" en un coup d'œil. */}
      <ProspectBriefingCard prospect={prospect as Parameters<typeof ProspectBriefingCard>[0]["prospect"]} />

      {/* ─── Carte d'actions de contact rapides ───
          Met en avant les 3 actions clés : appeler, écrire, voir le site.
          Visible immédiatement à l'ouverture de la fiche, sans scroll. */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Téléphone — éditable (corriger un 0 manquant, etc.) */}
            <ProspectPhoneCard prospectId={prospect.id} phone={prospect.phone} />

            {/* Email — carte autonome : cliquable (mailto) seulement si
                l'email est sûr. Si "à tester"/invalide → pas de redirection. */}
            <ProspectEmailCard
              prospect={{
                id: prospect.id,
                email: prospect.email,
                company: prospect.company,
                website: prospect.website,
                first_name: prospect.first_name,
                last_name: prospect.last_name,
                city: (prospect as { city?: string | null }).city,
              }}
            />

            {/* Site web */}
            <a
              href={prospect.website || undefined}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border transition",
                prospect.website
                  ? "hover:bg-accent/50 cursor-pointer"
                  : "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="size-10 rounded-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
                <Globe className="h-5 w-5 text-violet-700 dark:text-violet-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Site web</p>
                <p className="font-semibold truncate flex items-center gap-1">
                  {prospect.website ? (
                    <>
                      {prospect.website.replace(/^https?:\/\/(www\.)?/, "")}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </>
                  ) : (
                    "Aucun site"
                  )}
                </p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* ─── Préparation d'appel IA (brief + accroche taillée) ─── */}
      <CallPrep prospectId={prospect.id} />

      {/* ─── Carte postale physique (Merci Facteur / La Poste) ─── */}
      <PostcardSender
        prospectId={prospect.id}
        company={prospect.company}
        firstName={prospect.first_name}
        location={(prospect as { location?: string | null }).location}
        phone={prospect.phone}
      />

      {/* ═══ NAV RAPIDE Activité ═══
          Raccourcis vers les 4 onglets en bas (Discussion / Appels / Relances /
          Historique). Au clic : active l'onglet ET scroll smooth vers la section.
          Évite au commercial de scroller toute la page pour trouver l'activité. */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-transparent p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Activité du prospect — accès rapide
          </p>
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "comments", label: "Discussion", icon: MessageSquare, count: comments?.length || 0, tone: "emerald" },
              { key: "calls", label: "Appels", icon: PhoneCall, count: calls?.length || 0, tone: "sky" },
              { key: "followups", label: "Relances", icon: CalendarClock, count: followUps?.length || 0, tone: "amber" },
              { key: "history", label: "Historique", icon: History, count: events?.length || 0, tone: "violet" },
            ] as const).map((nav) => {
              const Icon = nav.icon;
              return (
                <button
                  key={nav.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(nav.key as typeof activeTab);
                    setTimeout(() => {
                      document.getElementById("prospect-activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 50);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition border",
                    activeTab === nav.key
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card hover:bg-muted border-border text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {nav.label}
                  {nav.count > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                      activeTab === nav.key
                        ? "bg-primary-foreground/20"
                        : "bg-muted text-foreground",
                    )}>
                      {nav.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
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
              <div className="space-y-2"><Label>Site web</Label><Input name="website" defaultValue={prospect.website || ""} /></div>
              <div className="space-y-2"><Label>Source</Label><Input name="source" defaultValue={prospect.source || ""} /></div>
              <div className="space-y-2">
                <Label>Étiquettes (séparées par virgule)</Label>
                <Input name="tags" defaultValue={(prospect.tags || []).join(", ")} placeholder="VIP, Salon Paris…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Prochaine action</Label><Input name="next_action" defaultValue={prospect.next_action || ""} /></div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    name="next_action_at"
                    type="datetime-local"
                    defaultValue={prospect.next_action_at ? new Date(prospect.next_action_at).toISOString().slice(0, 16) : ""}
                  />
                </div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Textarea name="notes" rows={3} defaultValue={prospect.notes || ""} /></div>
              <Button type="submit" disabled={updateProspect.isPending}>Enregistrer</Button>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  {prospect.email ? (
                    <a href={`mailto:${prospect.email}`} className="text-foreground hover:underline">
                      {prospect.email}
                    </a>
                  ) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Téléphone</dt>
                <dd>
                  {prospect.phone ? (
                    <a href={`tel:${prospect.phone}`} className="text-foreground hover:underline">
                      {prospect.phone}
                    </a>
                  ) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Site web</dt>
                <dd>
                  {prospect.website ? (
                    <a
                      href={prospect.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground hover:underline inline-flex items-center gap-1"
                    >
                      {prospect.website.replace(/^https?:\/\/(www\.)?/, "")}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  ) : "—"}
                </dd>
              </div>
              <div><dt className="text-muted-foreground">Source</dt><dd>{prospect.source || "—"}</dd></div>
              {/* ⚡ Métier : on affiche l'activité précise (brief IA) si renseignée,
                  sinon le label du catalogue de métiers via le code NAF, sinon
                  le libellé brut Pappers. */}
              <div className="col-span-2">
                <dt className="text-muted-foreground flex items-center gap-1.5">
                  <Briefcase className="h-3 w-3" /> Métier
                </dt>
                <dd className="mt-0.5">
                  {(() => {
                    /** Force la première lettre en majuscule (les sorties IA
                     *  arrivent parfois en minuscule selon le modèle). */
                    const capFirst = (s: string) =>
                      s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);

                    const briefActivity = (prospect as { brief_activity?: string | null }).brief_activity?.trim();
                    const trade = findTradeByNaf((prospect as { naf?: string | null }).naf);
                    const industry = (prospect as { industry?: string | null }).industry;

                    if (briefActivity) {
                      return (
                        <div className="space-y-1">
                          {trade?.label && (
                            <span className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary mr-1.5">
                              {capFirst(trade.label)}
                            </span>
                          )}
                          <p className="text-sm leading-relaxed">{capFirst(briefActivity)}</p>
                        </div>
                      );
                    }
                    if (trade?.label) return <span>{capFirst(trade.label)}</span>;
                    if (industry) return <span>{capFirst(industry)}</span>;
                    return <span>—</span>;
                  })()}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Étiquettes</dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {(prospect.tags || []).length === 0 ? "—" : (prospect.tags || []).map((t: string) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">{t}</span>
                  ))}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Prochaine action</dt>
                <dd>
                  {prospect.next_action || "—"}
                  {prospect.next_action_at && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({format(new Date(prospect.next_action_at), "PPp", { locale: fr })})
                    </span>
                  )}
                </dd>
              </div>
              <div><dt className="text-muted-foreground">Créé le</dt><dd>{format(new Date(prospect.created_at), "PP", { locale: fr })}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{prospect.notes || "—"}</dd></div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* ⚡ Brief Aperçu : carte d'enrichissement qui alimente l'IA lors de la
          génération de l'Aperçu Instantané. Plus c'est rempli, plus le copy
          est précis et ancré dans l'activité réelle du prospect. */}
      <PreviewBriefCard
        prospectId={prospect.id}
        initial={{
          activity: (prospect as { brief_activity?: string | null }).brief_activity ?? "",
          objective: (prospect as { brief_objective?: string | null }).brief_objective ?? "",
          tone: (prospect as { brief_tone?: string | null }).brief_tone ?? "",
          keywords: (prospect as { brief_keywords?: string[] | null }).brief_keywords ?? [],
          enriched_at: (prospect as { brief_enriched_at?: string | null }).brief_enriched_at ?? null,
        }}
      />


      {/* ═══ ONGLETS PROEMINENT — Discussion, Appels, Relances, Historique ═══
          Ces 4 sections sont les hubs d'activité quotidienne sur un prospect.
          On les rend visuellement très visibles (gros pills, compteurs, couleurs)
          pour que le commercial trouve les actions du jour en un coup d'œil. */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} id="prospect-activity">
        <div className="rounded-xl border bg-card p-2 mb-4">
          <TabsList className="w-full grid grid-cols-2 md:grid-cols-4 h-auto p-1 bg-muted/40 gap-1">
            <TabsTrigger
              value="comments"
              className="flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold">Discussion</span>
              {(comments?.length || 0) > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                  {comments?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="calls"
              className="flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <PhoneCall className="h-4 w-4 text-sky-600" />
              <span className="font-semibold">Appels</span>
              {(calls?.length || 0) > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold">
                  {calls?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="followups"
              className="flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <CalendarClock className="h-4 w-4 text-amber-600" />
              <span className="font-semibold">Relances</span>
              {(followUps?.length || 0) > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold">
                  {followUps?.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex items-center justify-center gap-2 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <History className="h-4 w-4 text-violet-600" />
              <span className="font-semibold">Historique</span>
              {(events?.length || 0) > 0 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-bold">
                  {events?.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="comments" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Discussion interne équipe</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {(!comments || comments.length === 0) ? (
                  <p className="text-muted-foreground text-sm">Aucun commentaire pour le moment.</p>
                ) : (
                  comments.map((c) => {
                    const mine = c.author_id === user?.id;
                    return (
                      <div key={c.id} className={cn("rounded-lg p-3 border", mine ? "bg-primary/5 border-primary/20" : "bg-muted/40")}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium">{profileName(c.author_id)}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(c.created_at), "PPp", { locale: fr })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                        {(mine || role === "admin") && (
                          <button
                            onClick={() => deleteComment.mutate(c.id)}
                            className="text-xs text-muted-foreground hover:text-destructive mt-2 inline-flex items-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" /> Supprimer
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); addComment.mutate(comment); }}
                className="space-y-2 border-t pt-3"
              >
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Écrire un message à l'équipe…"
                  rows={2}
                  maxLength={4000}
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={addComment.isPending || !comment.trim()}>
                    Envoyer
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Débrief d'appel</CardTitle>
              <p className="text-sm text-muted-foreground">
                Écris ou <strong>parle</strong> ton débrief 🎙️ — l'IA remplit le résultat, programme la relance et te coache.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <CallDebrief
                prospectId={id}
                prospect={{ first_name: prospect.first_name, company: prospect.company, status: prospect.status }}
              />

              {/* Historique des débriefs */}
              <div className="pt-2 border-t">
                {!calls || calls.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-2">Aucun appel enregistré pour l'instant.</p>
                ) : (
                  <ul className="divide-y">
                    {calls.map((c) => (
                      <li key={c.id} className="py-3">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{outcomeLabel(c.outcome)}</span>
                          <span className="text-muted-foreground">{format(new Date(c.called_at), "PPp", { locale: fr })}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Par {profileName(c.owner_id)}
                          {c.duration_minutes != null && ` · ${c.duration_minutes} min`}
                        </p>
                        {c.summary && <p className="text-sm mt-1 whitespace-pre-wrap">{c.summary}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
                  <DialogHeader>
                    <DialogTitle>Nouvelle relance</DialogTitle>
                    <DialogDescription>Programmer un rappel</DialogDescription>
                  </DialogHeader>
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
            <CardHeader><CardTitle>Historique complet</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">Évolution du statut</h3>
                {statusEvents.length === 0 ? (
                  <p className="text-muted-foreground text-sm">—</p>
                ) : (
                  <ol className="border-l-2 border-primary/20 pl-4 space-y-3">
                    {statusEvents.map((e) => (
                      <li key={e.id} className="text-sm relative">
                        <span className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full bg-primary" />
                        <div className="font-medium">{formatPayload(e.event_type, e.payload as any)}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(e.created_at), "PPp", { locale: fr })} · {profileName(e.owner_id)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2 mt-4">Tous les événements</h3>
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CallModeDrawer retiré — Mode appel centralisé sur la page /scripts */}
    </div>
  );
}

// Libellé lisible pour l'issue d'un appel (clés canoniques + fallback ancien format)
function outcomeLabel(outcome: string | null): string {
  const map: Record<string, string> = {
    interested: "🤝 Intéressé / RDV",
    callback: "🔁 À rappeler",
    no_answer: "📵 Pas de réponse",
    refused: "❌ Pas intéressé",
    note: "📝 Note",
    logged_quick: "Appel",
  };
  if (!outcome) return "Appel";
  return map[outcome] || outcome; // anciens logs en texte libre → tels quels
}

function formatPayload(type: string, payload: any) {
  if (!payload) return "";
  if (type === "status_changed") return `${STATUS_LABELS[payload.from as ProspectStatus] || payload.from} → ${STATUS_LABELS[payload.to as ProspectStatus] || payload.to}`;
  if (type === "call_logged") return [payload.outcome, payload.duration ? `${payload.duration} min` : null].filter(Boolean).join(" — ");
  if (type === "follow_up_scheduled") return payload.reason || "";
  if (type === "created") return `Statut initial : ${STATUS_LABELS[payload.status as ProspectStatus] || payload.status}`;
  return "";
}
