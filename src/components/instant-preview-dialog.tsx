/**
 * ─── InstantPreviewDialog — Aperçu Instantané du site du prospect ─────────
 *
 * Bouton + dialog qui :
 *   1. Génère en ~15s un site web preview personnalisé pour le prospect
 *   2. Affiche l'URL publique, un iframe live, un QR code, et le lien à copier
 *   3. Permet de regénérer (force refresh) si pas satisfait
 *
 * Le commercial envoie ensuite le lien au prospect par SMS (manuellement)
 * pendant un appel : "Cliquez sur ce lien, voici à quoi ressemblerait
 * votre site." → effet wahou garanti.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, ExternalLink, Copy, RefreshCw, Eye, Smartphone, QrCode } from "lucide-react";
import { toast } from "sonner";

type GenerateResult = {
  ok?: boolean;
  cached?: boolean;
  preview_id: string;
  slug: string;
  url: string;
  html_url?: string;
  sector: string;
  model?: string;
  photos_used?: number;
  reviews_used?: number;
  copy_preview?: { hero_title: string; hero_tagline: string };
};

const SECTOR_LABELS: Record<string, string> = {
  boulangerie: "🥐 Boulangerie / Pâtisserie",
  restaurant: "🍽️ Restaurant",
  coiffure: "✂️ Coiffure / Beauté",
  commerce: "🛍️ Commerce",
  artisan: "🔨 Artisan",
  service: "✨ Service",
};

export function InstantPreviewDialog({
  prospectId,
  children,
}: {
  prospectId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");

  const generate = useMutation({
    mutationFn: async (force_refresh = false) => {
      const { data, error } = await supabase.functions.invoke("generate-preview", {
        body: { prospect_id: prospectId, force_refresh },
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
      return data as GenerateResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success(data.cached ? "Aperçu chargé" : "Aperçu généré !", {
        description: data.cached
          ? "Version récente (< 24h) — clique sur Regénérer pour une nouvelle version"
          : `Secteur : ${SECTOR_LABELS[data.sector] || data.sector}`,
      });
    },
    onError: (e: Error) => toast.error("Échec génération", { description: e.message }),
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !result && !generate.isPending) {
      generate.mutate(false);
    }
  };

  const copyLink = async () => {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success("Lien copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const previewUrl = result?.url || (result as unknown as { html_url?: string })?.html_url;
  const qrUrl = previewUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(previewUrl)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Aperçu Instantané — Site web personnalisé
          </DialogTitle>
          <DialogDescription>
            L'IA génère en 15 secondes un site web vitrine sur-mesure avec les vraies photos,
            avis et horaires du prospect. Envoyez-lui le lien par SMS pendant l'appel.
          </DialogDescription>
        </DialogHeader>

        {generate.isPending && !result && (
          <div className="py-16 text-center space-y-4">
            <div className="relative inline-block">
              <Loader2 className="h-14 w-14 text-amber-500 animate-spin" />
              <Sparkles className="h-6 w-6 text-amber-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <p className="text-base font-semibold">Génération du site en cours…</p>
            <div className="text-xs text-muted-foreground space-y-1 max-w-md mx-auto">
              <p>📍 Récupération des données Google Places</p>
              <p>🎨 Détection du secteur et choix du template</p>
              <p>✍️ Rédaction IA du copy (titre, services, à propos)</p>
              <p>🚀 Déploiement sur Supabase Storage</p>
            </div>
            <p className="text-[11px] text-muted-foreground italic mt-2">~15 secondes</p>
          </div>
        )}

        {result && previewUrl && (
          <div className="space-y-4">
            {/* Top bar : URL + actions */}
            <div className="flex items-start gap-3 flex-wrap p-3 rounded-lg border bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold mb-1">
                  Lien à envoyer au prospect
                </p>
                <p className="text-xs font-mono break-all text-amber-900 dark:text-amber-200">{previewUrl}</p>
                <div className="flex gap-2 mt-2 flex-wrap items-center">
                  <Badge variant="outline" className="text-[10px]">{SECTOR_LABELS[result.sector] || result.sector}</Badge>
                  {result.photos_used !== undefined && (
                    <Badge variant="outline" className="text-[10px]">📸 {result.photos_used} photos</Badge>
                  )}
                  {result.reviews_used !== undefined && result.reviews_used > 0 && (
                    <Badge variant="outline" className="text-[10px]">⭐ {result.reviews_used} avis</Badge>
                  )}
                  {result.cached && <Badge variant="secondary" className="text-[10px]">Cache &lt; 24h</Badge>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copier
                </Button>
                <Button size="sm" variant="outline" asChild className="gap-1.5">
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ouvrir
                  </a>
                </Button>
              </div>
            </div>

            {/* Toggle desktop / mobile */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                <button
                  onClick={() => setView("desktop")}
                  className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                    view === "desktop" ? "bg-white dark:bg-zinc-800 shadow font-medium" : "text-muted-foreground"
                  }`}
                >
                  <Eye className="h-3 w-3" /> Desktop
                </button>
                <button
                  onClick={() => setView("mobile")}
                  className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition ${
                    view === "mobile" ? "bg-white dark:bg-zinc-800 shadow font-medium" : "text-muted-foreground"
                  }`}
                >
                  <Smartphone className="h-3 w-3" /> Mobile
                </button>
              </div>
              {qrUrl && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                    <QrCode className="h-3 w-3" />
                    Voir le QR code
                  </summary>
                  <div className="mt-2 p-2 rounded-lg border bg-white inline-block">
                    <img src={qrUrl} alt="QR code" className="block" width={160} height={160} />
                  </div>
                </details>
              )}
            </div>

            {/* Iframe preview */}
            <div className="border rounded-xl overflow-hidden bg-muted/30 flex justify-center p-4">
              <div
                className="bg-white shadow-2xl rounded overflow-hidden"
                style={{
                  width: view === "mobile" ? 375 : "100%",
                  maxWidth: view === "mobile" ? 375 : "100%",
                  height: view === "mobile" ? 667 : 600,
                  transition: "all .3s",
                }}
              >
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="Aperçu du site"
                />
              </div>
            </div>

            {result.copy_preview && (
              <div className="text-xs text-muted-foreground border-l-2 border-amber-300 pl-3 italic">
                <strong className="not-italic text-foreground">{result.copy_preview.hero_title}</strong> — {result.copy_preview.hero_tagline}
                {result.model && <span className="ml-1 not-italic">· {result.model}</span>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {result && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => generate.mutate(true)}
              disabled={generate.isPending}
              className="gap-2"
            >
              {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regénérer une nouvelle version
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
