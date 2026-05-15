import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Snowflake } from "lucide-react";
import { STATUS_LABELS, STATUS_VARIANTS, type ProspectStatus } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/froids")({
  component: ColdProspectsPage,
  head: () => ({ meta: [{ title: "Prospects froids — Wyngo Workspace" }] }),
});

const COLD_DAYS_OPTIONS = [14, 30, 60, 90];

function ColdProspectsPage() {
  const { user, role } = useAuth();
  const [days, setDays] = useState(30);
  const [scope, setScope] = useState<"mine" | "team">("mine");

  const { data: lastContacts } = useQuery({
    queryKey: ["last-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("prospects_last_contact");
      if (error) throw error;
      return (data || []) as Array<{ prospect_id: string; last_contact_at: string }>;
    },
  });

  const lastContactMap = useMemo(() => {
    const m = new Map<string, string>();
    (lastContacts || []).forEach((r) => m.set(r.prospect_id, r.last_contact_at));
    return m;
  }, [lastContacts]);

  const { data: profiles } = useQuery({
    queryKey: ["profiles-min"],
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

  const { data: prospects } = useQuery({
    queryKey: ["cold-prospects", scope, user?.id, role],
    queryFn: async () => {
      let q = supabase
        .from("prospects")
        .select("*")
        .not("status", "in", "(converti,perdu)");
      if (role !== "admin" || scope === "mine") q = q.eq("owner_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const cold = useMemo(() => {
    if (!prospects || !lastContactMap.size) return [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return prospects
      .map((p) => ({ ...p, last_contact_at: lastContactMap.get(p.id) || p.created_at }))
      .filter((p) => new Date(p.last_contact_at).getTime() < cutoff)
      .sort((a, b) => new Date(a.last_contact_at).getTime() - new Date(b.last_contact_at).getTime());
  }, [prospects, lastContactMap, days]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Snowflake className="h-7 w-7 text-blue-500" /> Prospects froids
          </h1>
          <p className="text-muted-foreground">Prospects sans contact depuis {days} jours ou plus</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLD_DAYS_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>Plus de {d} jours</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {role === "admin" && (
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Mes prospects</SelectItem>
                <SelectItem value="team">Équipe entière</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {cold.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prospect</TableHead>
                  <TableHead>Société</TableHead>
                  <TableHead>Dernier contact</TableHead>
                  {role === "admin" && scope === "team" && <TableHead>Propriétaire</TableHead>}
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cold.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link to="/prospects/$id" params={{ id: p.id }} className="font-medium hover:underline">
                        {p.first_name} {p.last_name}
                      </Link>
                      {(p.email || p.phone) && (
                        <div className="text-xs text-muted-foreground">{p.email || p.phone}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.company || "—"}</TableCell>
                    <TableCell className="text-amber-600 dark:text-amber-400 text-sm">
                      Il y a {formatDistanceToNow(new Date(p.last_contact_at), { locale: fr })}
                    </TableCell>
                    {role === "admin" && scope === "team" && (
                      <TableCell className="text-xs text-muted-foreground">{profileMap.get(p.owner_id) || "—"}</TableCell>
                    )}
                    <TableCell>
                      <span className={cn("text-xs px-2 py-1 rounded border inline-block", STATUS_VARIANTS[p.status as ProspectStatus])}>
                        {STATUS_LABELS[p.status as ProspectStatus]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              🎉 Aucun prospect froid. Tous vos contacts sont à jour !
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
