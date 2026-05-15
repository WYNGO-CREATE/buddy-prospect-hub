import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profil")({
  component: ProfilPage,
  head: () => ({ meta: [{ title: "Mon profil — Wyngo Workspace" }] }),
});

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Nom requis").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

const passwordSchema = z
  .object({
    password: z.string().min(8, "Au moins 8 caractères").max(128),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

function ProfilPage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
    }
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.parse({ full_name: fullName, phone });
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: parsed.full_name, phone: parsed.phone || null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Profil mis à jour"),
    onError: (e: any) => toast.error(e.issues?.[0]?.message || e.message),
  });

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const changePassword = useMutation({
    mutationFn: async () => {
      passwordSchema.parse({ password: pwd, confirm: pwd2 });
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mot de passe modifié");
      setPwd("");
      setPwd2("");
    },
    onError: (e: any) => toast.error(e.issues?.[0]?.message || e.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <p className="text-muted-foreground">Vos informations personnelles et votre mot de passe</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> Informations personnelles
          </CardTitle>
          <CardDescription>Utilisées dans la signature de vos e-mails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">L'email ne peut pas être modifié ici.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Nom complet *</Label>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="+33 6 12 34 56 78" />
          </div>
          <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
            {saveProfile.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Mot de passe
          </CardTitle>
          <CardDescription>Choisissez un mot de passe d'au moins 8 caractères</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pwd">Nouveau mot de passe</Label>
            <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd2">Confirmer</Label>
            <Input id="pwd2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
          </div>
          <Button onClick={() => changePassword.mutate()} disabled={changePassword.isPending || !pwd}>
            {changePassword.isPending ? "Modification…" : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
