/**
 * ─── /tableau — Tableau de bord (fusion ex /tableau + /logs) ──────────
 *
 * Cette page unifie l'ancien dashboard (KPIs, leaderboard, activité récente)
 * avec l'ancien Journal d'activité (logs avec filtres avancés).
 *
 * Structure :
 *   - 4 KPIs principaux : prospects / appels / intéressés / convertis
 *   - Suivi des appels (couverture) — 3 cards
 *   - Performance emails (30j) — 3 cards
 *     ⚠️ BUG fixé : on filtre désormais sur prospect_id NOT NULL, sinon
 *     on comptait les emails pro personnels non liés à des prospects.
 *   - Vue équipe (admin) : onglets Mes chiffres / Équipe
 *   - Leaderboard du mois (admin)
 *   - Relances à venir (top 5)
 *   - Journal d'activité (admin, filtres search / type / owner)
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, PhoneCall, PhoneOff, Star, Trophy, CalendarClock, Medal, Mail, Send,
  MessageSquareReply, TrendingUp, Search, Activity,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { EVENT_LABELS, STATUS_LABELS } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/tableau")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Tableau de bord — Wyngo Workspace" }] }),
});

// ════════════════════════════════════════════════════════════════════
// KPIs core (prospects, appels, intéressés, convertis, couverture)
// ════════════════════════════════════════════════════════════════════

function useStats(scope: "mine" | "all", userId?: string) {
  return useQuery({
    queryKey: ["stats", scope, userId],
    enabled: scope === "all" || !!userId,
    queryFn: async () => {
      const filter = (q: any) => (scope === "mine" ? q.eq("owner_id", userId) : q);
      const [prospects, calls, interested, converted, followups, allCalls, allProspects] = await Promise.all([
        filter(supabase.from("prospects").select("*", { count: "exact", head: true })),
        filter(supabase.from("call_logs").select("*", { count: "exact", head: true })),
        filter(supabase.from("prospects").select("*", { count: "exact", head: true })).eq("status", "interesse"),
        filter(supabase.from("prospects").select("*", { count: "exact", head: true })).eq("status", "converti"),
        filter(
          supabase
            .from("follow_ups")
            .select("id, scheduled_at, reason, prospect_id, prospects(first_name, last_name)")
            .eq("completed", false)
            .gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at", { ascending: true })
            .limit(5),
        ),
        filter(supabase.from("call_logs").select("prospect_id")),
        filter(supabase.from("prospects").select("id")),
      ]);
      const calledIds = new Set<string>(((allCalls.data || []) as any[]).map((c: any) => c.prospect_id));
      const allIds = new Set<string>(((allProspects.data || []) as any[]).map((p: any) => p.id));
      const calledCount = Array.from(calledIds).filter((id) => allIds.has(id)).length;
      const totalProspects = prospects.count ?? 0;
      const uncalledCount = Math.max(0, totalProspects - calledCount);
      return {
        prospects: totalProspects,
        calls: calls.count ?? 0,
        interested: interested.count ?? 0,
        converted: converted.count ?? 0,
        upcoming: followups.data ?? [],
        calledCount,
        uncalledCount,
      };
    },
  });
}

// ════════════════════════════════════════════════════════════════════
// KPIs Emails — FIX du bug : on ne compte QUE les emails liés à un
// prospect du CRM. Avant, les mails pro personnels (newsletters, perso,
// etc.) sans prospect_id étaient comptés → métriques fausses.
// ════════════════════════════════════════════════════════════════════

function useEmailKpis(scope: "mine" | "all", userId?: string) {
  return useQuery({
    queryKey: ["email-kpis-v2", scope, userId],
    enabled: scope === "all" || !!userId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const filterOwner = (q: any) => (scope === "mine" ? q.eq("owner_id", userId) : q);

      const [sentToProspects, repliedByProspects] = await Promise.all([
        // Emails SORTANTS vers des prospects du CRM (prospect_id != null)
        filterOwner(
          supabase.from("messages").select("*", { count: "exact", head: true })
            .eq("channel", "email")
            .eq("direction", "outbound")
            .not("prospect_id", "is", null)
            .gte("occurred_at", since),
        ),
        // Réponses INBOUND venues de prospects (prospect_id != null)
        filterOwner(
          supabase.from("messages").select("*", { count: "exact", head: true })
            .eq("channel", "email")
            .eq("direction", "inbound")
            .not("prospect_id", "is", null)
            .gte("occurred_at", since),
        ),
      ]);

      const sent = sentToProspects.count ?? 0;
      const received = repliedByProspects.count ?? 0;
      const replyRate = sent > 0 ? Math.round((received / sent) * 100) : 0;

      return { sent, received, replyRate };
    },
  });
}

// ════════════════════════════════════════════════════════════════════
// COMPOSANTS UI
// ════════════════════════════════════════════════════════════════════

function StatCard({
  icon: Icon, label, value, color, hint,
}: {
  icon: any; label: string; value: string | number; color: string; hint?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{label}</p>
          <p className="text-3xl font-bold mt-1 tabular-nums">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{hint}</p>}
        </div>
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </h2>
  );
}

function StatsView({ scope, userId }: { scope: "mine" | "all"; userId?: string }) {
  const { data, isLoading } = useStats(scope, userId);
  const { data: emailKpis } = useEmailKpis(scope, userId);
  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* ─── KPIs principaux ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Prospects" value={data.prospects} color="bg-blue-500/15 text-blue-600 dark:text-blue-400" />
        <StatCard icon={PhoneCall} label="Appels effectués" value={data.calls} color="bg-violet-500/15 text-violet-600 dark:text-violet-400" />
        <StatCard icon={Star} label="Intéressés" value={data.interested} color="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
        <StatCard icon={Trophy} label="Convertis" value={data.converted} color="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* ─── Suivi des appels ─── */}
      <div>
        <SectionTitle icon={PhoneCall}>Suivi des appels</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard icon={PhoneCall} label="Déjà appelés" value={data.calledCount} color="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" />
          <StatCard icon={PhoneOff} label="Pas encore appelés" value={data.uncalledCount} color="bg-rose-500/15 text-rose-600 dark:text-rose-400" />
          <StatCard
            icon={TrendingUp}
            label="Prospects contactés"
            value={`${data.prospects > 0 ? Math.round((data.calledCount / data.prospects) * 100) : 0}%`}
            color="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            hint="Part de tes prospects appelés au moins une fois"
          />
        </div>
      </div>

      {/* ─── Performance emails (30 derniers jours) ─── */}
      <div>
        <SectionTitle icon={Mail}>
          Performance emails — prospects uniquement (30 derniers jours)
        </SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Send}
            label="Envoyés à des prospects"
            value={emailKpis?.sent ?? 0}
            color="bg-sky-500/15 text-sky-600 dark:text-sky-400"
            hint="Liés à un prospect du CRM uniquement"
          />
          <StatCard
            icon={MessageSquareReply}
            label="Réponses reçues"
            value={emailKpis?.received ?? 0}
            color="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            hint="Réponses entrantes des prospects"
          />
          <StatCard
            icon={TrendingUp}
            label="Taux de réponse"
            value={`${emailKpis?.replyRate ?? 0}%`}
            color="bg-violet-500/15 text-violet-600 dark:text-violet-400"
            hint="Réponses ÷ Envoyés"
          />
        </div>
      </div>

      {/* ─── Relances à venir ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-amber-500" /> Prochaines relances
          </CardTitle>
          <CardDescription className="text-xs">5 prochaines relances planifiées</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.upcoming.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground italic">Aucune relance programmée.</p>
          ) : (
            <ul className="divide-y">
              {data.upcoming.map((f: any) => (
                <li key={f.id} className="px-6 py-3 flex items-center justify-between hover:bg-muted/40 transition gap-3">
                  <div className="min-w-0">
                    <Link
                      to="/prospects/$id"
                      params={{ id: f.prospect_id }}
                      className="font-medium hover:underline"
                    >
                      {f.prospects?.first_name} {f.prospects?.last_name}
                    </Link>
                    {f.reason && <p className="text-xs text-muted-foreground truncate">{f.reason}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(f.scheduled_at), "PPp", { locale: fr })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// LEADERBOARD (admin uniquement, dans la vue équipe)
// ════════════════════════════════════════════════════════════════════

function Leaderboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leaderboard_month");
      if (error) throw error;
      return data as any[];
    },
  });
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Medal className="h-4 w-4 text-amber-500" /> Classement du mois
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Chargement…</p>
        ) : !data || data.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground italic">Aucun collaborateur.</p>
        ) : (
          <ul className="divide-y">
            {data.map((row: any, i: number) => (
              <li key={row.owner_id} className="px-6 py-3 flex items-center gap-3">
                <span className="w-8 text-center text-lg flex-shrink-0">{medals[i] || `${i + 1}.`}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{row.owner_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.calls_count} appel(s) · {row.prospects_count} nouveau(x)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{row.converted_count}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">convertis</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════
// JOURNAL D'ACTIVITÉ INTÉGRÉ (anciennement /logs)
// Avec filtres search / type / owner
// ════════════════════════════════════════════════════════════════════

const EVENT_TYPES = ["all", "created", "status_changed", "call_logged", "follow_up_scheduled"];

function ActivityJournal() {
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const { data: profiles } = useQuery({
    queryKey: ["profiles-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles || []).forEach((p) => m.set(p.id, p.full_name || p.email || "—"));
    return m;
  }, [profiles]);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events-log", eventType, ownerFilter],
    queryFn: async () => {
      let q = supabase
        .from("prospect_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (eventType !== "all") q = q.eq("event_type", eventType);
      if (ownerFilter !== "all") q = q.eq("owner_id", ownerFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: prospectMap } = useQuery({
    queryKey: ["prospect-map-for-logs", events?.length],
    enabled: !!events && events.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(events!.map((e: any) => e.prospect_id)));
      const { data } = await supabase.from("prospects").select("id, first_name, last_name, company").in("id", ids);
      const m = new Map<string, { name: string; company: string | null }>();
      (data || []).forEach((p: any) =>
        m.set(p.id, { name: `${p.first_name} ${p.last_name}`, company: p.company }),
      );
      return m;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return events || [];
    const s = search.toLowerCase();
    return (events || []).filter((e: any) => {
      const p = prospectMap?.get(e.prospect_id);
      const author = profileMap.get(e.owner_id) || "";
      return (
        p?.name?.toLowerCase().includes(s) ||
        p?.company?.toLowerCase().includes(s) ||
        author.toLowerCase().includes(s)
      );
    });
  }, [events, search, prospectMap, profileMap]);

  function describe(ev: any): string {
    if (ev.event_type === "status_changed") {
      const from = (STATUS_LABELS as Record<string, string>)[ev.payload?.from] || ev.payload?.from;
      const to = (STATUS_LABELS as Record<string, string>)[ev.payload?.to] || ev.payload?.to;
      return `${from} → ${to}`;
    }
    if (ev.event_type === "call_logged") {
      const outcome = ev.payload?.outcome ? ` · ${ev.payload.outcome}` : "";
      const dur = ev.payload?.duration ? ` · ${ev.payload.duration} min` : "";
      return `Appel${outcome}${dur}`;
    }
    if (ev.event_type === "follow_up_scheduled") {
      const at = ev.payload?.scheduled_at ? format(new Date(ev.payload.scheduled_at), "PP", { locale: fr }) : "";
      return `Relance prévue ${at}${ev.payload?.reason ? ` — ${ev.payload.reason}` : ""}`;
    }
    if (ev.event_type === "created") return "Nouveau prospect ajouté";
    return "";
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Journal d'activité de l'équipe
        </CardTitle>
        <CardDescription className="text-xs">
          Toutes les actions des collaborateurs avec filtres avancés (recherche, type, commercial)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {/* Filtres */}
        <div className="p-4 border-b flex flex-wrap gap-3 items-center bg-muted/20">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (prospect, commercial)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t === "all" ? "Tous les événements" : EVENT_LABELS[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les commerciaux</SelectItem>
              {(profiles || []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Liste scrollable */}
        {isLoading ? (
          <p className="p-6 text-muted-foreground text-sm">Chargement…</p>
        ) : filtered.length > 0 ? (
          <ul className="divide-y max-h-[600px] overflow-y-auto">
            {filtered.map((ev: any) => {
              const p = prospectMap?.get(ev.prospect_id);
              return (
                <li key={ev.id} className="p-4 flex items-start gap-3 hover:bg-muted/30 transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase tracking-wider">
                        {EVENT_LABELS[ev.event_type] || ev.event_type}
                      </span>
                      {p && (
                        <Link to="/prospects/$id" params={{ id: ev.prospect_id }} className="font-medium hover:underline">
                          {p.name}{p.company ? ` — ${p.company}` : ""}
                        </Link>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{describe(ev)}</p>
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground whitespace-nowrap">
                    <div className="font-medium">{profileMap.get(ev.owner_id) || "—"}</div>
                    <div>{format(new Date(ev.created_at), "Pp", { locale: fr })}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-12 text-center text-muted-foreground text-sm italic">Aucun événement</div>
        )}
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ════════════════════════════════════════════════════════════════════

function DashboardPage() {
  const { user, role } = useAuth();
  const [tab, setTab] = useState("mine");

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground">
          {role === "admin"
            ? "Vue d'ensemble de l'activité commerciale — individuelle & équipe"
            : "Vue d'ensemble de votre activité commerciale"}
        </p>
      </div>

      {role === "admin" ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="mine">Mes chiffres</TabsTrigger>
            <TabsTrigger value="all">Vue équipe</TabsTrigger>
          </TabsList>

          <TabsContent value="mine" className="mt-6">
            <StatsView scope="mine" userId={user?.id} />
          </TabsContent>

          <TabsContent value="all" className="mt-6 space-y-6">
            <StatsView scope="all" />
            <Leaderboard />
            {/* Journal d'activité intégré (anciennement /logs) */}
            <ActivityJournal />
          </TabsContent>
        </Tabs>
      ) : (
        <StatsView scope="mine" userId={user?.id} />
      )}
    </div>
  );
}
