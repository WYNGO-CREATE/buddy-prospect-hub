/**
 * ─── CallPrep — Préparation d'appel IA (sur la fiche prospect) ─────────
 *
 * Avant d'appeler, un clic et l'IA prépare l'appel pour CE prospect :
 * objectif, accroche exacte à dire, points clés, objections probables,
 * prochaine étape. Tout est taillé sur mesure (contexte complet du
 * prospect + offre/philosophie de l'agence).
 */

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Headset, Sparkles, Loader2, Target, MessageSquare, Key, ShieldAlert, ArrowRight, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Prep = {
  objectif: string;
  accroche: string;
  points_cles: string[];
  objections_probables: { objection: string; reponse: string }[];
  prochaine_etape: string;
};

export function CallPrep({ prospectId }: { prospectId: string }) {
  const prep = useMutation({
    mutationFn: async (): Promise<Prep> => {
      const { data, error } = await supabase.functions.invoke("call-prep", { body: { prospect_id: prospectId } });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Préparation impossible");
      return data as Prep;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = prep.data;
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Accroche copiée")).catch(() => toast.error("Copie impossible"));

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Headset className="h-4 w-4 text-primary" /> Préparer l'appel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!p && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">L'IA te brief sur ce prospect : objectif, accroche, objections probables.</p>
            <Button size="sm" className="gap-1.5 shrink-0 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-700 text-white"
              disabled={prep.isPending} onClick={() => prep.mutate()}>
              {prep.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {prep.isPending ? "Préparation…" : "Préparer"}
            </Button>
          </div>
        )}

        {p && (
          <div className="space-y-3">
            {/* Objectif */}
            {p.objectif && (
              <div className="text-sm flex gap-2">
                <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p><span className="font-semibold">Objectif :</span> {p.objectif}</p>
              </div>
            )}

            {/* Accroche — la star */}
            {p.accroche && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-primary inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Ton accroche</p>
                  <button onClick={() => copy(p.accroche)} className="text-[10px] text-primary inline-flex items-center gap-1 hover:underline"><Copy className="h-2.5 w-2.5" /> Copier</button>
                </div>
                <p className="text-sm leading-relaxed">"{p.accroche}"</p>
              </div>
            )}

            {/* Points clés */}
            {p.points_cles.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground inline-flex items-center gap-1 mb-1"><Key className="h-3 w-3" /> Points clés à jouer</p>
                <ul className="space-y-0.5">
                  {p.points_cles.map((k, i) => <li key={i} className="text-xs flex gap-1.5"><span className="text-primary">•</span>{k}</li>)}
                </ul>
              </div>
            )}

            {/* Objections probables */}
            {p.objections_probables.length > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-2.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1 mb-1.5"><ShieldAlert className="h-3 w-3" /> Si il objecte…</p>
                <div className="space-y-2">
                  {p.objections_probables.map((o, i) => (
                    <div key={i} className="text-xs">
                      <p className="font-medium text-amber-900 dark:text-amber-200">«&nbsp;{o.objection}&nbsp;»</p>
                      <p className="text-muted-foreground pl-2 border-l-2 border-amber-300 dark:border-amber-800 mt-0.5">👉 {o.reponse}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prochaine étape */}
            {p.prochaine_etape && (
              <div className="text-xs flex gap-2 text-emerald-700 dark:text-emerald-300">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <p><span className="font-semibold">Appel réussi =</span> {p.prochaine_etape}</p>
              </div>
            )}

            <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" disabled={prep.isPending} onClick={() => prep.mutate()}>
              <RefreshCw className="h-3 w-3" /> Refaire le brief
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
