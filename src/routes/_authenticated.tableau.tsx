import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, PhoneCall, Star, Trophy, CalendarClock, Activity, Medal, Mail, Send, MessageSquareReply, TrendingUp, Workflow as WorkflowIcon } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/tableau")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Tableau de bord — Wyngo Workspace" }] }),
});

function useStats(scope: "mine" | "all", userId?: string) {
  return useQuery({
    queryKey: ["stats", scope, userId],
    enabled: scope === "all" || !!userId,
    queryFn: async () => {
      const filter = (q: any) => (scope === "mine" ? q.eq("owner_id", userId) : q);
      const [prospects, calls, interested, converted, followups] = await Promise.all([
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
      ]);
      return {
        prospects: prospects.count ?? 0,
        calls: calls.count ?? 0,
        interested: interested.count ?? 0,
        converted: converted.count ?? 0,
        upcoming: followups.data ?? [],
      };
    },
  });
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-6 w-6" />
        </div>
      </CardContent>
    </Card>
  );
}

function useEmailKpis(scope: "mine" | "all", userId?: string) {
  return useQuery({
    queryKey: ["email-kpis", scope, userId],
    enabled: scope === "all" || !!userId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const filterOwner = (q: any) => (scope === "mine" ? q.eq("owner_id", userId) : q);

      const [sent30, received30, activeRuns, completedRuns] = await Promise.all([
        filterOwner(
          supabase.from("messages").select("*", { count: "exact", head: true })
            .eq("channel", "email").eq("direction", "outbound").gte("occurred_at", since),
        ),
        filterOwner(
          supabase.from("messages").select("*", { count: "exact", head: true })
            .eq("channel", "email").eq("direction", "inbound").gte("occurred_at", since),
        ),
        filterOwner(
          supabase.from("workflow_runs").select("*", { count: "exact", head: true }).eq("status", "running"),
        ),
        filterOwner(
          supabase.from("workflow_runs").select("*", { count: "exact", head: true }).eq("status", "completed"),
        ),
      ]);

      const sent = sent30.count ?? 0;
      const received = received30.count ?? 0;
      const replyRate = sent > 0 ? Math.round((received / sent) * 100) : 0;

      return {
        sent,
        received,
        replyRate,
        activeRuns: activeRuns.count ?? 0,
        completedRuns: completedRuns.count ?? 0,
      };
    },
  });
}

function StatsView({ scope, userId }: { scope: "mine" | "all"; userId?: string }) {
  const { data, isLoading } = useStats(scope, userId);
  const { data: emailKpis } = useEmailKpis(scope, userId);
  if (isLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Prospects" value={data.prospects} color="bg-blue-500/15 text-blue-600" />
        <StatCard icon={PhoneCall} label="Appels effectués" value={data.calls} color="bg-violet-500/15 text-violet-600" />
        <StatCard icon={Star} label="Intéressés" value={data.interested} color="bg-amber-500/15 text-amber-600" />
        <StatCard icon={Trophy} label="Convertis" value={data.converted} color="bg-emerald-500/15 text-emerald-600" />
      </div>

      {/* KPIs Emails & Workflows */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Mail className="h-3.5 w-3.5" /> Performance emails (30 derniers jours)
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Send} label="Emails envoyés" value={emailKpis?.sent ?? 0} color="bg-sky-500/15 text-sky-600" />
          <StatCard icon={MessageSquareReply} label="Réponses reçues" value={emailKpis?.received ?? 0} color="bg-emerald-500/15 text-emerald-600" />
          <StatCard icon={TrendingUp} label="Taux de réponse" value={`${emailKpis?.replyRate ?? 0}%`} color="bg-violet-500/15 text-violet-600" />
          <StatCard icon={WorkflowIcon} label="Workflows actifs" value={emailKpis?.activeRuns ?? 0} color="bg-amber-500/15 text-amber-600" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Relances à venir
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune relance programmée.</p>
          ) : (
            <ul className="divide-y">
              {data.upcoming.map((f: any) => (
                <li key={f.id} className="py-3 flex items-center justify-between">
                  <div>
                    <Link
                      to="/prospects/$id"
                      params={{ id: f.prospect_id }}
                      className="font-medium hover:underline"
                    >
                      {f.prospects?.first_name} {f.prospects?.last_name}
                    </Link>
                    {f.reason && <p className="text-sm text-muted-foreground">{f.reason}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground">
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Medal className="h-5 w-5 text-amber-500" /> Classement du mois
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun collaborateur.</p>
        ) : (
          <ul className="divide-y">
            {data.map((row: any, i: number) => (
              <li key={row.owner_id} className="py-2 flex items-center gap-3">
                <span className="w-8 text-center text-lg">{medals[i] || `${i + 1}.`}</span>
                <div className="flex-1">
                  <div className="font-medium">{row.owner_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.calls_count} appel(s) · {row.prospects_count} nouveau(x) prospect(s)
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-600">{row.converted_count}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">convertis</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: async () => {
      const [{ data: events }, { data: profiles }] = await Promise.all([
        supabase.from("prospect_events")
          .select("id, event_type, created_at, owner_id, prospect_id, payload, prospects(first_name, last_name)")
          .order("created_at", { ascending: false })
          .limit(15),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      const map = new Map<string, string>();
      (profiles || []).forEach((p) => map.set(p.id, p.full_name || p.email || "—"));
      return { events: events || [], names: map };
    },
  });

  const labels: Record<string, string> = {
    created: "a créé",
    status_changed: "a changé le statut de",
    call_logged: "a appelé",
    follow_up_scheduled: "a programmé une relance pour",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" /> Activité récente de l'équipe
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : data && data.events.length > 0 ? (
          <ul className="space-y-3">
            {data.events.map((e: any) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                <div className="flex-1">
                  <p>
                    <span className="font-medium">{data.names.get(e.owner_id) || "—"}</span>{" "}
                    <span className="text-muted-foreground">{labels[e.event_type] || e.event_type}</span>{" "}
                    <Link to="/prospects/$id" params={{ id: e.prospect_id }} className="font-medium hover:underline">
                      {e.prospects?.first_name} {e.prospects?.last_name}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: fr })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">Aucune activité récente.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { user, role } = useAuth();
  const [tab, setTab] = useState("mine");

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground">Vue d'ensemble de votre activité commerciale</p>
      </div>

      {role === "admin" ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="mine">Mes chiffres</TabsTrigger>
            <TabsTrigger value="all">Vue équipe</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-6">
            <StatsView scope="mine" userId={user?.id} />
          </TabsContent>
          <TabsContent value="all" className="mt-6 space-y-6">
            <StatsView scope="all" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Leaderboard />
              <RecentActivity />
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-6">
          <StatsView scope="mine" userId={user?.id} />
          <Leaderboard />
        </div>
      )}
    </div>
  );
}
