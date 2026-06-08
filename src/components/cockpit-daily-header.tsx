/**
 * ─── CockpitDailyHeader — Score quotidien gamifié ──────────────────────
 *
 * Bandeau en haut de /relances qui montre l'avancée du jour :
 *   - Date du jour
 *   - Appels effectués aujourd'hui
 *   - Aperçus générés aujourd'hui
 *   - Emails envoyés aujourd'hui (à des prospects)
 *   - Pipeline : prospects chauds + tièdes
 *   - Bouton "Démarrer ma session" qui lance le mode focus
 *
 * Refresh toutes les 60s (comme le reste du cockpit).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Send, Wand2, Flame, Snowflake, Sparkles, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

const DAY_MS = 86_400_000;

export function CockpitDailyHeader({
  hotCount,
  totalActions,
  onStartSession,
}: {
  hotCount: number;
  totalActions: number;
  onStartSession: () => void;
}) {
  const { user } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["cockpit-daily-stats", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const todayStart = startOfTodayISO();
      const [calls, previews, emails, tiede] = await Promise.all([
        // Appels passés aujourd'hui
        supabase.from("call_logs").select("id", { count: "exact", head: true })
          .eq("owner_id", user!.id).gte("called_at", todayStart),
        // Aperçus générés aujourd'hui
        supabase.from("prospect_previews").select("id", { count: "exact", head: true })
          .eq("generated_by", user!.id).gte("generated_at", todayStart),
        // Emails sortants vers prospects aujourd'hui
        supabase.from("messages").select("id", { count: "exact", head: true })
          .eq("owner_id", user!.id)
          .eq("direction", "outbound")
          .not("prospect_id", "is", null)
          .gte("occurred_at", todayStart),
        // Prospects tièdes = ouvert leur aperçu dans les 7 derniers jours (pas chaud actuel)
        supabase.from("prospect_previews").select("id", { count: "exact", head: true })
          .gte("opened_at", new Date(Date.now() - 7 * DAY_MS).toISOString())
          .lt("opened_at", new Date(Date.now() - DAY_MS).toISOString()),
      ]);
      return {
        callsToday: calls.count ?? 0,
        previewsToday: previews.count ?? 0,
        emailsToday: emails.count ?? 0,
        tiede: tiede.count ?? 0,
      };
    },
  });

  const today = new Date();
  const hour = today.getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
      <div className="p-5 md:p-6 grid md:grid-cols-[1fr_auto] gap-5 items-center">
        {/* Gauche : salutation + stats */}
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-primary">
              {format(today, "EEEE d MMMM yyyy", { locale: fr })}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold mt-1">
              {greeting}, voici ta journée
            </h1>
          </div>

          {/* Stats live */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={Phone} label="Appels" value={stats?.callsToday ?? 0} hint="aujourd'hui" tone="violet" />
            <Stat icon={Wand2} label="Aperçus" value={stats?.previewsToday ?? 0} hint="générés" tone="amber" />
            <Stat icon={Send} label="Emails" value={stats?.emailsToday ?? 0} hint="envoyés" tone="sky" />
            <Stat icon={Flame} label="Chauds" value={hotCount} hint="en attente" tone="orange" />
          </div>

          {/* Pipeline indicator */}
          {(stats?.tiede ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Snowflake className="size-3" />
              {stats?.tiede} prospect(s) tièdes en cycle dans la semaine
            </p>
          )}
        </div>

        {/* Droite : CTA "Démarrer ma session" */}
        <div className="flex flex-col items-stretch md:items-end gap-2">
          {totalActions > 0 ? (
            <>
              <Button
                size="lg"
                onClick={onStartSession}
                className="gap-2 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-700 text-white shadow-lg shadow-primary/30 h-12 px-6"
              >
                <Sparkles className="size-5" />
                Démarrer ma session
                <ChevronRight className="size-4" />
              </Button>
              <p className="text-[11px] text-muted-foreground text-center md:text-right">
                {totalActions} action{totalActions > 1 ? "s" : ""} à traiter · mode focus plein écran
              </p>
            </>
          ) : (
            <div className="text-right">
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">🎉 Tout est à jour</p>
              <p className="text-xs text-muted-foreground mt-0.5">Lance une nouvelle chasse ?</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

const TONE_CLS: Record<string, string> = {
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  amber:  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sky:    "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

function Stat({
  icon: Icon, label, value, hint, tone,
}: {
  icon: React.ElementType; label: string; value: number; hint: string; tone: string;
}) {
  return (
    <div className="rounded-lg border bg-card/60 backdrop-blur-sm p-3 flex items-center gap-3">
      <div className={`size-9 rounded-lg flex items-center justify-center ${TONE_CLS[tone]}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 leading-none">
          {label} <span className="opacity-70">· {hint}</span>
        </div>
      </div>
    </div>
  );
}
