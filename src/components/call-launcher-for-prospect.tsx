/**
 * ─── CallLauncherForProspect ──────────────────────────────────────────
 *
 * Carte sur la page Scripts permettant de lancer le "Mode appel"
 * (CallModeDrawer) pour un prospect spécifique. Centralise l'expérience
 * d'appel sur la page Scripts au lieu de la fiche prospect.
 *
 * Flux :
 *   1. Recherche / sélection d'un prospect (autocomplete)
 *   2. Carte résumé prospect (nom, société, téléphone, statut)
 *   3. Bouton "Démarrer l'appel" → ouvre CallModeDrawer avec toutes
 *      les variables remplies + scripts + objections + suggestions IA
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, Building2, ArrowRight, X, Headphones } from "lucide-react";
import { CallModeDrawer } from "@/components/call-mode-drawer";

type ProspectMini = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
};

export function CallLauncherForProspect() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProspectMini | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: prospects = [] } = useQuery({
    queryKey: ["call-launcher-prospects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email, phone, status")
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
        `${p.first_name} ${p.last_name} ${p.company || ""} ${p.phone || ""}`
          .toLowerCase()
          .includes(s),
      )
      .slice(0, 12);
  }, [search, prospects]);

  return (
    <>
      <Card className="border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/40 to-transparent dark:from-emerald-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-emerald-600" />
            Démarrer un appel pour un prospect
          </CardTitle>
          <CardDescription>
            Sélectionne un prospect, le Mode appel s'ouvre avec scripts personnalisés, banque d'objections,
            variables pré-remplies et suggestions IA selon la philosophie de l'agence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Rechercher un prospect par nom, société ou téléphone…"
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
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                            <Phone className="h-3 w-3" />
                            {p.phone || <span className="italic">pas de téléphone</span>}
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
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {selected.phone || <span className="italic text-muted-foreground">pas de téléphone renseigné</span>}
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

              {!selected.phone && (
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded border border-amber-200 dark:border-amber-900/50">
                  ⚠️ Ce prospect n'a pas de téléphone — tu pourras quand même ouvrir le Mode appel pour préparer ton pitch.
                </p>
              )}

              <Button
                onClick={() => setDrawerOpen(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <Headphones className="h-4 w-4" />
                Démarrer le Mode appel
              </Button>

              <p className="text-[11px] text-muted-foreground text-center">
                Scripts + banque d'objections + variables pré-remplies + IA selon la philosophie de l'agence
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CallModeDrawer — s'ouvre quand on clique Démarrer */}
      {selected && (
        <CallModeDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          prospect={{
            id: selected.id,
            first_name: selected.first_name,
            last_name: selected.last_name,
            company: selected.company,
            email: selected.email,
            phone: selected.phone,
          }}
        />
      )}
    </>
  );
}
