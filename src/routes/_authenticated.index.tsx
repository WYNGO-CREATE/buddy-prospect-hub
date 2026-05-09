import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Users, PhoneCall, Star, Trophy, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Tableau de bord — CRM" }] }),
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

function StatCard({ icon: Icon, label, value, color }: any) {
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

function StatsView({ scope, userId }: { scope: "mine" | "all"; userId?: string }) {
  const { data, isLoading } = useStats(scope, userId);
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
          <TabsContent value="all" className="mt-6">
            <StatsView scope="all" />
          </TabsContent>
        </Tabs>
      ) : (
        <StatsView scope="mine" userId={user?.id} />
      )}
    </div>
  );
}
