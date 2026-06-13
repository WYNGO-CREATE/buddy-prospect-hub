/**
 * ─── ProspectEnrichButton — Enrichir un prospect (Google + site + email) ─
 *
 * Lance l'enrichissement (mêmes données que la chasse) sur un prospect
 * ajouté à la main : téléphone, site web, statut du site, email, brief
 * pour l'Aperçu Instantané. À utiliser quand un prospect arrive "vide".
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ProspectEnrichButton({ prospectId, company, location }: { prospectId: string; company?: string | null; location?: string | null }) {
  const qc = useQueryClient();
  const enrich = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("enrich-prospect", { body: { prospect_id: prospectId } });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Enrichissement impossible");
      return data as { enriched: string[] };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["prospect", prospectId] });
      qc.invalidateQueries({ queryKey: ["postcard-preview", prospectId] });
      const list = (d.enriched || []).join(", ");
      toast.success(list ? `Enrichi : ${list}` : "Enrichissement terminé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={enrich.isPending || !company}
      title={!company ? "Renseigne le nom de l'entreprise" : "Récupère téléphone, site, email et brief via Google + IA"}
      onClick={() => enrich.mutate()}
    >
      {enrich.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {enrich.isPending ? "Enrichissement…" : "Enrichir"}
    </Button>
  );
}
