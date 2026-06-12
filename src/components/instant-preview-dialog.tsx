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

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
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
import { Sparkles, Loader2, ExternalLink, Copy, RefreshCw, Eye, Smartphone, QrCode, Check, Search, Palette, PenLine, Rocket, EyeOff, Activity } from "lucide-react";
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

type GenerationStep = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const GENERATION_STEPS: GenerationStep[] = [
  { key: "places", label: "Récupération des photos & avis Google", icon: Search },
  { key: "sector", label: "Détection du secteur d'activité", icon: Palette },
  { key: "copy", label: "Rédaction IA (Claude Sonnet 4.6)", icon: PenLine },
  { key: "build", label: "Construction du site web", icon: Sparkles },
  { key: "deploy", label: "Déploiement sur le cloud", icon: Rocket },
];

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
  // Index de l'étape en cours pendant la génération (progress UX)
  const [stepIndex, setStepIndex] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stats : observation des ouvertures du preview par le prospect
  const stats = useQuery({
    queryKey: ["preview-stats", prospectId, result?.preview_id],
    enabled: !!result?.preview_id,
    refetchInterval: 8000, // poll léger pour voir les ouvertures en temps réel
    queryFn: async () => {
      if (!result?.preview_id) return null;
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: string) => {
              maybeSingle: () => Promise<{ data: { opened_at: string | null; view_count: number } | null }>;
            };
          };
        };
      })
        .from("prospect_previews")
        .select("opened_at, view_count")
        .eq("id", result.preview_id)
        .maybeSingle();
      return data;
    },
  });

  // Avance la progress UX pendant la mutation (3s par étape — calé sur le temps réel)
  useEffect(() => {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, []);

  const startStepProgress = () => {
    setStepIndex(0);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = setInterval(() => {
      setStepIndex((i) => (i < GENERATION_STEPS.length - 1 ? i + 1 : i));
    }, 3000);
  };
  const stopStepProgress = () => {
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = null;
    setStepIndex(GENERATION_STEPS.length);
  };

  const generate = useMutation({
    mutationFn: async (force_refresh: boolean) => {
      startStepProgress();
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
      stopStepProgress();
      setResult(data);
      toast.success(data.cached ? "Aperçu chargé" : "Aperçu généré !", {
        description: data.cached
          ? "Version récente (< 24h) — clique sur Regénérer pour une nouvelle version"
          : `Secteur : ${SECTOR_LABELS[data.sector] || data.sector}`,
      });
    },
    onError: (e: Error) => {
      stopStepProgress();
      toast.error("Échec génération", { description: e.message });
    },
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
          <div className="py-10 px-2 space-y-6">
            <div className="text-center space-y-2">
              <div className="relative inline-block">
                <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
                <div className="relative bg-gradient-to-br from-amber-500 to-orange-500 rounded-full p-4 shadow-lg shadow-amber-500/40">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
              </div>
              <p className="text-base font-semibold pt-2">Génération du site en cours…</p>
              <p className="text-xs text-muted-foreground">~15 à 25 secondes</p>
            </div>

            {/* Liste des étapes avec indicateur live */}
            <ol className="max-w-md mx-auto space-y-2.5">
              {GENERATION_STEPS.map((step, i) => {
                const isDone = i < stepIndex;
                const isActive = i === stepIndex;
                const Icon = step.icon;
                return (
                  <li
                    key={step.key}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-500 ${
                      isActive
                        ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900"
                        : isDone
                          ? "opacity-50"
                          : "opacity-30"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                        isDone
                          ? "bg-emerald-500 text-white"
                          : isActive
                            ? "bg-amber-500 text-white"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isDone ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : isActive ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <span
                      className={`text-sm ${isActive ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {result && previewUrl && (
          <div className="space-y-4">
            {/* Stats live : ouverture & vues — apparait quand le prospect a vu */}
            {stats.data && (stats.data.opened_at || stats.data.view_count > 0) ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Eye className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                    Le prospect a vu son aperçu {stats.data.view_count > 1 ? `${stats.data.view_count} fois` : ""}
                  </p>
                  {stats.data.opened_at && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Première ouverture {formatDistanceToNow(new Date(stats.data.opened_at), { addSuffix: true, locale: fr })}
                    </p>
                  )}
                </div>
                <Activity className="h-4 w-4 text-emerald-600 animate-pulse" />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                  <EyeOff className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Pas encore consulté</p>
                  <p className="text-xs text-muted-foreground">Quand le prospect clique sur le lien, ça s'actualise ici en direct.</p>
                </div>
              </div>
            )}

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
