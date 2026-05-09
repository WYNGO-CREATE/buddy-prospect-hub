import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check } from "lucide-react";
import { format, isPast } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relances")({
  component: RelancesPage,
  head: () => ({ meta: [{ title: "Relances — Wyngo Workspace" }] }),
});

function useFollowUps(filter: "upcoming" | "overdue" | "completed") {
  return useQuery({
    queryKey: ["followups-list", filter],
    queryFn: async () => {
      let q = supabase
        .from("follow_ups")
        .select("id, scheduled_at, reason, completed, prospect_id, prospects(first_name, last_name, company)")
        .order("scheduled_at", { ascending: filter !== "completed" });
      if (filter === "completed") q = q.eq("completed", true);
      else q = q.eq("completed", false);
      const { data, error } = await q;
      if (error) throw error;
      const now = new Date();
      if (filter === "upcoming") return (data || []).filter((f) => new Date(f.scheduled_at) >= now);
      if (filter === "overdue") return (data || []).filter((f) => new Date(f.scheduled_at) < now);
      return data || [];
    },
  });
}

function FollowUpList({ filter }: { filter: "upcoming" | "overdue" | "completed" }) {
  const qc = useQueryClient();
  const { data, isLoading } = useFollowUps(filter);
  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("follow_ups").update({ completed: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups-list"] });
      toast.success("Relance terminée");
    },
  });

  if (isLoading) return <p className="text-muted-foreground p-4">Chargement…</p>;
  if (!data || data.length === 0) return <p className="text-muted-foreground p-4">Aucune relance.</p>;

  return (
    <ul className="divide-y">
      {data.map((f: any) => {
        const overdue = !f.completed && isPast(new Date(f.scheduled_at));
        return (
          <li key={f.id} className="py-3 flex items-center justify-between gap-4">
            <div className="flex-1">
              <Link to="/prospects/$id" params={{ id: f.prospect_id }} className="font-medium hover:underline">
                {f.prospects?.first_name} {f.prospects?.last_name}
              </Link>
              {f.prospects?.company && <span className="text-muted-foreground text-sm"> · {f.prospects.company}</span>}
              {f.reason && <p className="text-sm text-muted-foreground">{f.reason}</p>}
            </div>
            <div className="text-right">
              <div className={overdue ? "text-sm font-medium text-rose-600" : "text-sm text-muted-foreground"}>
                {format(new Date(f.scheduled_at), "PPp", { locale: fr })}
              </div>
              {!f.completed && (
                <Button size="sm" variant="outline" className="mt-1" onClick={() => complete.mutate(f.id)}>
                  <Check className="h-4 w-4 mr-1" /> Terminer
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RelancesPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Relances</h1>
        <p className="text-muted-foreground">Planifiez et suivez vos rappels</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Vos relances</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="upcoming">
            <TabsList>
              <TabsTrigger value="upcoming">À venir</TabsTrigger>
              <TabsTrigger value="overdue">En retard</TabsTrigger>
              <TabsTrigger value="completed">Terminées</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming"><FollowUpList filter="upcoming" /></TabsContent>
            <TabsContent value="overdue"><FollowUpList filter="overdue" /></TabsContent>
            <TabsContent value="completed"><FollowUpList filter="completed" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
