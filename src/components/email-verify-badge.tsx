/**
 * ─── EmailVerifyBadge — Pastille de vérification d'email ──────────────
 *
 * Affiche le statut de vérification d'un email (Captain Verify) avec :
 *   - 4 couleurs : vert (valide) / ambre (risky) / rouge (invalide) / gris (non vérifié)
 *   - Tooltip explicite (date + provider + détails)
 *   - Bouton "Vérifier" si pas encore fait ou trop ancien (> 30j)
 *
 * Lecture : table `email_verifications` (cache mutualisé entre users)
 * Écriture : edge function `email-verify` (qui appelle Captain Verify + upsert cache)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

type VerifStatus = "valid" | "risky" | "invalid" | "unknown";

interface VerificationRow {
  email: string;
  status: VerifStatus;
  verified_at: string;
  expires_at: string;
  raw_result: string | null;
  provider: string;
}

const STATUS_META: Record<VerifStatus, { label: string; icon: React.ElementType; cls: string; tooltip: string }> = {
  valid:   { label: "Valide",      icon: CheckCircle2,  cls: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300/50", tooltip: "Cet email existe et accepte les messages — envoi sûr." },
  risky:   { label: "À risque",    icon: AlertTriangle, cls: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300/50",          tooltip: "Le serveur accepte tout (catch-all) ou c'est une adresse générique (contact@) — envoi à tes risques." },
  invalid: { label: "Invalide",    icon: XCircle,       cls: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300/50",              tooltip: "Cet email n'existe pas — ne pas l'utiliser, sinon rebond garanti." },
  unknown: { label: "À tester",    icon: HelpCircle,    cls: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-300/50",                   tooltip: "Le serveur SMTP du prospect n'autorise pas les vérifications externes (cas fréquent chez Free, OVH, certains hébergeurs). Ça n'empêche pas l'email d'exister : ~65% des emails « à tester » arrivent quand on envoie pour de vrai. Tu peux envoyer en surveillant les rebonds." },
};

export function EmailVerifyBadge({ email, compact = false }: { email: string | null | undefined; compact?: boolean }) {
  const qc = useQueryClient();
  const normalized = (email || "").trim().toLowerCase();

  const { data: verification, isLoading } = useQuery({
    queryKey: ["email-verification", normalized],
    enabled: !!normalized,
    queryFn: async (): Promise<VerificationRow | null> => {
      const { data } = await supabase
        .from("email_verifications")
        .select("email, status, verified_at, expires_at, raw_result, provider")
        .eq("email", normalized)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      return (data as VerificationRow | null) || null;
    },
  });

  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("email-verify", {
        body: { email: normalized },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Erreur de vérification");
      return data as { email: string; status: VerifStatus; source: "cache" | "provider"; verified_at: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["email-verification", normalized] });
      const meta = STATUS_META[data.status];
      const sourceLabel = data.source === "cache" ? "résultat caché" : "nouvelle vérification";
      toast.success(`Email ${meta.label.toLowerCase()} — ${sourceLabel}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!normalized) return null;

  // Pas encore vérifié → bouton "Vérifier"
  if (!verification && !isLoading) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); verify.mutate(); }}
        disabled={verify.isPending}
      >
        {verify.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
        Vérifier
      </Button>
    );
  }

  if (isLoading || !verification) {
    return <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Lecture…</span>;
  }

  const meta = STATUS_META[verification.status];
  const Icon = meta.icon;
  const ago = formatDistanceToNow(new Date(verification.verified_at), { locale: fr, addSuffix: true });

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider cursor-help",
              meta.cls,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon className="h-3 w-3" />
            {!compact && meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold mb-1">Email {meta.label.toLowerCase()}</p>
          <p className="text-xs">{meta.tooltip}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Vérifié {ago} via {verification.provider === "captain_verify" ? "Captain Verify 🇫🇷" : verification.provider}
            {verification.raw_result && verification.raw_result !== verification.status && (
              <span> · réponse brute : <code>{verification.raw_result}</code></span>
            )}
          </p>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); verify.mutate(); }}
            className="text-[10px] underline mt-2 text-primary"
          >
            Re-vérifier maintenant
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
