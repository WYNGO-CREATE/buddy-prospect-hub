/**
 * ─── EmailGeneratorForProspect ────────────────────────────────────────
 *
 * Carte de génération d'email IA pour un prospect, centralisée sur la page
 * "Génération d'emails" (ex /templates).
 *
 * Avant : le bouton "Pitch IA" était sur chaque fiche prospect. Maintenant
 * on dissocie : la GÉNÉRATION se fait depuis cette page centralisée
 * (qualité contrôlée, par l'admin ou un commercial expérimenté), et le
 * SUIVI apparaît automatiquement sur la fiche du prospect (via la table
 * messages alimentée par gmail-send).
 *
 * Flux :
 *   1. Recherche / sélection d'un prospect (autocomplete par nom/société/email)
 *   2. Affiche un résumé : nom + société + email + statut
 *   3. Bouton "Générer l'email IA" → ouvre le PitchGeneratorDialog existant
 *      qui appelle generate-pitch et permet d'envoyer via Gmail
 *
 * L'email envoyé est automatiquement loggé dans messages (gmail-send le fait)
 * → apparait dans l'onglet Discussion/Historique de la fiche prospect.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Mail, Building2, ArrowRight, X } from "lucide-react";
import { PitchGeneratorDialog } from "@/components/pitch-generator-dialog";

type ProspectMini = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  status: string | null;
};

export function EmailGeneratorForProspect() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProspectMini | null>(null);

  // ─── Recherche prospects (filtrée client-side pour ergonomie) ────────
  const { data: prospects = [] } = useQuery({
    queryKey: ["email-gen-prospects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email, status")
        .order("updated_at", { ascending: false })
        .limit(500);
      return (data || []) as ProspectMini[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return prospects.slice(0, 12);
    const s = search.toLowerCase().trim();
    return prospects
      .filter((p) =>
        `${p.first_name} ${p.last_name} ${p.company || ""} ${p.email || ""}`
          .toLowerCase()
          .includes(s)
      )
      .slice(0, 12);
  }, [search, prospects]);

  return (
    <Card className="border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/40 to-transparent dark:from-violet-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-violet-600" />
          Générer un email IA pour un prospect
        </CardTitle>
        <CardDescription>
          Sélectionne un prospect, l'IA Wyngo génère un email cold ULTRA-personnalisé
          (analyse de son site, brief, secteur). L'envoi via Gmail est tracé
          automatiquement dans le suivi de la fiche prospect.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ─── Cas 1 : aucun prospect sélectionné → recherche ─── */}
        {!selected && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher un prospect par nom, société ou email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                {search.trim() ? "Aucun prospect ne correspond" : "Aucun prospect dans le CRM"}
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card overflow-hidden">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {p.first_name} {p.last_name}
                          {p.company && <span className="text-muted-foreground"> · {p.company}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.email || <span className="italic">pas d'email</span>}
                        </p>
                      </div>
                      {p.status && (
                        <Badge variant="outline" className="text-[10px] flex-shrink-0">
                          {p.status}
                        </Badge>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!search.trim() && prospects.length > 12 && (
              <p className="text-[11px] text-muted-foreground text-center">
                Affichage des 12 plus récents · tape pour rechercher dans les {prospects.length} prospects
              </p>
            )}
          </>
        )}

        {/* ─── Cas 2 : prospect sélectionné → générer l'email ─── */}
        {selected && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{selected.first_name} {selected.last_name}</p>
                  {selected.status && (
                    <Badge variant="outline" className="text-[10px]">{selected.status}</Badge>
                  )}
                </div>
                {selected.company && (
                  <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" /> {selected.company}
                  </p>
                )}
                <p className="text-sm inline-flex items-center gap-1.5 mt-0.5">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  {selected.email || <span className="italic text-muted-foreground">pas d'email renseigné</span>}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelected(null); setSearch(""); }}
                className="text-muted-foreground"
                title="Changer de prospect"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!selected.email && (
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded border border-amber-200 dark:border-amber-900/50">
                ⚠️ Ce prospect n'a pas d'email — tu pourras générer le contenu mais pas l'envoyer directement par Gmail.
              </p>
            )}

            <PitchGeneratorDialog
              prospectId={selected.id}
              prospectEmail={selected.email}
            >
              <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2">
                <Mail className="h-4 w-4" />
                Générer l'email IA personnalisé
              </Button>
            </PitchGeneratorDialog>

            <p className="text-[11px] text-muted-foreground text-center">
              L'email sera automatiquement loggé dans le suivi de la fiche prospect après envoi
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
