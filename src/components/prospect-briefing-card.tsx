/**
 * ─── ProspectBriefingCard ─────────────────────────────────────────────
 *
 * Carte "Briefing" en haut de chaque fiche prospect. Synthèse en 3 secondes
 * de qui est ce prospect et où en est la relation, AUTO-composée à partir
 * de tout ce qu'on sait :
 *
 *   ► Activité précise (brief_activity IA OU label NAF)
 *   ► Localisation (ville + département)
 *   ► Statut digital (note Google + nb avis + site web ou pas)
 *   ► Dernière interaction (dernier appel, dernier email, dernière ouverture
 *     de l'aperçu)
 *   ► Tags si présents
 *
 * Pas d'appel IA en plus : tout est composé client-side depuis ce qu'on a
 * déjà en DB. Performant, instantané.
 */

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { findTradeByNaf } from "@/lib/trades-catalog";
import {
  MapPin, Star, Globe, GlobeLock, Calendar, Mail, Phone, MessageSquare, Eye, ScrollText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

type Prospect = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  industry: string | null;
  status: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Champs ajoutés via migrations (cast côté composant)
  naf?: string | null;
  brief_activity?: string | null;
  brief_keywords?: string[] | null;
  website_status?: "no_website" | "outdated" | "has_website" | "unknown" | null;
};

