/**
 * ─── Smart Tags ──────────────────────────────────────────────────────
 *
 * Tags calculés automatiquement à partir des données réelles du prospect :
 *   - statut CRM (interesse / perdu / converti)
 *   - last_call_at (jamais appelé / froid)
 *   - inbound messages (a répondu)
 *   - prospect_previews (a ouvert l'aperçu)
 *   - website_status (cible prime)
 *
 * Plus efficaces que les tags manuels : pas de saisie, toujours à jour,
 * couleurs et priorités cohérentes.
 *
 * Priorité : du plus chaud (CHAUD #1) au plus mort (REFUS #last). Les tags
 * affichés sont limités au top-N pour ne pas surcharger l'UI.
 */

export type SmartTagKey =
  | "hot"          // 🔥 a ouvert l'aperçu < 24h
  | "replied"      // 💬 a répondu (inbound récent)
  | "interested"   // 💎 statut "intéressé"
  | "to_call"      // 📞 jamais appelé
  | "no_website"   // 🌐 pas de site (cible prime)
  | "top_rated"    // ⭐ note Google ≥ 4.5
  | "preview_sent" // 👁️ aperçu envoyé en attente
  | "cold"         // ❄️ aucune interaction > 30j
  | "client"       // ✅ converti
  | "refused";     // ❌ perdu

export type SmartTag = {
  key: SmartTagKey;
  label: string;
  icon: string;     // emoji
  cls: string;      // classes Tailwind (bg + texte + border)
  tooltip: string;
  priority: number; // 0 = top (le plus chaud)
};

const TAG_DEFS: Record<SmartTagKey, Omit<SmartTag, "key">> = {
  hot: {
    label: "Chaud",
    icon: "🔥",
    cls: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800 font-semibold",
    tooltip: "A ouvert son Aperçu Instantané dans les dernières 24h",
    priority: 0,
  },
  replied: {
    label: "A répondu",
    icon: "💬",
    cls: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
    tooltip: "A répondu par email/SMS/LinkedIn récemment",
    priority: 1,
  },
  interested: {
    label: "Intéressé",
    icon: "💎",
    cls: "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800 font-semibold",
    tooltip: "Statut marqué 'Intéressé'",
    priority: 2,
  },
  client: {
    label: "Client",
    icon: "✅",
    cls: "bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 border-emerald-400 dark:border-emerald-700 font-bold",
    tooltip: "Converti en client",
    priority: 3,
  },
  to_call: {
    label: "À appeler",
    icon: "📞",
    cls: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800",
    tooltip: "Jamais contacté par téléphone",
    priority: 4,
  },
  no_website: {
    label: "Sans site",
    icon: "🌐",
    // Indigo (bleu profond) — distinct de sky (à appeler), cyan (aperçu envoyé),
    // violet (intéressé), rose (jamais/refus). Évoque l'opportunité business.
    cls: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800",
    tooltip: "Pas de site web — cible prime Wyngo",
    priority: 5,
  },
  top_rated: {
    label: "Top note",
    icon: "⭐",
    cls: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
    tooltip: "Note Google ≥ 4.5/5 — entreprise sérieuse",
    priority: 6,
  },
  preview_sent: {
    label: "Aperçu envoyé",
    icon: "👁️",
    cls: "bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800",
    tooltip: "Aperçu généré, en attente de consultation",
    priority: 7,
  },
  cold: {
    label: "Froid",
    icon: "❄️",
    cls: "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700",
    tooltip: "Aucune interaction depuis 30 jours",
    priority: 8,
  },
  refused: {
    label: "Refus",
    icon: "❌",
    cls: "bg-rose-200 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 border-rose-400 dark:border-rose-800",
    tooltip: "Prospect perdu / refus exprimé",
    priority: 9,
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Contexte nécessaire pour calculer les tags d'un prospect. */
export type SmartTagContext = {
  status: string | null | undefined;
  website_status?: "no_website" | "outdated" | "has_website" | "unknown" | null;
  created_at: string;
  /** Dernier preview ouvert (opened_at + view_count) — null si jamais ouvert */
  last_preview_opened_at: string | null;
  preview_view_count: number;
  /** Au moins un aperçu généré */
  has_preview_generated: boolean;
  /** Dernier appel — null si jamais */
  last_called_at: string | null;
  /** Dernier message inbound — null si jamais */
  last_inbound_at: string | null;
  /** Note Google (depuis preview source_data ou places-enrich) */
  google_rating?: number | null;
};

/**
 * Calcule la liste des smart tags pertinents pour un prospect.
 * Retourne triée par priorité (plus chaud en premier).
 */
export function computeSmartTags(ctx: SmartTagContext): SmartTag[] {
  const tags: SmartTagKey[] = [];
  const now = Date.now();

  // ── STATUTS CRM (exclusifs) ───────────────────────────────────────
  if (ctx.status === "converti") tags.push("client");
  else if (ctx.status === "perdu") tags.push("refused");
  else if (ctx.status === "interesse") tags.push("interested");

  // ── ACTIVITÉ FORTE ────────────────────────────────────────────────
  // CHAUD : a ouvert l'aperçu dans les dernières 24h
  if (ctx.last_preview_opened_at) {
    const since = now - new Date(ctx.last_preview_opened_at).getTime();
    if (since < DAY_MS) tags.push("hot");
  }

  // A RÉPONDU : inbound dans les 14 derniers jours
  if (ctx.last_inbound_at) {
    const since = now - new Date(ctx.last_inbound_at).getTime();
    if (since < 14 * DAY_MS) tags.push("replied");
  }

  // APERÇU ENVOYÉ : aperçu généré mais 0 ouverture (preview_view_count = 0)
  if (ctx.has_preview_generated && ctx.preview_view_count === 0 && !tags.includes("hot")) {
    tags.push("preview_sent");
  }

  // ── SIGNAUX FAIBLES ───────────────────────────────────────────────
  // À APPELER : jamais appelé ET créé > 5 jours
  if (!ctx.last_called_at) {
    const createdSince = now - new Date(ctx.created_at).getTime();
    if (createdSince > 5 * DAY_MS && ctx.status !== "perdu" && ctx.status !== "converti") {
      tags.push("to_call");
    }
  }

  // SANS SITE : cible prime Wyngo
  if (ctx.website_status === "no_website") tags.push("no_website");

  // TOP NOTE : note Google >= 4.5
  if (typeof ctx.google_rating === "number" && ctx.google_rating >= 4.5) {
    tags.push("top_rated");
  }

  // FROID : aucune interaction depuis 30j+ (sauf perdu/converti, qui ont déjà leur tag)
  if (ctx.status !== "perdu" && ctx.status !== "converti") {
    const lastActivities = [
      ctx.last_called_at,
      ctx.last_inbound_at,
      ctx.last_preview_opened_at,
    ].filter((t): t is string => !!t);
    const mostRecent = lastActivities.length > 0
      ? Math.max(...lastActivities.map((t) => new Date(t).getTime()))
      : new Date(ctx.created_at).getTime();
    if (now - mostRecent > 30 * DAY_MS && !tags.includes("hot") && !tags.includes("replied")) {
      tags.push("cold");
    }
  }

  // Construit, dédup, trie par priorité, max 4 tags pour l'UI
  const unique = Array.from(new Set(tags));
  return unique
    .map((k) => ({ key: k, ...TAG_DEFS[k] }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4);
}
