/**
 * ─── CockpitSessionMode — Mode focus plein écran ───────────────────────
 *
 * Active sur /relances quand le user clique "Démarrer ma session".
 * Présente UN prospect à la fois (au lieu d'une grosse liste), avec :
 *   - Contexte (pourquoi il est dans la to-do)
 *   - Quick actions : appeler / copier SMS d'accroche / marquer fait / skip
 *   - Compteur progress en haut (3/12)
 *   - Timer "depuis le démarrage" pour gamifier
 *   - À la fin : récap des actions faites
 *
 * L'item peut venir de n'importe quelle section du cockpit (chaud,
 * échange, relance, en retard, intéressé sans suite, aperçu non ouvert).
 * Le `context_kind` indique la source pour personnaliser l'accroche.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Phone, Mail, MessageSquare, Check, SkipForward, X, Flame, MessageCircle,
  CalendarClock, AlertTriangle, Briefcase, EyeOff, Snowflake, Copy, Trophy, ArrowRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type SessionItemKind =
  | "hot"          // a ouvert l'aperçu < 24h
  | "reply"        // a répondu (email/SMS/note d'appel)
  | "followup"    // relance planifiée du jour
  | "late_call"   // jamais appelé / silence > 14j
  | "stuck"       // intéressé sans suite
  | "ignored"     // aperçu envoyé non ouvert
  | "cold";       // sans interaction depuis >30j (à réveiller)

const KIND_META: Record<SessionItemKind, { label: string; icon: React.ElementType; tone: string; suggestionPrefix: string }> = {
  hot: {
    label: "Prospect chaud",
    icon: Flame,
    tone: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
    suggestionPrefix: "Vous avez regardé votre aperçu il y a quelques heures",
  },
  reply: {
    label: "À répondre",
    icon: MessageCircle,
    tone: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300",
    suggestionPrefix: "Vous m'avez répondu récemment",
  },
  followup: {
    label: "Relance prévue",
    icon: CalendarClock,
    tone: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
    suggestionPrefix: "Je reviens vers vous comme prévu",
  },
  late_call: {
    label: "À appeler",
    icon: AlertTriangle,
    tone: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
    suggestionPrefix: "Je me permets de vous appeler",
  },
  stuck: {
    label: "Intéressé sans suite",
    icon: Briefcase,
    tone: "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300",
    suggestionPrefix: "On en était resté à votre intérêt pour le projet",
  },
  ignored: {
    label: "Aperçu non vu",
    icon: EyeOff,
    tone: "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400",
    suggestionPrefix: "Je vous avais envoyé un aperçu, vous l'avez peut-être manqué",
  },
  cold: {
    label: "Prospect froid",
    icon: Snowflake,
    tone: "bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300",
    suggestionPrefix: "Ça fait un moment qu'on ne s'est pas parlé, je voulais reprendre contact",
  },
};

export type SessionItem = {
  key: string;                // id unique (prospect_id ou prospect_id+kind)
  kind: SessionItemKind;
  prospect: {
    id: string;
    first_name: string;
    last_name: string;
    company: string | null;
    phone: string | null;
    email: string | null;
  };
  contextLabel?: string;      // ex: "Ouvert 3× il y a 2h"
  excerpt?: string;           // ex: "Il a dit : 'intéressant, rappelez demain'"
};

export function CockpitSessionMode({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: SessionItem[];
}) {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [stats, setStats] = useState({ calls: 0, done: 0, skipped: 0 });
  const [elapsed, setElapsed] = useState(0);

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setIndex(0);
      setStartedAt(Date.now());
      setStats({ calls: 0, done: 0, skipped: 0 });
      setElapsed(0);
    }
  }, [open]);

  // Timer qui tourne
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [open, startedAt]);

  if (!open) return null;

  const total = items.length;
  const done = index >= total;
  const current = items[index];

  // Format mm:ss
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
                {total} action{total > 1 ? "s" : ""} traitée{total > 1 ? "s" : ""} en {mm}:{ss}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-2xl font-bold tabular-nums">{stats.calls}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Appels</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.done}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Fait</div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-2xl font-bold tabular-nums text-muted-foreground">{stats.skipped}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Skip</div>
              </div>
            </div>
            <Button onClick={() => onOpenChange(false)} className="w-full mt-4">
              Fermer
            </Button>
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

  // Génère un SMS d'accroche contextuel basé sur le kind du prospect
  const smsAccroche = `Bonjour ${firstName}, ${meta.suggestionPrefix.toLowerCase()} — je vous propose d'en discuter quand vous voulez. À très vite, [Hugo]`;

  const next = () => setIndex((i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* Header avec progression + timer */}
        <div className="border-b -mx-6 -mt-6 px-6 py-3 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground">
              Action <span className="font-bold text-foreground tabular-nums">{index + 1}</span> sur {total}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">⏱️ {mm}:{ss}</div>
          </div>
          {/* Barre de progression */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Carte prospect */}
        <div className="space-y-4 pt-2">
          {/* Tag kind */}
          <div className="flex items-center justify-between">
            <Badge className={cn("gap-1.5 px-3 py-1 text-xs border-0", meta.tone)}>
              <Icon className="size-3.5" />
              {meta.label}
            </Badge>
            <Link
              to="/prospects/$id"
              params={{ id: current.prospect.id }}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fiche complète <ExternalLink className="size-3" />
            </Link>
          </div>

          {/* Nom + société */}
          <div>
            <h2 className="text-2xl font-bold">{fullName}</h2>
            {current.prospect.company && (
              <p className="text-sm text-muted-foreground mt-0.5">{current.prospect.company}</p>
            )}
          </div>

          {/* Contexte */}
          {(current.contextLabel || current.excerpt) && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              {current.contextLabel && (
                <p className="font-medium text-foreground/90">{current.contextLabel}</p>
              )}
              {current.excerpt && (
                <p className="text-xs italic text-muted-foreground line-clamp-3">
                  "{current.excerpt}"
                </p>
              )}
            </div>
          )}

          {/* Suggestion d'accroche IA */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">
              💬 Accroche suggérée
            </p>
            <p className="text-sm leading-relaxed">{smsAccroche}</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1.5"
              onClick={() => {
                navigator.clipboard.writeText(smsAccroche)
                  .then(() => toast.success("Accroche copiée"))
                  .catch(() => toast.error("Copie impossible"));
              }}
            >
              <Copy className="size-3" /> Copier
            </Button>
          </div>

          {/* Actions principales */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            {current.prospect.phone ? (
              <Button
                size="lg"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white col-span-2"
                onClick={() => {
                  window.location.href = `tel:${current.prospect.phone}`;
                  setStats((s) => ({ ...s, calls: s.calls + 1 }));
                }}
              >
                <Phone className="size-4" />
                Appeler {current.prospect.phone}
              </Button>
            ) : current.prospect.email ? (
              <Button
                size="lg"
                className="gap-2 col-span-2"
                variant="outline"
                onClick={() => { window.location.href = `mailto:${current.prospect.email}`; }}
              >
                <Mail className="size-4" />
                Écrire à {current.prospect.email}
              </Button>
            ) : (
              <div className="col-span-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded border border-amber-200 dark:border-amber-900/50">
                ⚠️ Pas de téléphone ni email — édite la fiche pour ajouter un contact
              </div>
            )}
          </div>

          {/* Actions secondaires : Fait / Skip */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setStats((s) => ({ ...s, done: s.done + 1 }));
                toast.success("Action marquée faite");
                next();
              }}
            >
              <Check className="size-3.5 text-emerald-600" />
              Marqué fait
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
                next();
              }}
            >
              <SkipForward className="size-3.5" />
              Skip
            </Button>
          </div>

          {/* Suivant si appelé */}
          {current.prospect.phone && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => {
                setStats((s) => ({ ...s, done: s.done + 1 }));
                next();
              }}
            >
              Suivant <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Quitter */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 size-7 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition"
          title="Quitter la session"
        >
          <X className="size-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