const WEBSITE_STATUS_META: Record<string, { label: string; icon: typeof Globe; cls: string }> = {
  no_website: { label: "Pas de site web", icon: GlobeLock, cls: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" },
  outdated:   { label: "Site obsolète",   icon: Globe,     cls: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" },
  has_website:{ label: "Site moderne",    icon: Globe,     cls: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" },
  unknown:    { label: "Site inconnu",    icon: Globe,     cls: "bg-muted text-muted-foreground" },
};

/** Capitalize first letter */
function capFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/** Extract city from "12 rue X, 31000 Toulouse" */
function extractCity(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  // "31000 Toulouse" → "Toulouse" (last word, capitalize)
  const m = last.match(/\d{5}\s+(.+)$/);
  if (m) return m[1].trim();
  return last || null;
}

export function ProspectBriefingCard({ prospect }: { prospect: Prospect }) {
  // ─── Dernier preview généré pour ce prospect (rating, nb avis, ouvertures)
  const { data: latestPreview } = useQuery({
    queryKey: ["briefing-latest-preview", prospect.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_previews")
        .select("id, opened_at, view_count, source_data, generated_at")
        .eq("prospect_id", prospect.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as {
        id: string;
        opened_at: string | null;
        view_count: number;
        source_data: { places?: { rating?: number; reviewCount?: number }; copy?: unknown } | null;
        generated_at: string;
      } | null;
    },
  });

  // ─── Dernière interaction (call OR message OR preview opened)
  const { data: lastInteraction } = useQuery({
    queryKey: ["briefing-last-interaction", prospect.id],
    queryFn: async () => {
      const [calls, msgs] = await Promise.all([
        supabase.from("call_logs").select("called_at").eq("prospect_id", prospect.id).order("called_at", { ascending: false }).limit(1),
        supabase.from("messages").select("occurred_at, direction").eq("prospect_id", prospect.id).order("occurred_at", { ascending: false }).limit(1),
      ]);
      const candidates: Array<{ date: string; type: "call" | "email_in" | "email_out" | "preview" }> = [];
      if (calls.data?.[0]?.called_at) candidates.push({ date: calls.data[0].called_at, type: "call" });
      const m = msgs.data?.[0];
      if (m?.occurred_at) candidates.push({ date: m.occurred_at, type: m.direction === "inbound" ? "email_in" : "email_out" });
      if (latestPreview?.opened_at) candidates.push({ date: latestPreview.opened_at, type: "preview" });
      if (candidates.length === 0) return null;
      return candidates.sort((a, b) => b.date.localeCompare(a.date))[0];
    },
  });

  // ─── Compose la phrase d'activité
  const trade = findTradeByNaf(prospect.naf);
  const activityText = prospect.brief_activity?.trim() || trade?.label || prospect.industry || null;
  const city = extractCity(prospect.location);

  // ─── Rating Google (depuis le dernier preview généré)
  const rating = latestPreview?.source_data?.places?.rating;
  const reviewCount = latestPreview?.source_data?.places?.reviewCount;

  // ─── Statut digital
  const websiteStatus = prospect.website_status || "unknown";
  const wsMeta = WEBSITE_STATUS_META[websiteStatus] || WEBSITE_STATUS_META.unknown;

  // ─── Dernière interaction (humanisée)
  const interactionLabel = lastInteraction
    ? {
        call: { icon: Phone, label: "Dernier appel" },
        email_in: { icon: Mail, label: "Dernier email reçu" },
        email_out: { icon: Mail, label: "Dernier email envoyé" },
        preview: { icon: Eye, label: "Aperçu ouvert" },
      }[lastInteraction.type]
    : null;

  return (
    <Card className="bg-gradient-to-br from-primary/5 via-card to-card border-primary/20 shadow-sm">
      <div className="p-5 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ScrollText className="h-4 w-4" />
          </div>
          <p className="text-xs uppercase tracking-wider font-semibold text-primary">Briefing prospect</p>
        </div>

        {/* Phrase principale : qui c'est, ce qu'il fait, où */}
        {activityText && (
          <p className="text-base leading-relaxed text-foreground">
            <strong>{prospect.company || `${prospect.first_name} ${prospect.last_name}`}</strong>
            {city && (
              <>
                {" "}
                <span className="text-muted-foreground">à</span>{" "}
                <span className="font-medium">{city}</span>
              </>
            )}
            <span className="text-muted-foreground"> — </span>
            {capFirst(activityText)}
          </p>
        )}

        {!activityText && (
          <p className="text-sm italic text-muted-foreground">
            Pas encore d'activité renseignée. Clique sur "Préremplir avec l'IA" dans le brief en bas, ou génère un Aperçu Instantané pour auto-remplir.
          </p>
        )}

        {/* Ligne de facts : badges colorés */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {/* Métier (label catalogue) */}
          {trade?.label && (
            <Badge variant="outline" className="gap-1">
              <span>{trade.label}</span>
            </Badge>
          )}

          {/* Localisation */}
          {city && (
            <Badge variant="outline" className="gap-1">
              <MapPin className="h-3 w-3" />
              {city}
            </Badge>
          )}

          {/* Note Google */}
          {typeof rating === "number" && (
            <Badge className="gap-1 bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/50">
              <Star className="h-3 w-3 fill-current" />
              <span className="font-semibold">{rating.toFixed(1)}/5</span>
              {typeof reviewCount === "number" && <span className="opacity-70">· {reviewCount} avis</span>}
            </Badge>
          )}

          {/* Statut digital (site web) */}
          {websiteStatus && websiteStatus !== "unknown" && (
            <Badge className={`gap-1 border-0 ${wsMeta.cls}`}>
              <wsMeta.icon className="h-3 w-3" />
              {wsMeta.label}
            </Badge>
          )}

          {/* Création prospect (depuis quand on le suit) */}
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Suivi {formatDistanceToNow(new Date(prospect.created_at), { locale: fr, addSuffix: false })}
          </Badge>
        </div>

        {/* Mots-clés / spécialités du brief */}
        {prospect.brief_keywords && prospect.brief_keywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              Spécialités :
            </span>
            {prospect.brief_keywords.slice(0, 6).map((k) => (
              <span
                key={k}
                className="text-[11px] px-2 py-0.5 rounded-md bg-primary/8 text-primary/90 border border-primary/15"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        {/* Dernière interaction + ouvertures preview */}
        {(lastInteraction || (latestPreview && (latestPreview.view_count || 0) > 0)) && (
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground border-t border-border/50 mt-2">
            {lastInteraction && interactionLabel && (
              <span className="inline-flex items-center gap-1">
                <interactionLabel.icon className="h-3 w-3" />
                {interactionLabel.label} {formatDistanceToNow(new Date(lastInteraction.date), { locale: fr, addSuffix: true })}
              </span>
            )}
            {latestPreview && (latestPreview.view_count || 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <Eye className="h-3 w-3" />
                Aperçu vu {latestPreview.view_count}×
              </span>
            )}
            {prospect.tags && prospect.tags.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {prospect.tags.length} tag{prospect.tags.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
