import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EMAIL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  VAR_LABELS,
  renderTemplate,
  type EmailTemplate,
  type TemplateVar,
} from "@/lib/email-templates";
import { Copy, Check, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mails")({
  component: MailsPage,
});

function MailsPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";

  // Profil courant (nom, email, téléphone)
  const { data: profile } = useQuery({
    queryKey: ["profile-me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name,email,phone")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  // Réglages de l'agence (partagés)
  const { data: agency } = useQuery({
    queryKey: ["agency-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agency_settings")
        .select("name,logo_url,website_url")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  // États édition téléphone (membre courant)
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (profile?.phone != null) setPhone(profile.phone ?? "");
  }, [profile?.phone]);

  const savePhone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ phone: phone.trim() || null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Téléphone mis à jour");
      qc.invalidateQueries({ queryKey: ["profile-me"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });

  // États édition agence
  const [agencyName, setAgencyName] = useState("");
  const [agencyLogo, setAgencyLogo] = useState("");
  const [agencyWebsite, setAgencyWebsite] = useState("");
  useEffect(() => {
    setAgencyName(agency?.name ?? "");
    setAgencyLogo(agency?.logo_url ?? "");
    setAgencyWebsite(agency?.website_url ?? "");
  }, [agency?.name, agency?.logo_url, agency?.website_url]);

  const saveAgency = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("agency_settings")
        .update({
          name: agencyName.trim(),
          logo_url: agencyLogo.trim() || null,
          website_url: agencyWebsite.trim() || null,
        })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Réglages de l'agence mis à jour");
      qc.invalidateQueries({ queryKey: ["agency-settings"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });

  // Sélection du template + variables saisies par l'utilisateur
  const [selectedId, setSelectedId] = useState<string>(EMAIL_TEMPLATES[0].id);
  const selected: EmailTemplate =
    EMAIL_TEMPLATES.find((t) => t.id === selectedId) ?? EMAIL_TEMPLATES[0];
  const [vars, setVars] = useState<Record<string, string>>({});

  const signature = useMemo(
    () => ({
      senderName: profile?.full_name ?? "",
      senderEmail: profile?.email ?? user?.email ?? "",
      senderPhone: phone,
      agencyName: agencyName,
      agencyWebsite: agencyWebsite,
    }),
    [profile, user, phone, agencyName, agencyWebsite],
  );

  const renderedSubject = renderTemplate(selected.subject, vars, signature);
  const renderedBody = renderTemplate(selected.body, vars, signature);

  const [copied, setCopied] = useState<"subject" | "body" | "both" | null>(null);
  const copy = async (text: string, key: "subject" | "body" | "both") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copié dans le presse-papier");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Impossible de copier");
    }
  };

  const grouped = TEMPLATE_CATEGORIES.map((cat) => ({
    cat,
    items: EMAIL_TEMPLATES.filter((t) => t.category === cat.id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Modèles d'e-mails</h1>
        <p className="text-sm text-muted-foreground">
          Modèles prêts à personnaliser pour gagner du temps. Remplis les variables, copie, envoie.
        </p>
      </div>

      {/* Bloc signature & agence */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ma signature</CardTitle>
            <CardDescription>Utilisée automatiquement à la fin de chaque mail</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nom complet</Label>
                <Input value={profile?.full_name ?? ""} disabled />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={profile?.email ?? user?.email ?? ""} disabled />
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Téléphone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+33 6 12 34 56 78"
                />
              </div>
              <Button onClick={() => savePhone.mutate()} disabled={savePhone.isPending} size="sm">
                <Save className="h-4 w-4 mr-1" /> Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agence</CardTitle>
            <CardDescription>
              Partagé par toute l'équipe {isAdmin ? "" : "· lecture seule"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Nom de l'agence</Label>
              <Input
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">URL du logo</Label>
                <Input
                  value={agencyLogo}
                  onChange={(e) => setAgencyLogo(e.target.value)}
                  placeholder="https://..."
                  disabled={!isAdmin}
                />
              </div>
              <div>
                <Label className="text-xs">Site web</Label>
                <Input
                  value={agencyWebsite}
                  onChange={(e) => setAgencyWebsite(e.target.value)}
                  placeholder="https://..."
                  disabled={!isAdmin}
                />
              </div>
            </div>
            {isAdmin && (
              <Button onClick={() => saveAgency.mutate()} disabled={saveAgency.isPending} size="sm">
                <Save className="h-4 w-4 mr-1" /> Enregistrer
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Templates */}
      <Tabs defaultValue={TEMPLATE_CATEGORIES[0].id}>
        <TabsList className="flex flex-wrap h-auto">
          {TEMPLATE_CATEGORIES.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {grouped.map(({ cat, items }) => (
          <TabsContent key={cat.id} value={cat.id} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedId(t.id);
                    setVars({});
                  }}
                  className={`text-left rounded-md border p-3 transition hover:border-primary/60 ${
                    selectedId === t.id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="font-medium text-sm">{t.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
                </button>
              ))}
            </div>

            {items.some((t) => t.id === selectedId) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{selected.title}</CardTitle>
                  <CardDescription>{selected.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selected.vars.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {selected.vars.map((v: TemplateVar) => (
                        <div key={v}>
                          <Label className="text-xs">{VAR_LABELS[v]}</Label>
                          <Input
                            value={vars[v] ?? ""}
                            onChange={(e) =>
                              setVars((prev) => ({ ...prev, [v]: e.target.value }))
                            }
                            placeholder={`{{${v}}}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Objet</Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copy(renderedSubject, "subject")}
                      >
                        {copied === "subject" ? (
                          <Check className="h-3 w-3 mr-1" />
                        ) : (
                          <Copy className="h-3 w-3 mr-1" />
                        )}
                        Copier
                      </Button>
                    </div>
                    <Input value={renderedSubject} readOnly />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Corps du message</Label>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copy(renderedBody, "body")}
                        >
                          {copied === "body" ? (
                            <Check className="h-3 w-3 mr-1" />
                          ) : (
                            <Copy className="h-3 w-3 mr-1" />
                          )}
                          Copier le corps
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            copy(`${renderedSubject}\n\n${renderedBody}`, "both")
                          }
                        >
                          {copied === "both" ? (
                            <Check className="h-3 w-3 mr-1" />
                          ) : (
                            <Copy className="h-3 w-3 mr-1" />
                          )}
                          Tout copier
                        </Button>
                      </div>
                    </div>
                    <Textarea value={renderedBody} readOnly className="min-h-[420px] font-mono text-xs" />
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
