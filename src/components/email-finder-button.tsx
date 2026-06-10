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
  email_source: "scraper" | "hunter" | "web_search" | "pattern" | "domain_discovery" | null;
  sources_tried: string[];
  candidates: Array<{ email: string; source: string; status: string; confidence: number }>;
  debug?: { web_queries?: string[]; web_emails_raw_count?: number; live_domains?: string[]; checked_domains?: number };
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
        const dcErr = data.debug?.dropcontact?.error;
        const dcCredits = data.debug?.dropcontact?.credits_left;
        let desc = "Ce prospect n'a aucun email exploitable publiquement (pas de site, absent des bases B2B).";
        if (dcErr === "timeout") {
          desc = "Dropcontact n'a pas répondu à temps — réessaie dans quelques secondes.";
        } else if (dcErr === "no_key") {
          desc = "Dropcontact non configuré.";
        } else if (typeof dcCredits === "number" && dcCredits <= 0) {
          desc = "Crédits Dropcontact épuisés — recharge ton compte pour continuer.";
        }
        toast.error("Aucun email trouvé", { description: desc, duration: 8000 });
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
        web_search: "recherche web",
        pattern: "pattern + vérification",
        domain_discovery: "découverte de domaine (MX) + vérification",
        dropcontact: "Dropcontact 🇫🇷",
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
