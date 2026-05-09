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
