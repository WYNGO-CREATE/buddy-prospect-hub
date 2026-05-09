import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/equipe")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r) => r.role === "admin")) throw redirect({ to: "/" });
  },
  component: EquipePage,
  head: () => ({ meta: [{ title: "Équipe — Wyngo Workspace" }] }),
});

function EquipePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["team-stats"],
    queryFn: async () => {
      const [{ data: profiles }, { data: prospects }, { data: calls }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, created_at"),
        supabase.from("prospects").select("owner_id, status"),
        supabase.from("call_logs").select("owner_id"),
      ]);
      return (profiles || []).map((p) => {
        const own = (prospects || []).filter((x) => x.owner_id === p.id);
        return {
          ...p,
          total: own.length,
          interested: own.filter((x) => x.status === "interesse").length,
          converted: own.filter((x) => x.status === "converti").length,
          calls: (calls || []).filter((x) => x.owner_id === p.id).length,
        };
      });
    },
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Équipe</h1>
        <p className="text-muted-foreground">Performance des collaborateurs</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Collaborateurs</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-muted-foreground">Chargement…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collaborateur</TableHead>
                  <TableHead className="text-right">Prospects</TableHead>
                  <TableHead className="text-right">Appels</TableHead>
                  <TableHead className="text-right">Intéressés</TableHead>
                  <TableHead className="text-right">Convertis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data || []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.full_name || p.email}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </TableCell>
                    <TableCell className="text-right">{p.total}</TableCell>
                    <TableCell className="text-right">{p.calls}</TableCell>
                    <TableCell className="text-right">{p.interested}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">{p.converted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
