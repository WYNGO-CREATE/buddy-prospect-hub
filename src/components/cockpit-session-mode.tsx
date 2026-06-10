/**
 * ─── CockpitSessionMode — Machine à appeler (mode focus plein écran) ───
 *
 * Active sur /relances quand le user clique "Démarrer ma session".
 * Présente UN prospect à la fois et déroule la boucle de vente complète :
 *
 *   1. Contexte + accroche suggérée (script d'appel)
 *   2. Aperçu Instantané : envoyer le lien EN DIRECT (copier / SMS / email)
 *   3. Appeler (click-to-call)
 *   4. Résultat d'appel EN 1 CLIC → log call_logs + maj statut + relance auto :
 *        🤝 Intéressé/RDV  → statut "intéressé"  + relance J+1
 *        🔁 À rappeler      → statut "à relancer" + relance J+2
 *        📵 Pas de réponse  → (statut inchangé)    + relance J+2
 *        ❌ Pas intéressé   → statut "perdu"
 *   5. Passe automatiquement au prospect suivant
 *
 * À la fin : récap gamifié (appels, intéressés, rappels, refus).
 *
 * Tout est tracé (call_logs.outcome) → alimente les stats du cockpit et
 * du tableau de bord. C'est le cœur opérationnel : on VEND ici, on ne
 * note plus après coup.
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Phone, Mail, Check, SkipForward, X, Flame, MessageCircle,
  CalendarClock, AlertTriangle, Briefcase, EyeOff, Snowflake, Copy, Trophy,
  ArrowRight, ExternalLink, Handshake, PhoneOff, RotateCcw, ThumbsDown,
  Wand2, Link2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const APP_URL = "https://wyngo.bold-unit-739e.workers.dev";

export type SessionItemKind =
  | "hot" | "reply" | "followup" | "late_call" | "stuck" | "ignored" | "cold";

const KIND_META: Record<SessionItemKind, { label: string; icon: React.ElementType; tone: string; suggestionPrefix: string }> = {
  hot:      { label: "Prospect chaud",        icon: Flame,         tone: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",   suggestionPrefix: "Vous avez regardé votre aperçu il y a quelques heures" },
  reply:    { label: "À répondre",            icon: MessageCircle, tone: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300", suggestionPrefix: "Vous m'avez répondu récemment" },
  followup: { label: "Relance prévue",        icon: CalendarClock, tone: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",               suggestionPrefix: "Je reviens vers vous comme prévu" },
  late_call:{ label: "À appeler",             icon: AlertTriangle, tone: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",         suggestionPrefix: "Je me permets de vous appeler" },
  stuck:    { label: "Intéressé sans suite",  icon: Briefcase,     tone: "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300",     suggestionPrefix: "On en était resté à votre intérêt pour le projet" },
  ignored:  { label: "Aperçu non vu",         icon: EyeOff,        tone: "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400",            suggestionPrefix: "Je vous avais envoyé un aperçu, vous l'avez peut-être manqué" },
  cold:     { label: "Prospect froid",        icon: Snowflake,     tone: "bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300",             suggestionPrefix: "Ça fait un moment qu'on ne s'est pas parlé, je voulais reprendre contact" },
};

export type SessionItem = {
  key: string;
  kind: SessionItemKind;
  prospect: {
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    phone: string | null;
    email: string | null;
  };
  contextLabel?: string;
  excerpt?: string;
};

type Stats = { calls: number; interested: number; callback: number; refused: number; skipped: number };

export function CockpitSessionMode({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: SessionItem[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [stats, setStats] = useState<Stats>({ calls: 0, interested: 0, callback: 0, refused: 0, skipped: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [called, setCalled] = useState(false);     // a-t-on cliqué "Appeler" ?
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const current = items[index];

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setIndex(0);
      setStartedAt(Date.now());
      setStats({ calls: 0, interested: 0, callback: 0, refused: 0, skipped: 0 });
      setElapsed(0);
    }
  }, [open]);

  // Reset l'état "appelé" à chaque changement de prospect
  useEffect(() => { setCalled(false); }, [index]);

  // Timer
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [open, startedAt]);

  // Récupère le lien d'aperçu existant pour le prospect courant
  useEffect(() => {
    if (!open || !current) { setPreviewUrl(null); return; }
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewUrl(null);
    (async () => {
      const { data } = await supabase
        .from("prospect_previews")
        .select("slug, html_url, generated_at")
        .eq("prospect_id", current.prospect.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { slug?: string; html_url?: string } | null;
      const url = row?.html_url || (row?.slug ? `${APP_URL}/p/${row.slug}` : null);
      setPreviewUrl(url);
      setLoadingPreview(false);
    })();
    return () => { cancelled = true; };
  }, [open, current]);

  const next = useCallback(() => setIndex((i) => i + 1), []);

  // ─── Enregistre le résultat d'appel + automatise la suite ──────────
  const recordOutcome = useCallback(async (
    outcome: "interested" | "callback" | "no_answer" | "refused",
    opts: { newStatus?: string; followUpDays?: number; followUpReason?: string; summary: string },
  ) => {
    if (!current || !user) return;
    setSaving(true);
    const nowISO = new Date().toISOString();
    const pid = current.prospect.id;
    try {
      // 1. Journalise l'appel
      await supabase.from("call_logs").insert({
        prospect_id: pid, owner_id: user.id, called_at: nowISO,
        outcome, summary: opts.summary,
      } as never);
      // 2. Met à jour le statut si besoin
      if (opts.newStatus) {
        await supabase.from("prospects").update({ status: opts.newStatus, updated_at: nowISO } as never).eq("id", pid);
      }
      // 3. Programme la relance auto
      if (opts.followUpDays != null) {
        const at = new Date(Date.now() + opts.followUpDays * 86_400_000).toISOString();
        await supabase.from("follow_ups").insert({
          prospect_id: pid, owner_id: user.id, scheduled_at: at,
          reason: opts.followUpReason || opts.summary, completed: false,
        } as never);
      }
    } catch (e) {
      toast.error("Erreur d'enregistrement : " + (e as Error).message);
    }
    setSaving(false);
    // 4. Stats + feedback + suivant
    setStats((s) => ({
      ...s,
      calls: s.calls + 1,
      interested: s.interested + (outcome === "interested" ? 1 : 0),
      callback: s.callback + (outcome === "callback" || outcome === "no_answer" ? 1 : 0),
      refused: s.refused + (outcome === "refused" ? 1 : 0),
    }));
    qc.invalidateQueries({ queryKey: ["cockpit-followups"] });
    qc.invalidateQueries({ queryKey: ["cockpit-late"] });
    qc.invalidateQueries({ queryKey: ["cockpit-stuck"] });
    qc.invalidateQueries({ queryKey: ["cockpit-cold"] });
    qc.invalidateQueries({ queryKey: ["cockpit-daily-stats"] });
    const labels: Record<string, string> = {
      interested: "🤝 Intéressé — relance programmée demain",
      callback: "🔁 À rappeler — relance programmée",
      no_answer: "📵 Pas de réponse — relance dans 2 jours",
      refused: "❌ Marqué perdu",
    };
    toast.success(labels[outcome]);
    next();
  }, [current, user, qc, next]);

  if (!open) return null;

  const total = items.length;
  const done = index >= total;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const progressPct = total > 0 ? Math.round((index / total) * 100) : 0;

  // ─── Récap final ───────────────────────────────────────────────────
  if (done) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="text-center py-6 space-y-4">
            <div className="size-16 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Trophy className="size-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Session terminée 🎉</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {total} prospect{total > 1 ? "s" : ""} traité{total > 1 ? "s" : ""} en {mm}:{ss}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 pt-2">
              <RecapStat value={stats.calls} label="Appels" />
              <RecapStat value={stats.interested} label="Intéressés" tone="text-emerald-600 dark:text-emerald-400" />
              <RecapStat value={stats.callback} label="À rappeler" tone="text-sky-600 dark:text-sky-400" />
              <RecapStat value={stats.refused} label="Perdus" tone="text-muted-foreground" />
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full mt-4">Fermer</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!current) return null;
  const meta = KIND_META[current.kind];
  const Icon = meta.icon;
  const fullName = `${current.prospect.first_name} ${current.prospect.last_name}`;
  const firstName = current.prospect.first_name;
  const phone = current.prospect.phone;
  const email = current.prospect.email;

  const smsAccroche = `Bonjour ${firstName}, ${meta.suggestionPrefix.toLowerCase()} — je vous propose d'en discuter quand vous voulez. À très vite.`;

  // Message pour partager l'aperçu
  const previewMsg = previewUrl
    ? `Bonjour ${firstName}, voici l'aperçu du site que j'ai préparé pour ${current.prospect.company || "vous"} : ${previewUrl}`
    : "";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(label)).catch(() => toast.error("Copie impossible"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[94vh] overflow-y-auto">
        {/* Header progression + timer */}
        <div className="border-b -mx-6 -mt-6 px-6 py-3 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground">
              Prospect <span className="font-bold text-foreground tabular-nums">{index + 1}</span> / {total}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">⏱️ {mm}:{ss}</div>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="space-y-4 pt-2">
          {/* Badge + fiche */}
          <div className="flex items-center justify-between">
            <Badge className={cn("gap-1.5 px-3 py-1 text-xs border-0", meta.tone)}>
              <Icon className="size-3.5" />{meta.label}
            </Badge>
            <Link to="/prospects/$id" params={{ id: current.prospect.id }} target="_blank" rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Fiche complète <ExternalLink className="size-3" />
            </Link>
          </div>

          {/* Nom + société */}
          <div>
            <h2 className="text-2xl font-bold">{fullName}</h2>
            {current.prospect.company && <p className="text-sm text-muted-foreground mt-0.5">{current.prospect.company}</p>}
          </div>

          {/* Contexte */}
          {(current.contextLabel || current.excerpt) && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              {current.contextLabel && <p className="font-medium text-foreground/90">{current.contextLabel}</p>}
              {current.excerpt && <p className="text-xs italic text-muted-foreground line-clamp-3">"{current.excerpt}"</p>}
            </div>
          )}

          {/* Accroche suggérée */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">💬 Accroche suggérée</p>
            <p className="text-sm leading-relaxed">{smsAccroche}</p>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={() => copyToClipboard(smsAccroche, "Accroche copiée")}>
              <Copy className="size-3" /> Copier
            </Button>
          </div>

          {/* ─── Bloc APERÇU INSTANTANÉ ─── */}
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
              <Wand2 className="size-3" /> Aperçu Instantané
            </p>
            {loadingPreview ? (
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Recherche de l'aperçu…</p>
            ) : previewUrl ? (
              <>
                <p className="text-xs text-muted-foreground">Envoie-le pendant l'appel : <span className="italic">"je vous l'envoie là, vous l'avez ?"</span></p>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyToClipboard(previewMsg, "Message + lien copiés")}>
                    <Copy className="size-3" /> Copier le message
                  </Button>
                  {phone && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                      <a href={`sms:${phone}?&body=${encodeURIComponent(previewMsg)}`}><MessageCircle className="size-3" /> SMS</a>
                    </Button>
                  )}
                  {email && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                      <a href={`mailto:${email}?subject=${encodeURIComponent("Aperçu de votre site")}&body=${encodeURIComponent(previewMsg)}`}><Mail className="size-3" /> Email</a>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" asChild>
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer"><Link2 className="size-3" /> Ouvrir</a>
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Pas encore d'aperçu pour ce prospect.</p>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                  <Link to="/prospects/$id" params={{ id: current.prospect.id }} target="_blank" rel="noopener noreferrer">
                    <Wand2 className="size-3" /> En générer un
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {/* ─── APPELER ─── */}
          {phone ? (
            <Button size="lg" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-12"
              onClick={() => { window.location.href = `tel:${phone}`; setCalled(true); }}>
              <Phone className="size-5" /> Appeler {phone}
            </Button>
          ) : email ? (
            <Button size="lg" variant="outline" className="w-full gap-2" onClick={() => { window.location.href = `mailto:${email}`; setCalled(true); }}>
              <Mail className="size-4" /> Écrire à {email}
            </Button>
          ) : (
            <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded border border-amber-200 dark:border-amber-900/50">
              ⚠️ Pas de téléphone ni email — édite la fiche pour ajouter un contact
            </div>
          )}

          {/* ─── RÉSULTAT DE L'APPEL (le cœur) ─── */}
          <div className={cn("rounded-lg border p-3 space-y-2 transition", called ? "border-primary/40 bg-primary/5" : "border-dashed")}>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Résultat de l'appel {called && <span className="text-primary">— note-le en 1 clic</span>}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" disabled={saving}
                className="gap-1.5 justify-start border-emerald-300 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                onClick={() => recordOutcome("interested", { newStatus: "interesse", followUpDays: 1, followUpReason: "Suite à appel intéressé — confirmer / envoyer infos", summary: "Appel : prospect intéressé" })}>
                <Handshake className="size-4" /> Intéressé / RDV
              </Button>
              <Button variant="outline" size="sm" disabled={saving}
                className="gap-1.5 justify-start border-sky-300 dark:border-sky-900 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                onClick={() => recordOutcome("callback", { newStatus: "a_relancer", followUpDays: 2, followUpReason: "Rappeler (demandé pendant l'appel)", summary: "Appel : à rappeler" })}>
                <RotateCcw className="size-4" /> À rappeler
              </Button>
              <Button variant="outline" size="sm" disabled={saving}
                className="gap-1.5 justify-start"
                onClick={() => recordOutcome("no_answer", { followUpDays: 2, followUpReason: "Pas de réponse — réessayer", summary: "Appel : pas de réponse / répondeur" })}>
                <PhoneOff className="size-4" /> Pas de réponse
              </Button>
              <Button variant="outline" size="sm" disabled={saving}
                className="gap-1.5 justify-start text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                onClick={() => recordOutcome("refused", { newStatus: "perdu", summary: "Appel : pas intéressé" })}>
                <ThumbsDown className="size-4" /> Pas intéressé
              </Button>
            </div>
          </div>

          {/* Skip discret (sans résultat) */}
          <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground" disabled={saving}
            onClick={() => { setStats((s) => ({ ...s, skipped: s.skipped + 1 })); next(); }}>
            <SkipForward className="size-3.5" /> Passer sans noter
          </Button>
        </div>

        {/* Quitter */}
        <button onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 size-7 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition"
          title="Quitter la session">
          <X className="size-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}

function RecapStat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className={cn("text-xl font-bold tabular-nums", tone)}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
