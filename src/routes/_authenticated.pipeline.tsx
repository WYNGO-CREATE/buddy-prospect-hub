import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROSPECT_STATUSES, STATUS_LABELS, STATUS_VARIANTS, type ProspectStatus } from "@/lib/crm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
  head: () => ({ meta: [{ title: "Pipeline — Wyngo Workspace" }] }),
});

function PipelinePage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: prospects } = useQuery({
    queryKey: ["pipeline", scope, user?.id, role],
    queryFn: async () => {
      let q = supabase.from("prospects").select("*").order("updated_at", { ascending: false });
      if (role !== "admin" || scope === "mine") q = q.eq("owner_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProspectStatus }) => {
      const { error } = await supabase.from("prospects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
      toast.success("Statut mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onDrop(status: ProspectStatus) {
    if (!dragId) return;
    const p = prospects?.find((x) => x.id === dragId);
    setDragId(null);
    if (!p || p.status === status) return;
    updateStatus.mutate({ id: dragId, status });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Pipeline</h1>
          <p className="text-muted-foreground">Glissez-déposez les cartes pour changer leur statut</p>
        </div>
        {role === "admin" && (
          <Select value={scope} onValueChange={(v) => setScope(v as any)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Mes prospects</SelectItem>
              <SelectItem value="team">Équipe entière</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex gap-3 min-w-max">
          {PROSPECT_STATUSES.map((status) => {
            const cards = (prospects || []).filter((p) => p.status === status);
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(status)}
                className="w-72 flex-shrink-0 bg-muted/30 rounded-lg p-3 min-h-[60vh]"
              >
                <div className={cn("text-xs font-semibold px-2 py-1 rounded mb-3 border inline-block", STATUS_VARIANTS[status])}>
                  {STATUS_LABELS[status]} · {cards.length}
                </div>
                <div className="space-y-2">
                  {cards.map((p) => (
                    <Card
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                      className={cn(
                        "cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow",
                        dragId === p.id && "opacity-50",
                      )}
                    >
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <Link
                              to="/prospects/$id"
                              params={{ id: p.id }}
                              className="font-medium text-sm hover:underline block truncate"
                            >
                              {p.first_name} {p.last_name}
                            </Link>
                            {p.company && (
                              <div className="text-xs text-muted-foreground truncate">{p.company}</div>
                            )}
                            {(p.tags || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {(p.tags || []).slice(0, 2).map((t: string) => (
                                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {cards.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-8 border border-dashed rounded">
                      Aucun prospect
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
