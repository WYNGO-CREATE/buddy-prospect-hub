import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Copy, Check, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
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

function DeleteCollaboratorDialog({
  collaborator,
  onDeleted,
}: {
  collaborator: { id: string; full_name: string | null; email: string; total: number; calls: number };
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const expectedConfirm = (collaborator.full_name || collaborator.email).trim();

  const del = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("delete-collaborator", {
        body: { user_id: collaborator.id },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = await (error as { context?: { json?: () => Promise<unknown> } }).context?.json?.();
          if ((ctx as { error?: string })?.error) detail = (ctx as { error: string }).error;
        } catch {/* noop */}
        throw new Error(detail);
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { stats: Record<string, number> };
    },
    onSuccess: (data) => {
      const reassigned = data.stats?.prospects_reassigned ?? 0;
      const calls = data.stats?.call_logs_reassigned ?? 0;
      toast.success("Collaborateur supprimé", {
        description: reassigned > 0 || calls > 0
          ? `${reassigned} prospects et ${calls} appels réassignés vers toi.`
          : "Aucune donnée à réassigner.",
      });
      setOpen(false);
      setConfirmText("");
      onDeleted();
    },
    onError: (e: Error) => toast.error("Suppression échouée", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirmText(""); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          title="Supprimer définitivement"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <AlertTriangle className="h-5 w-5" />
            Supprimer ce collaborateur ?
          </DialogTitle>
          <DialogDescription>
            Cette action est <strong>irréversible</strong>. Le compte sera supprimé définitivement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{collaborator.full_name || "Sans nom"}</p>
            <p className="text-xs text-muted-foreground">{collaborator.email}</p>
          </div>

          {(collaborator.total > 0 || collaborator.calls > 0) && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200 mb-1">
                Réassignation automatique vers toi :
              </p>
              <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 pl-4 list-disc">
                {collaborator.total > 0 && <li>{collaborator.total} prospect(s)</li>}
                {collaborator.calls > 0 && <li>{collaborator.calls} appel(s) loggé(s)</li>}
                <li>Follow-ups et commentaires</li>
              </ul>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 italic">
                Aucune donnée perdue — tout est récupéré sous ton ownership.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="confirm-input" className="text-xs">
              Pour confirmer, retape exactement <code className="px-1 py-0.5 rounded bg-muted text-foreground">{expectedConfirm}</code> :
            </Label>
            <Input
              id="confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedConfirm}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={del.isPending}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => del.mutate()}
            disabled={del.isPending || confirmText.trim() !== expectedConfirm}
            className="gap-2"
          >
            {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Supprimer définitivement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EquipePage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["team-stats"],
    queryFn: async () => {
      const [{ data: profiles }, { data: prospects }, { data: calls }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, created_at, is_active"),
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

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["team-stats"] });
      toast.success(vars.active ? "Collaborateur réactivé" : "Collaborateur désactivé");
    },
    onError: (e: Error) => toast.error(e.message),
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
                  <TableHead className="text-right">Actif</TableHead>
                  <TableHead className="text-right w-12">{/* Actions */}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data || []).map((p) => (
                  <TableRow key={p.id} className={p.is_active === false ? "opacity-50" : ""}>
                    <TableCell>
                      <div className="font-medium">
                        {p.full_name || p.email}
                        {p.is_active === false && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Désactivé</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </TableCell>
                    <TableCell className="text-right">{p.total}</TableCell>
                    <TableCell className="text-right">{p.calls}</TableCell>
                    <TableCell className="text-right">{p.interested}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">{p.converted}</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={p.is_active !== false}
                        onCheckedChange={(checked) => toggleActive.mutate({ id: p.id, active: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right p-2">
                      {/* L'admin ne peut pas se supprimer lui-même */}
                      {currentUser?.id !== p.id && (
                        <DeleteCollaboratorDialog
                          collaborator={{
                            id: p.id,
                            full_name: p.full_name,
                            email: p.email,
                            total: p.total,
                            calls: p.calls,
                          }}
                          onDeleted={() => qc.invalidateQueries({ queryKey: ["team-stats"] })}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Désactiver</strong> (switch) : déconnecte et bloque la reconnexion, sans supprimer les données. Réversible.</p>
        <p><strong>Supprimer</strong> (🗑️) : efface définitivement le compte. Les prospects, appels, follow-ups sont automatiquement réassignés à toi.</p>
      </div>
    </div>
  );
}
