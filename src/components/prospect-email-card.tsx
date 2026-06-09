/**
 * ─── ProspectEmailCard — Carte Email autonome de la fiche prospect ────
 *
 * Encapsule tout le comportement de la carte Email :
 *   - Affiche l'email + sa pastille de vérification (ou le bouton "Trouver")
 *   - Rend la carte cliquable (mailto:) UNIQUEMENT quand l'email est sûr
 *     (valide / à risque / pas encore vérifié)
 *   - Quand l'email est "à tester" (unknown) ou "invalide", la carte NE
 *     redirige PLUS : on n'ouvre pas le client mail avec une adresse non
 *     confirmée (ça enverrait à une adresse devinée). On affiche une note.
 *
 * La logique de statut vit ici (une seule query) pour décider du clic.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailVerifyBadge } from "@/components/email-verify-badge";
import { EmailFinderButton } from "@/components/email-finder-button";

type VerifStatus = "valid" | "risky" | "invalid" | "unknown";

export function ProspectEmailCard({
  prospect,
}: {
  prospect: {
    id: string;
    email: string | null;
    company: string | null;
    website: string | null;
    first_name: string;
    last_name: string;
    city?: string | null;
  };
}) {
  const email = (prospect.email || "").trim().toLowerCase();

  // Statut de vérification (cache mutualisé) — décide si on autorise le mailto.
  // Même queryKey + même shape que EmailVerifyBadge → cache partagé, donc
  // dès que le badge vérifie, cette carte se met à jour (clic recalculé).
  const { data: verification } = useQuery({
    queryKey: ["email-verification", email],
    enabled: !!email,
    queryFn: async () => {
      const { data } = await supabase
        .from("email_verifications")
        .select("email, status, verified_at, expires_at, raw_result, provider")
        .eq("email", email)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      return data || null;
    },
  });
  const status = (verification?.status as VerifStatus | undefined) ?? null;

  // On autorise le clic mailto seulement si l'email n'est pas "douteux".
  // - valide / à risque / pas encore vérifié (null) → cliquable
  // - "à tester" (unknown) / invalide → NON cliquable (pas de redirection)
  const isUnsafe = status === "unknown" || status === "invalid";
  const clickable = !!email && !isUnsafe;

  const baseClass = "flex items-center gap-3 p-3 rounded-lg border transition";

  const inner = (
    <>
      <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center flex-shrink-0">
        <Mail className="h-5 w-5 text-blue-700 dark:text-blue-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Email</p>
        <p className="font-semibold truncate">{prospect.email || "Non renseigné"}</p>
        {isUnsafe && (
          <p className="text-[10px] text-sky-600 dark:text-sky-400 inline-flex items-center gap-1 mt-0.5">
            <Ban className="h-2.5 w-2.5" />
            {status === "invalid" ? "Adresse invalide — non cliquable" : "Non confirmée — vérifie avant d'écrire"}
          </p>
        )}
      </div>
      <div onClick={(e) => e.preventDefault()} className="flex-shrink-0">
        {prospect.email ? (
          <EmailVerifyBadge email={prospect.email} />
        ) : (
          <EmailFinderButton
            prospectId={prospect.id}
            companyName={prospect.company}
            city={prospect.city}
            websiteUrl={prospect.website}
            dirigeantFirstName={prospect.first_name}
            dirigeantLastName={prospect.last_name}
          />
        )}
      </div>
    </>
  );

  // Carte cliquable (mailto) si email sûr, sinon simple div sans redirection.
  if (clickable) {
    return (
      <a href={`mailto:${prospect.email}`} className={cn(baseClass, "hover:bg-accent/50 cursor-pointer")}>
        {inner}
      </a>
    );
  }
  return (
    <div className={cn(baseClass, !email && "opacity-60", isUnsafe && "cursor-default")}>
      {inner}
    </div>
  );
}
