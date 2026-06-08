/**
 * ─── CallPhilosophyCard ───────────────────────────────────────────────
 *
 * Édition de la PHILOSOPHIE de vente du fondateur — directement injectée
 * dans le prompt système de script-generate. Ce bloc rend l'IA fidèle à
 * la voix unique de l'agence (pas un coach télévente générique).
 *
 * 3 champs :
 *   1. Philosophie  : convictions de vente, posture, angle de différenciation
 *   2. Toujours faire : règles d'or, choses non-négociables (qualité, ton)
 *   3. Ne JAMAIS faire : interdits absolus (pression, mensonges, jargon)
 *
 * Réservé à l'admin (RLS sur agency_settings.UPDATE).
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Loader2, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type AgencyPhilosophy = {
  philosophy: string | null;
  call_dos: string | null;
  call_donts: string | null;
};

export function CallPhilosophyCard({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [philosophy, setPhilosophy] = useState("");
  const [callDos, setCallDos] = useState("");
  const [callDonts, setCallDonts] = useState("");
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agency-philosophy"],
    queryFn: async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: boolean) => {
              maybeSingle: () => Promise<{ data: AgencyPhilosophy | null }>;
            };
          };
        };
      })
        .from("agency_settings")
        .select("philosophy, call_dos, call_donts")
        .eq("id", true)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setPhilosophy(data.philosophy ?? "");
    setCallDos(data.call_dos ?? "");
    setCallDonts(data.call_donts ?? "");
    setDirty(false);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (k: string, v: boolean) => Promise<{ error: { message: string } | null }>;
          };
        };
      })
        .from("agency_settings")
        .update({
          philosophy: philosophy || null,
          call_dos: callDos || null,
          call_donts: callDonts || null,
        })
        .eq("id", true);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Philosophie enregistrée");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["agency-philosophy"] });
    },
    onError: (e: Error) => toast.error("Échec sauvegarde", { description: e.message }),
  });

  const isFilled = philosophy.length > 0 || callDos.length > 0 || callDonts.length > 0;

  return (
    <Card className="border-amber-200 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/40 to-transparent dark:from-amber-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-5 w-5 text-amber-500" />
          Philosophie de vente — l'IA s'adapte à ta voix
          {isFilled && !dirty && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircle2 className="h-3 w-3" />
              Actif
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Ces 3 champs sont injectés DIRECTEMENT dans le prompt de l'IA quand elle génère des scripts.
          Plus tu remplis ici, plus les scripts collent à ton style de vente — irremplaçable.
          {!isAdmin && <span className="italic"> (lecture seule pour les non-admins)</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="philosophy" className="text-xs uppercase tracking-wider text-muted-foreground">
                Ta philosophie de vente
              </Label>
              <Textarea
                id="philosophy"
                value={philosophy}
                onChange={(e) => { setPhilosophy(e.target.value); setDirty(true); }}
                placeholder="Ex: Je vends comme un fondateur, pas comme un commercial. La transparence est ma meilleure arme — j'annonce que c'est de la prospection dès la 1ère seconde. Je ne cours jamais après une vente : si le prospect n'est pas le bon, je préfère raccrocher poliment plutôt que forcer."
                rows={5}
                className="text-sm resize-none"
                disabled={!isAdmin}
              />
              <p className="text-[11px] text-muted-foreground">
                Tes convictions, ta posture face aux prospects, ton angle de différenciation. C'est ce qui rend chaque script "toi" et pas un coach télévente générique.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="call-dos" className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">
                  ✓ Toujours faire
                </Label>
                <Textarea
                  id="call-dos"
                  value={callDos}
                  onChange={(e) => { setCallDos(e.target.value); setDirty(true); }}
                  placeholder="• Se présenter comme fondateur (autorité)&#10;• Poser une pause après 'allô' pour engager&#10;• Mentionner un détail spécifique du business du prospect (Google avis, photos…)&#10;• Demander la permission avant de pitcher"
                  rows={6}
                  className="text-sm resize-none"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="call-donts" className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-semibold">
                  ✗ Ne JAMAIS faire
                </Label>
                <Textarea
                  id="call-donts"
                  value={callDonts}
                  onChange={(e) => { setCallDonts(e.target.value); setDirty(true); }}
                  placeholder="• Réciter un script comme un robot&#10;• Utiliser le jargon 'solution', 'ROI', 'synergies'&#10;• Forcer le prospect s'il dit non&#10;• Promettre des résultats chiffrés sans preuve&#10;• Mentir sur l'origine du contact"
                  rows={6}
                  className="text-sm resize-none"
                  disabled={!isAdmin}
                />
              </div>
            </div>

            {isAdmin && (
              <div className="flex justify-end pt-1">
                <Button
                  onClick={() => save.mutate()}
                  disabled={!dirty || save.isPending}
                  size="sm"
                  className="gap-2"
                >
                  {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {dirty ? "Enregistrer la philosophie" : "Sauvegardé"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
