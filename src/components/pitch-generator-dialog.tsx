/**
 * ─── PitchGeneratorDialog — Email cold IA personnalisé pour un prospect ───
 *
 * Bouton + dialog qui :
 *   1. Appelle la edge function `generate-pitch` avec le prospect_id
 *   2. Affiche subject + body éditables (objet et corps de l'email)
 *   3. Liste les observations IA (les angles que l'IA a utilisés)
 *   4. Permet d'envoyer directement via Gmail OU de copier le texte
 *
 * L'IA va :
 *   • Lire le contexte agence (brief, value props depuis agency_settings)
 *   • Analyser le statut du site web du prospect (no/outdated/has)
 *   • Récupérer un snapshot du site si présent (titre, description, excerpt)
 *   • Générer un cold email ULTRA-personnalisé
 *
 * Comparé aux templates classiques, l'email est :
 *   • UNIQUE pour chaque prospect (pas un copier-coller)
 *   • Ouvert sur un détail spécifique du prospect
 *   • Pointe la douleur exacte (site obsolète, pas de site)
 *   • Suggère un CTA soft, pas commercial
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, RefreshCw, Copy, Send, Eye } from "lucide-react";
import { toast } from "sonner";

type GenerateResult = {
  subject: string;
  body: string;
  observations: string[];
  model: string;
  website_snapshot_used: boolean;
};

export function PitchGeneratorDialog({
  prospectId,
  prospectEmail,
  children,
}: {
  prospectId: string;
  prospectEmail?: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-pitch", {
        body: { prospect_id: prospectId },
      });
      if (error) {
        // Détail si dispo
        let detail = error.message;
        try {
          const ctx = await (error as { context?: { json?: () => Promise<unknown> } }).context?.json?.();
          if ((ctx as { error?: string })?.error) detail = (ctx as { error: string }).error;
        } catch {
          /* noop */
        }
        throw new Error(detail);
      }
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      return data as GenerateResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditedSubject(data.subject);
      setEditedBody(data.body);
      toast.success("Pitch généré", {
        description: `${data.observations.length} angles identifiés · modèle ${data.model}`,
      });
    },
    onError: (e: Error) => {
      toast.error("Échec génération", { description: e.message });
    },
  });

  const sendViaGmail = useMutation({
    mutationFn: async () => {
      if (!prospectEmail) throw new Error("Pas d'email pour ce prospect");
      const { data, error } = await supabase.functions.invoke("gmail-send", {
        body: {
          prospect_id: prospectId,
          to: prospectEmail,
          subject: editedSubject,
          body: editedBody,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Email envoyé via Gmail");
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Envoi échoué", { description: e.message }),
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(`Objet : ${editedSubject}\n\n${editedBody}`);
      toast.success("Pitch copié dans le presse-papier");
    } catch {
      toast.error("Copie impossible");
    }
  };

  // Lance la génération à l'ouverture si pas encore généré
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !result && !generate.isPending) {
      generate.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Pitch IA personnalisé
          </DialogTitle>
          <DialogDescription>
            L'IA analyse le profil du prospect (site web, secteur, statut) et génère un email cold
            sur-mesure adapté à ton offre Wyngo.
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {generate.isPending && !result && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-10 w-10 mx-auto text-violet-500 animate-spin" />
            <p className="text-sm font-medium">Analyse du prospect…</p>
            <p className="text-xs text-muted-foreground">
              Lecture du site • Identification des angles • Rédaction
            </p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4">
            {/* Observations clés */}
            {result.observations.length > 0 && (
              <div className="rounded-lg border bg-violet-50/40 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-violet-900 dark:text-violet-300 mb-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Angles utilisés par l'IA
                </div>
                <ul className="text-xs text-violet-800 dark:text-violet-300 space-y-1">
                  {result.observations.map((obs, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-violet-500 mt-0.5">→</span>
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
                {result.website_snapshot_used && (
                  <p className="text-[10px] text-violet-700 dark:text-violet-400 mt-2 italic">
                    L'IA a analysé le contenu du site du prospect pour personnaliser.
                  </p>
                )}
              </div>
            )}

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="pitch-subject" className="text-xs uppercase tracking-wider text-muted-foreground">
                Objet
              </Label>
              <Input
                id="pitch-subject"
                value={editedSubject}
                onChange={(e) => setEditedSubject(e.target.value)}
                className="font-medium"
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="pitch-body" className="text-xs uppercase tracking-wider text-muted-foreground">
                Corps du mail
              </Label>
              <Textarea
                id="pitch-body"
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                rows={14}
                className="font-mono text-sm leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground">
                Les variables <code className="px-1 py-0.5 rounded bg-muted">{"{{prenom}}"}</code>,{" "}
                <code className="px-1 py-0.5 rounded bg-muted">{"{{expediteur}}"}</code>,{" "}
                <code className="px-1 py-0.5 rounded bg-muted">{"{{agence}}"}</code> seront remplacées
                à l'envoi.
              </p>
            </div>

            <Badge variant="outline" className="text-[10px]">
              Modèle : {result.model}
            </Badge>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {result && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResult(null);
                  generate.mutate();
                }}
                disabled={generate.isPending}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regénérer
              </Button>
              <Button variant="outline" size="sm" onClick={copyToClipboard} className="gap-2">
                <Copy className="h-3.5 w-3.5" />
                Copier
              </Button>
              <Button
                onClick={() => sendViaGmail.mutate()}
                disabled={sendViaGmail.isPending || !prospectEmail}
                className="gap-2"
                title={prospectEmail ? "Envoyer via Gmail" : "Pas d'email pour ce prospect"}
              >
                {sendViaGmail.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer via Gmail
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
