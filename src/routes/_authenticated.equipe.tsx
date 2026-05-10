import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/equipe")({
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/login" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r) => r.role === "admin")) throw redirect({ to: "/prospects" });
  },
  component: EquipePage,
  head: () => ({ meta: [{ title: "Équipe — Wyngo Workspace" }] }),
});

function InviteDialog({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"collaborator" | "admin">("collaborator");
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail(""); setFullName(""); setRole("collaborator"); setCredentials(null); setCopied(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("invite-collaborator", {
      body: { email, full_name: fullName, role },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Erreur");
      return;
    }
    setCredentials({ email: data.email, password: data.password });
    onInvited();
  }

  async function copy() {
    if (!credentials) return;
    await navigator.clipboard.writeText(
      `Email : ${credentials.email}\nMot de passe temporaire : ${credentials.password}`,
    );
    setCopied(true);
    toast.success("Identifiants copiés");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}
    >
      <DialogTrigger asChild>
        <Button><UserPlus className="h-4 w-4 mr-2" /> Inviter un collaborateur</Button>
      </DialogTrigger>
      <DialogContent>
        {!credentials ? (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Inviter un collaborateur</DialogTitle>
              <DialogDescription>
                Un compte sera créé avec un mot de passe temporaire que vous pourrez transmettre.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="inv-name">Nom complet</Label>
              <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collaborator">Collaborateur</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Création…" : "Créer le compte"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Compte créé ✓</DialogTitle>
              <DialogDescription>
                Transmettez ces identifiants à votre collaborateur. Le mot de passe ne sera plus affiché.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 font-mono text-sm">
              <div><span className="text-muted-foreground">Email :</span> {credentials.email}</div>
              <div><span className="text-muted-foreground">Mot de passe :</span> {credentials.password}</div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={copy}>
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copier
              </Button>
              <Button onClick={() => { setOpen(false); reset(); }}>Fermer</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EquipePage() {
  const { data, isLoading, refetch } = useQuery({
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Équipe</h1>
          <p className="text-muted-foreground">Performance des collaborateurs</p>
        </div>
        <InviteDialog onInvited={() => refetch()} />
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
