import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenLine, Save, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Aperçu live de la signature email qui sera ajoutée à chaque envoi.
 * — Wordmark Wyngo par défaut
 * — Option d'uploader un logo personnalisé (override)
 */
export function SignaturePreviewCard() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";

  const { data: profile } = useQuery({
    queryKey: ["my-profile-sig", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: agency } = useQuery({
    queryKey: ["agency-sig"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agency_settings")
        .select("name, website_url, logo_url")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  const [logoUrl, setLogoUrl] = useState("");
  useEffect(() => {
    if (agency) setLogoUrl(agency.logo_url || "");
  }, [agency]);

  const saveLogo = useMutation({
    mutationFn: async (url: string | null) => {
      const { error } = await supabase
        .from("agency_settings")
        .update({ logo_url: url })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Logo mis à jour");
      qc.invalidateQueries({ queryKey: ["agency-sig"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5" /> Signature email
        </CardTitle>
        <CardDescription>
          Cette signature est ajoutée automatiquement à chaque email envoyé depuis l'app (Inbox & Workflows).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Aperçu de la signature */}
        <div className="rounded-lg border-2 border-dashed bg-white p-6">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-4">Aperçu (ce que le destinataire verra)</p>

          <div className="text-sm text-foreground space-y-1 mb-6 leading-relaxed">
            <p>Bonjour Marie,</p>
            <p>Merci pour notre échange — voici l'email que je vous mentionnais.</p>
            <p>(corps de votre email)</p>
          </div>

          <div className="border-t pt-5">
            {/* Wordmark ou logo image */}
            {agency?.logo_url ? (
              <img
                src={agency.logo_url}
                alt={agency.name || "Logo"}
                className="block max-w-[120px] h-auto mb-3"
              />
            ) : (
              <div className="mb-3">
                <span
                  className="inline-block"
                  style={{
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: "28px",
                    fontWeight: 400,
                    letterSpacing: "-0.5px",
                    color: "#0a0a0a",
                    lineHeight: 1,
                  }}
                >
                  {agency?.name || "Wyngo"}
                  <span style={{ color: "#b8997f" }}>.</span>
                </span>
                <div
                  style={{
                    fontSize: "10px",
                    letterSpacing: "1.2px",
                    textTransform: "uppercase",
                    color: "#8a8a8a",
                    marginTop: "6px",
                    fontWeight: 500,
                  }}
                >
                  Cabinet privé de création digitale
                </div>
              </div>
            )}

            {/* Contact lines */}
            <div className="space-y-0.5">
              {profile?.full_name && (
                <div className="text-sm font-semibold text-foreground">{profile.full_name}</div>
              )}
              {profile?.email && (
                <div className="text-xs text-muted-foreground">{profile.email}</div>
              )}
              {profile?.phone && (
                <div className="text-xs text-muted-foreground">{profile.phone}</div>
              )}
              {agency?.website_url && (
                <div className="text-xs text-muted-foreground">
                  {agency.website_url.replace(/^https?:\/\//, "")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Logo personnalisé */}
        {isAdmin && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Logo personnalisé (optionnel)
            </Label>
            <div className="flex gap-2">
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://… (URL d'une image PNG ou JPG)"
              />
              <Button
                onClick={() => saveLogo.mutate(logoUrl.trim() || null)}
                disabled={saveLogo.isPending}
                size="sm"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {saveLogo.isPending ? "…" : "Enregistrer"}
              </Button>
              {agency?.logo_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setLogoUrl(""); saveLogo.mutate(null); }}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Retirer
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Laissez vide pour utiliser le wordmark typographique <strong>Wyngo<span style={{ color: "#b8997f" }}>.</span></strong> par défaut.
              Pour un logo image, hébergez-le sur Imgur, Supabase Storage, ou Cloudinary, puis collez l'URL ici (PNG/JPG, max 120px de large recommandé).
            </p>
          </div>
        )}

        {!isAdmin && (
          <p className="text-xs text-muted-foreground">
            Le logo de l'agence est géré par l'administrateur.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
