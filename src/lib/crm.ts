export const PROSPECT_STATUSES = [
  "nouveau",
  "en_cours",
  "interesse",
  "converti",
  "perdu",
  "a_relancer",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  interesse: "Intéressé",
  converti: "Converti",
  perdu: "Perdu",
  a_relancer: "À relancer",
};

export const STATUS_VARIANTS: Record<ProspectStatus, string> = {
  nouveau: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  en_cours: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  interesse: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  converti: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  perdu: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  a_relancer: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
};

export const EVENT_LABELS: Record<string, string> = {
  created: "Prospect créé",
  status_changed: "Statut modifié",
  call_logged: "Appel enregistré",
  follow_up_scheduled: "Relance programmée",
};

// ---- Suggestion de prochaine action (calculée côté front, sans IA)
export interface NextActionContext {
  status: ProspectStatus;
  createdAt: string;
  lastContactAt?: string | null;        // max(call_logs.called_at, follow_ups completed)
  nextFollowupAt?: string | null;       // prochaine relance non terminée
  nextActionLabel?: string | null;      // champ libre déjà saisi
  nextActionAt?: string | null;
}

export interface NextActionSuggestion {
  label: string;
  tone: "neutral" | "info" | "warn" | "success" | "danger";
  reason: string;
}

const DAY = 24 * 60 * 60 * 1000;

export function suggestNextAction(ctx: NextActionContext): NextActionSuggestion {
  const now = Date.now();
  const last = ctx.lastContactAt ? new Date(ctx.lastContactAt).getTime() : new Date(ctx.createdAt).getTime();
  const daysSince = Math.floor((now - last) / DAY);

  // 1. Action explicite saisie par le commercial → on respecte
  if (ctx.nextActionLabel) {
    const at = ctx.nextActionAt ? new Date(ctx.nextActionAt).getTime() : null;
    if (at && at < now) {
      return { label: `⚠️ ${ctx.nextActionLabel}`, tone: "warn", reason: "Action prévue en retard" };
    }
    return { label: ctx.nextActionLabel, tone: "info", reason: "Action planifiée" };
  }

  // 2. Relance déjà programmée
  if (ctx.nextFollowupAt) {
    const at = new Date(ctx.nextFollowupAt).getTime();
    if (at < now) return { label: "Relance en retard", tone: "warn", reason: "Relance à faire" };
    const inDays = Math.ceil((at - now) / DAY);
    return { label: `Relance dans ${inDays}j`, tone: "info", reason: "Relance planifiée" };
  }

  // 3. Suggestion par statut
  switch (ctx.status) {
    case "nouveau":
      return { label: "Premier appel", tone: "info", reason: "Aucun contact encore" };
    case "en_cours":
      if (daysSince > 7) return { label: "Rappeler — silence radio", tone: "warn", reason: `${daysSince}j sans contact` };
      return { label: "Relancer sous 3j", tone: "info", reason: "Échange en cours" };
    case "interesse":
      return { label: "Envoyer mail post-call", tone: "success", reason: "Prospect chaud" };
    case "a_relancer":
      return { label: "Relancer maintenant", tone: "warn", reason: "Marqué à relancer" };
    case "converti":
      return { label: "Envoyer mail bienvenue", tone: "success", reason: "Client signé" };
    case "perdu":
      return { label: "Archiver", tone: "neutral", reason: "Prospect perdu" };
    default:
      return { label: "À qualifier", tone: "neutral", reason: "" };
  }
}

export const SUGGESTION_TONE: Record<NextActionSuggestion["tone"], string> = {
  neutral: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  danger: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

