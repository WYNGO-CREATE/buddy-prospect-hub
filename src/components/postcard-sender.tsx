/**
 * ─── PostcardSender — Envoi d'une carte postale physique ──────────────
 *
 * Sur la fiche prospect. Compose et envoie une vraie carte postale (via
 * Merci Facteur / La Poste) :
 *   - RECTO : nom du commerce + accroche + QR code vers l'aperçu en ligne
 *   - VERSO : adresse du commerce + petit mot personnalisé
 *
 * L'adresse est pré-remplie depuis la fiche (Places/Pappers) et éditable.
 * Le QR pointe vers l'Aperçu Instantané → pont physique → digital.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mailbox, Loader2, Send, QrCode, CheckCircle2, AlertCircle } from "lucide-react";
import { parseFrenchAddress } from "@/lib/address";
import { toast } from "sonner";

const APP_URL = "https://wyngo.bold-unit-739e.workers.dev";

type Postcard = { id: string; status: string; sent_at: string | null; created_at: string };

export function PostcardSender({
  prospectId, company, firstName, location, phone,
}: {
  prospectId: string;
  company?: string | null;
  firstName?: string | null;
  location?: string | null;
  phone?: string | null;
}) {
  const qc = useQueryClient();
  const parsed = parseFrenchAddress(location);
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState(parsed.address_line);
  const [cp, setCp] = useState(parsed.postal_code);
  const [city, setCity] = useState(parsed.city);

  const prenom = firstName && firstName.toLowerCase() !== "contact" ? firstName : "";
  const [message, setMessage] = useState(
    `${prenom ? `Bonjour ${prenom},` : "Bonjour,"}\nJ'ai préparé un aperçu du site web que pourrait avoir ${company || "votre commerce"}. Scannez le QR au dos pour le découvrir — c'est offert et sans engagement. À très vite !`,
  );

  // Dernier aperçu (cible du QR)
  const { data: preview } = useQuery({
    queryKey: ["postcard-preview", prospectId],
    queryFn: async () => {
      const { data } = await supabase.from("prospect_previews")
        .select("slug, html_url").eq("prospect_id", prospectId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
      return data as { slug?: string; html_url?: string } | null;
    },
  });
  const previewUrl = preview?.html_url || (preview?.slug ? `${APP_URL}/p/${preview.slug}` : null);
  const qrSrc = previewUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(previewUrl)}` : null;

  // Dernière carte envoyée
  const { data: last } = useQuery({
    queryKey: ["postcard-last", prospectId],
    queryFn: async (): Promise<Postcard | null> => {
      const { data } = await supabase.from("prospect_postcards")
        .select("id, status, sent_at, created_at").eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return (data as Postcard) || null;
    },
  });

  useEffect(() => { // re-sync si l'adresse change (changement de prospect)
    const p = parseFrenchAddress(location);
    setAddr(p.address_line); setCp(p.postal_code); setCity(p.city);
  }, [location]);

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("postcard-send", {
        body: {
          prospect_id: prospectId,
          recipient_name: company || `${firstName || ""}`.trim(),
          address_line: addr, postal_code: cp, city, message, preview_url: previewUrl,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Envoi impossible");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postcard-last", prospectId] });
      setOpen(false);
      toast.success("Carte postale envoyée 📮 — en route via La Poste !");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addressOk = !!cp && !!city;

  return (
    <Card className="border-rose-200/60 dark:border-rose-900/40 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mailbox className="h-4 w-4 text-rose-600" /> Carte postale physique
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {last && (last.status === "sent" || last.status === "delivered" || last.status === "queued") && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" /> Carte déjà envoyée le {new Date(last.sent_at || last.created_at).toLocaleDateString("fr-FR")}
          </p>
        )}

        {!open ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Envoie une vraie carte postale avec un QR vers l'aperçu — elle atterrit sur leur comptoir.</p>
            <Button size="sm" className="gap-1.5 shrink-0 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white" onClick={() => setOpen(true)}>
              <Mailbox className="h-3.5 w-3.5" /> Composer
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Aperçu RECTO de la carte */}
            <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/10 via-card to-rose-50 dark:to-rose-950/20">
              <div className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-rose-600 font-bold">Votre futur site web</p>
                  <p className="text-lg font-bold leading-tight mt-0.5 truncate">{company || "Votre commerce"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Scannez pour le découvrir en vrai →</p>
                </div>
                {qrSrc ? (
                  <img src={qrSrc} alt="QR aperçu" className="size-20 rounded bg-white p-1 shrink-0" />
                ) : (
                  <div className="size-20 rounded bg-muted flex items-center justify-center shrink-0">
                    <QrCode className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
            {!previewUrl && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Pas encore d'aperçu — génères-en un d'abord pour que le QR pointe vers leur site.
              </p>
            )}

            {/* Destinataire */}
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse du destinataire</Label>
              <Input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="N° et rue" className="h-8 text-sm" />
              <div className="grid grid-cols-[100px_1fr] gap-1.5">
                <Input value={cp} onChange={(e) => setCp(e.target.value)} placeholder="Code postal" className="h-8 text-sm" />
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" className="h-8 text-sm" />
              </div>
              {!addressOk && <p className="text-[11px] text-amber-600 dark:text-amber-400">Complète au moins le code postal et la ville.</p>}
            </div>

            {/* Verso : message */}
            <div className="space-y-1.5">
              <Label className="text-xs">Mot au dos</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="text-sm resize-none" />
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="gap-1.5" disabled={!addressOk || send.isPending} onClick={() => send.mutate()}>
                {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Envoyer la carte (≈ 1 €)
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
