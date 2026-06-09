/**
 * ─── EmailFinderButton — Recherche d'email pour un prospect ───────────
 *
 * Bouton à afficher sur la fiche prospect quand l'email est manquant.
 * Lance la cascade `email-finder` (scraper → Hunter → Pages Jaunes →
 * pattern + Captain Verify) et persiste l'email trouvé sur le prospect.
 *
 * Pendant la recherche, affiche la source en cours via une animation.
 * Si plusieurs candidats sont trouvés, propose le meilleur (le 1er vérifié
 * valid ou risky) ; si rien → message clair "Aucun email trouvé".
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

type FinderResult = {
  ok: boolean;
  email: string | null;
  email_status: "valid" | "risky" | "invalid" | "unknown" | "not_verified" | null;
  email_source: "scraper" | "hunter" | "pages_jaunes" | "pattern" | null;
  sources_tried: string[];
  candidates: Array<{ email: string; source: string; status: string; confidence: number }>;
  duration_ms: number;
};

export function EmailFinderButton({
  prospectId,
  companyName,
  city,
  websiteUrl,
  dirigeantFirstName,
  dirigeantLastName,
}: {
  prospectId: string;
  companyName?: string | null;
  city?: string | null;
  websiteUrl?: string | null;
  dirigeantFirstName?: string | null;
  dirigeantLastName?: string | null;
}) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<string>("");

  const finder = useMutation({
    mutationFn: async (): Promise<FinderResult> => {
      if (!companyName?.trim()) {
        throw new Error("Pas de nom d'entreprise — impossible de chercher.");
      }
      setStage("Recherche en cours…");
      const { data, error } = await supabase.functions.invoke("email-finder", {
        body: {
          company_name: companyName,
          city: city || "",
          website_url: websiteUrl || undefined,
          dirigeant_first_name: dirigeantFirstName || undefined,
          dirigeant_last_name: dirigeantLastName || undefined,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Échec de la recherche");
      return data as FinderResult;
    },
    onSuccess: async (data) => {
      setStage("");
      if (!data.email) {
        toast.error("Aucun email trouvé sur les sources disponibles", {
          description: `Sources tentées : ${data.sources_tried.join(", ") || "aucune"}`,
        });
        return;
      }
      // Persiste sur le prospect
      const { error: upErr } = await supabase
        .from("prospects")
        .update({ email: data.email, updated_at: new Date().toISOString() })
        .eq("id", prospectId);
      if (upErr) {
        toast.error(`Email trouvé mais sauvegarde KO : ${upErr.message}`);
        return;
      }
      const sourceLabel = ({
        scraper: "site web du prospect",
        hunter: "Hunter.io",
        pages_jaunes: "Pages Jaunes 🇫🇷",
        pattern: "pattern + vérification Captain Verify",
      } as Record<string, string>)[data.email_source || ""] || data.email_source || "source inconnue";
      toast.success(`Email trouvé : ${data.email}`, {
        description: `Via ${sourceLabel} (${data.email_status || "non vérifié"})`,
      });
      qc.invalidateQueries({ queryKey: ["prospect", prospectId] });
    },
    onError: (e: Error) => {
      setStage("");
      toast.error(e.message);
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); finder.mutate(); }}
        disabled={finder.isPending || !companyName}
      >
        {finder.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {finder.isPending ? (stage || "Recherche…") : "Trouver l'email"}
      </Button>
      {!companyName && (
        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          nom requis
        </span>
      )}
    </div>
  );
}
