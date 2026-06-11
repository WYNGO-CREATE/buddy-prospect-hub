/**
 * ─── ProspectTeaser — Bande-annonce vidéo IA du commerce ──────────────
 *
 * Sur la fiche prospect. Génère un clip cinématique 5s à partir de la
 * photo Google du commerce (via Higgsfield), suit la progression, puis
 * affiche la vidéo avec des boutons pour l'envoyer au prospect
 * (SMS / WhatsApp / Email / copier le lien).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clapperboard, Loader2, Copy, MessageCircle, Mail, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Teaser = { id: string; status: "processing" | "done" | "failed"; video_url: string | null; error: string | null; created_at: string };

export function ProspectTeaser({
  prospectId, firstName, company, phone,
}: {
  prospectId: string;
  firstName?: string | null;
  company?: string | null;
  phone?: string | null;
}) {
  const qc = useQueryClient();
  const [style, setStyle] = useState<"warm" | "premium">("warm");
  const pollRef = useRef<number | null>(null);

  const { data: teaser } = useQuery({
    queryKey: ["teaser", prospectId],
    queryFn: async (): Promise<Teaser | null> => {
      const { data } = await supabase.from("prospect_teasers")
        .select("id, status, video_url, error, created_at")
        .eq("prospect_id", prospectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return (data as Teaser) || null;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-teaser", { body: { prospect_id: prospectId, style } });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Génération impossible");
      return data;
    },
    onSuccess: () => { toast.success("Téaser en cours de génération… (30-90s)"); qc.invalidateQueries({ queryKey: ["teaser", prospectId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Polling : tant que le téaser est "processing", on tape teaser-status
  useEffect(() => {
    const isProcessing = teaser?.status === "processing";
    if (isProcessing && teaser) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          await supabase.functions.invoke("teaser-status", { body: { teaser_id: teaser.id } });
          qc.invalidateQueries({ queryKey: ["teaser", prospectId] });
        } catch { /* on retentera */ }
      }, 6000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [teaser?.status, teaser?.id, prospectId, qc]);

  const prenom = firstName && firstName.toLowerCase() !== "contact" ? firstName : "";
  const shareMsg = teaser?.video_url
    ? `${prenom ? `Bonjour ${prenom}, ` : "Bonjour, "}j'ai préparé une petite bande-annonce de votre présence en ligne pour ${company || "votre commerce"} 🎬 : ${teaser.video_url}`
    : "";

  const sendCopy = () => navigator.clipboard.writeText(shareMsg).then(() => toast.success("Message + lien copiés")).catch(() => toast.error("Copie impossible"));
  const waNumber = (phone || "").replace(/[^0-9]/g, "").replace(/^0/, "33");

  return (
    <Card className="border-amber-200/60 dark:border-amber-900/40 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-amber-600" /> Bande-annonce vidéo
          <span className="text-[10px] font-normal text-muted-foreground">· IA cinématique</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* État : vidéo prête */}
        {teaser?.status === "done" && teaser.video_url ? (
          <>
            <video src={teaser.video_url} controls loop playsInline className="w-full rounded-lg border bg-black aspect-video" />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={sendCopy}><Copy className="h-3 w-3" /> Copier le message</Button>
              {phone && (
                <Button size="sm" variant="outline" className="gap-1 text-xs" asChild>
                  <a href={`sms:${phone}?&body=${encodeURIComponent(shareMsg)}`}><MessageCircle className="h-3 w-3" /> SMS</a>
                </Button>
              )}
              {phone && (
                <Button size="sm" variant="outline" className="gap-1 text-xs text-emerald-700 dark:text-emerald-400" asChild>
                  <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(shareMsg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1 text-xs" asChild>
                <a href={`mailto:?subject=${encodeURIComponent("Votre présence en ligne en vidéo")}&body=${encodeURIComponent(shareMsg)}`}><Mail className="h-3 w-3" /> Email</a>
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" onClick={() => generate.mutate()} disabled={generate.isPending}>
                <RefreshCw className="h-3 w-3" /> Refaire
              </Button>
            </div>
          </>
        ) : teaser?.status === "processing" ? (
          <div className="flex items-center gap-3 py-4 px-3 rounded-lg bg-muted/40 border border-dashed">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            <div>
              <p className="text-sm font-medium">Génération de la bande-annonce…</p>
              <p className="text-xs text-muted-foreground">L'IA anime la photo du commerce — ça prend ~30 à 90 secondes.</p>
            </div>
          </div>
        ) : (
          <>
            {teaser?.status === "failed" && (
              <p className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> {teaser.error || "La génération a échoué."}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Transforme la photo du commerce en clip cinématique de 5s à envoyer par SMS/WhatsApp — effet wahou garanti.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md border overflow-hidden text-xs">
                {(["warm", "premium"] as const).map((s) => (
                  <button key={s} onClick={() => setStyle(s)}
                    className={cn("px-2.5 py-1 transition", style === s ? "bg-amber-500 text-white" : "hover:bg-muted")}>
                    {s === "warm" ? "Chaleureux" : "Haut de gamme"}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}
                className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white">
                {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Générer le téaser
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
