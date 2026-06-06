/**
 * ─── PreviewBriefCard ─────────────────────────────────────────────────────
 *
 * Carte éditable sur la fiche prospect pour renseigner le brief de génération
 * de l'Aperçu Instantané :
 *   • Activité précise (textarea, ce que le prospect fait vraiment)
 *   • Objectif business (select : RDV, vente, vitrine, devis, désengorger tél)
 *   • Ton souhaité (select : chaleureux, élégant, moderne, expert, convivial)
 *   • Mots-clés / produits phares (tag input, 3-8 termes)
 *
 * Action centrale : "Préremplir avec l'IA" → appelle enrich-prospect-brief
 * qui analyse Pappers + Places + nom de société et propose un brouillon
 * que le commercial peut éditer avant de générer l'aperçu.
 *
 * Ce brief est ensuite injecté dans le prompt Claude au moment de la
 * génération → copy ULTRA-personnalisé qui colle au métier réel.
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Save, Wand2, X, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const OBJECTIVES = [
  { id: "more_bookings", label: "Plus de réservations / RDV" },
  { id: "online_sales", label: "Vendre en ligne" },
  { id: "showcase", label: "Vitrine de présentation" },
  { id: "lead_generation", label: "Générer des contacts (devis)" },
  { id: "reduce_calls", label: "Désengorger le téléphone" },
];

const TONES = [
  { id: "warm", label: "Chaleureux & artisanal" },
  { id: "elegant", label: "Élégant & raffiné" },
  { id: "modern", label: "Moderne & direct" },
  { id: "expert", label: "Expert & technique" },
  { id: "playful", label: "Décontracté & convivial" },
];

type Brief = {
  activity: string;
  objective: string;
  tone: string;
  keywords: string[];
};

type Props = {
  prospectId: string;
  initial: Partial<Brief> & { enriched_at?: string | null };
};

export function PreviewBriefCard({ prospectId, initial }: Props) {
  const qc = useQueryClient();
  const [activity, setActivity] = useState(initial.activity ?? "");
  const [objective, setObjective] = useState(initial.objective ?? "");
  const [tone, setTone] = useState(initial.tone ?? "");
  const [keywords, setKeywords] = useState<string[]>(initial.keywords ?? []);
  const [draftKeyword, setDraftKeyword] = useState("");
  const [dirty, setDirty] = useState(false);

  // Sync si la prop change (ex: prefill IA réussi)
  useEffect(() => {
    setActivity(initial.activity ?? "");
    setObjective(initial.objective ?? "");
    setTone(initial.tone ?? "");
    setKeywords(initial.keywords ?? []);
    setDirty(false);
  }, [initial.activity, initial.objective, initial.tone, initial.keywords, prospectId]);

  const isFilled = activity.length > 0 || objective.length > 0 || keywords.length > 0;
  const fillPercent = Math.round(
    ((activity.length > 0 ? 1 : 0) +
      (objective.length > 0 ? 1 : 0) +
      (tone.length > 0 ? 1 : 0) +
      (keywords.length > 0 ? 1 : 0)) *
      25
  );

  // ─── Sauvegarde manuelle ──────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("prospects")
        .update({
          brief_activity: activity || null,
          brief_objective: objective || null,
          brief_tone: tone || null,
          brief_keywords: keywords.length > 0 ? keywords : null,
        })
        .eq("id", prospectId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Brief enregistré");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["prospect", prospectId] });
    },
    onError: (e: Error) => toast.error("Échec sauvegarde", { description: e.message }),
  });

  // ─── Préremplissage IA ────────────────────────────────────────────────
  const prefillAI = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("enrich-prospect-brief", {
        body: { prospect_id: prospectId, persist: true },
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
      return data as { brief: Brief & { confidence: number; reasoning?: string }; model: string };
    },
    onSuccess: (data) => {
      setActivity(data.brief.activity);
      setObjective(data.brief.objective);
      setTone(data.brief.tone);
      setKeywords(data.brief.keywords);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["prospect", prospectId] });
      toast.success("Brief généré par l'IA", {
        description: `Confiance ${Math.round(data.brief.confidence * 100)}% · modèle ${data.model}${data.brief.reasoning ? ` · ${data.brief.reasoning}` : ""}`,
      });
    },
    onError: (e: Error) => toast.error("Échec préremplissage IA", { description: e.message }),
  });

  // ─── Helpers mots-clés ────────────────────────────────────────────────
  const addKeyword = () => {
    const k = draftKeyword.trim();
    if (!k || keywords.includes(k) || keywords.length >= 8) return;
    setKeywords([...keywords, k]);
    setDraftKeyword("");
    setDirty(true);
  };
  const removeKeyword = (k: string) => {
    setKeywords(keywords.filter((x) => x !== k));
    setDirty(true);
  };
  const markDirty = () => setDirty(true);

  return (
    <Card className="border-amber-200 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/10">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Brief Aperçu Instantané
            </CardTitle>
            <CardDescription className="mt-1">
              Ces champs nourrissent l'IA pour générer un site ULTRA-personnalisé. Plus c'est précis, mieux c'est.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Indicateur de remplissage */}
            <div className="text-xs text-muted-foreground">
              {fillPercent === 100 ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Complet
                </span>
              ) : (
                <span>{fillPercent}% rempli</span>
              )}
            </div>
            {initial.enriched_at && (
              <Badge variant="outline" className="text-[10px]">
                IA · {formatDistanceToNow(new Date(initial.enriched_at), { addSuffix: true, locale: fr })}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Bouton IA prééminent */}
        {!isFilled && !prefillAI.isPending && (
          <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-800 p-4 text-center bg-amber-50/60 dark:bg-amber-950/20">
            <p className="text-sm font-medium mb-1">Pas encore de brief renseigné</p>
            <p className="text-xs text-muted-foreground mb-3">
              Laisse l'IA analyser ce qu'on sait du prospect et te proposer un brouillon en 5s.
            </p>
            <Button
              size="sm"
              onClick={() => prefillAI.mutate()}
              disabled={prefillAI.isPending}
              className="gap-2 bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Wand2 className="h-3.5 w-3.5" />
              Préremplir avec l'IA
            </Button>
          </div>
        )}

        {/* Activité */}
        <div className="space-y-1.5">
          <Label htmlFor="brief-activity" className="text-xs uppercase tracking-wider text-muted-foreground">
            Activité précise
          </Label>
          <Textarea
            id="brief-activity"
            value={activity}
            onChange={(e) => {
              setActivity(e.target.value);
              markDirty();
            }}
            placeholder="Ex: Boulangerie artisanale spécialisée pain au levain bio et viennoiseries pur beurre Charentes-Poitou. Pâtisseries fines du dimanche."
            rows={3}
            className="resize-none text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Ce qu'ils vendent / font vraiment, au quotidien. Sois concret.
          </p>
        </div>

        {/* Grid objectif + ton */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Objectif du futur site
            </Label>
            <Select
              value={objective}
              onValueChange={(v) => {
                setObjective(v);
                markDirty();
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Choisir un objectif" />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-sm">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Ton souhaité
            </Label>
            <Select
              value={tone}
              onValueChange={(v) => {
                setTone(v);
                markDirty();
              }}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Choisir un ton" />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-sm">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mots-clés / produits phares */}
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Produits phares / mots-clés <span className="opacity-60">({keywords.length}/8)</span>
          </Label>
          <div className="flex gap-2">
            <Input
              value={draftKeyword}
              onChange={(e) => setDraftKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="Ex: pain au levain bio, croissants pur beurre..."
              className="text-sm"
              disabled={keywords.length >= 8}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addKeyword}
              disabled={!draftKeyword.trim() || keywords.length >= 8}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {keywords.map((k) => (
                <Badge key={k} variant="secondary" className="gap-1 pr-1">
                  {k}
                  <button
                    type="button"
                    onClick={() => removeKeyword(k)}
                    className="hover:bg-muted-foreground/20 rounded p-0.5 transition"
                    aria-label={`Retirer ${k}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => prefillAI.mutate()}
            disabled={prefillAI.isPending}
            className="gap-2"
          >
            {prefillAI.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {isFilled ? "Reproposer avec l'IA" : "Préremplir avec l'IA"}
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="gap-2"
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {dirty ? "Enregistrer les modifications" : "Sauvegardé"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
