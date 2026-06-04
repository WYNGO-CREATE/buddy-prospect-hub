/**
 * ─── Chasse aux prospects — Détecteur de TPE sans site web ───
 *
 * Cœur du modèle business Wyngo : on cherche des TPE françaises via Pappers,
 * on vérifie leur statut web via website-checker, on les classifie automatiquement
 * (🔥 pas de site / 🟡 site obsolète / ✅ site OK), et on ajoute les CIBLES
 * PRIME au CRM en 1 clic — déjà tagguées pour campagne ciblée.
 *
 * Workflow :
 *   1. Filtre activité (code NAF) + ville + effectif → Pappers
 *   2. Pour chaque résultat → website-checker en parallèle (concurrent limited)
 *   3. Tri auto : pas de site → obsolètes → ignore "has_website"
 *   4. Sélection + ajout bulk au CRM avec tag "chasse_<date>"
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Flame,
  AlertTriangle,
  Globe,
  MapPin,
  Building2,
  Phone,
  Mail,
  ExternalLink,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/chasse")({
  component: ChassePage,
  head: () => ({ meta: [{ title: "Chasse aux prospects — Wyngo" }] }),
});

// ─── Types ────────────────────────────────────────────────────────────────

type PappersResult = {
  siren: string;
  siret: string | null;
  nom: string;
  code_naf: string | null;
  libelle_naf: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  tranche_effectif: string | null;
  site_web: string | null;
  email: string | null;
  telephone: string | null;
  date_creation: string | null;
  dirigeant_principal: {
    prenom: string;
    nom: string;
    qualite: string;
  } | null;
};

type WebsiteStatus = "no_website" | "outdated" | "has_website" | "unknown";

type EnrichedResult = PappersResult & {
  website_status: WebsiteStatus;
  website_score: number;
  website_url: string | null;
  checking: boolean;
};

// Codes NAF de TPE typiques pour Wyngo
const NAF_PRESETS: Array<{ label: string; code: string }> = [
  { label: "Boulangerie - Pâtisserie", code: "10.71B" },
  { label: "Salon de coiffure", code: "96.02A" },
  { label: "Conseil aux entreprises", code: "70.22Z" },
  { label: "Expertise comptable", code: "69.20Z" },
  { label: "Conseil juridique", code: "69.10Z" },
  { label: "Restaurant", code: "56.10A" },
  { label: "Plomberie", code: "43.22A" },
  { label: "Électricité bâtiment", code: "43.21A" },
  { label: "Architecture", code: "71.11Z" },
  { label: "Photographie", code: "74.20Z" },
];

// Tranches d'effectif Pappers
const EFFECTIF_PRESETS: Array<{ label: string; code: string }> = [
  { label: "Sans salarié", code: "0" },
  { label: "1 à 2 salariés", code: "01" },
  { label: "3 à 5 salariés", code: "02" },
  { label: "6 à 9 salariés", code: "03" },
  { label: "10 à 19 salariés", code: "11" },
];

const STATUS_META: Record<
  WebsiteStatus,
  { label: string; emoji: string; cls: string; priority: number }
> = {
  no_website: {
    label: "Pas de site",
    emoji: "🔥",
    cls: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
    priority: 0,
  },
  outdated: {
    label: "Site obsolète",
    emoji: "🟡",
    cls: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    priority: 1,
  },
  has_website: {
    label: "Site OK",
    emoji: "✅",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    priority: 3,
  },
  unknown: {
    label: "Vérif en cours",
    emoji: "⏳",
    cls: "bg-muted text-muted-foreground border-border",
    priority: 2,
  },
};

// ─── Composant principal ──────────────────────────────────────────────────

function ChassePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Form state
  const [codeNaf, setCodeNaf] = useState("70.22Z");
  const [ville, setVille] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [effectif, setEffectif] = useState("01");

  // Results
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [selectedSirens, setSelectedSirens] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);

  // Test connexion Pappers
  const connectionTest = useQuery({
    queryKey: ["pappers-test"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pappers-search", {
        body: { action: "test" },
      });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error!);
      return data;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // SIRET déjà importés (pour griser le bouton "Ajouter")
  const importedSirets = useQuery({
    queryKey: ["imported-sirets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Cast : siret/website_status sont ajoutés par migration récente,
      // les types Supabase générés ne les connaissent pas encore.
      const { data } = await (supabase as any)
        .from("prospects")
        .select("siret")
        .eq("owner_id", user!.id)
        .not("siret", "is", null);
      return new Set(
        ((data || []) as Array<{ siret: string | null }>)
          .map((r) => r.siret)
          .filter(Boolean) as string[],
      );
    },
  });

  // ─── Recherche Pappers + checks websites en parallèle ──────────────────
  const search = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pappers-search", {
        body: {
          action: "search",
          params: {
            code_naf: codeNaf,
            ville: ville || undefined,
            code_postal: codePostal || undefined,
            tranche_effectif: effectif || undefined,
            par_page: 50,
          },
        },
      });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error?: string }).error!);
      const entreprises = (data as { entreprises?: PappersResult[] }).entreprises || [];
      const total = (data as { pagination?: { total?: number } }).pagination?.total;

      // Marque toutes comme "checking" puis on lance les checks en parallèle
      const enriched: EnrichedResult[] = entreprises.map((e) => ({
        ...e,
        website_status: "unknown" as WebsiteStatus,
        website_score: 0,
        website_url: e.site_web,
        checking: true,
      }));
      setResults(enriched);

      // Check des sites en parallèle limité à 5 simultanés (pour pas DDoS le bot)
      setChecking(true);
      setProgress(0);
      const CONCURRENCY = 5;
      let done = 0;
      const queue = [...enriched];

      async function worker() {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          try {
            const { data: checkData } = await supabase.functions.invoke("website-checker", {
              body: { company_name: item.nom, hint_url: item.site_web || undefined },
            });
            const r = checkData as {
              status?: WebsiteStatus;
              score?: number;
              url?: string | null;
            } | null;
            const status = r?.status || "unknown";
            const score = r?.score ?? 0;
            const url = r?.url ?? null;
            setResults((prev) =>
              prev.map((p) =>
                p.siren === item.siren
                  ? { ...p, website_status: status, website_score: score, website_url: url, checking: false }
                  : p,
              ),
            );
          } catch {
            setResults((prev) =>
              prev.map((p) => (p.siren === item.siren ? { ...p, checking: false } : p)),
            );
          }
          done++;
          setProgress(Math.round((done / enriched.length) * 100));
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setChecking(false);
      return { count: enriched.length, total: total ?? enriched.length };
    },
    onSuccess: (res) => {
      toast.success(
        `${res.count} entreprises analysées (sur ${res.total.toLocaleString("fr-FR")} disponibles)`,
      );
    },
    onError: (e: Error) => {
      setChecking(false);
      toast.error("Échec de la recherche", { description: e.message });
    },
  });

  // ─── Ajout bulk au CRM ─────────────────────────────────────────────────
  const addBulk = useMutation({
    mutationFn: async (selected: EnrichedResult[]) => {
      if (!user) throw new Error("Non connecté");
      const today = new Date().toISOString().slice(0, 10);
      const batchTag = `chasse_${today}`;

      const payloads = selected.map((r) => {
        // Le dirigeant principal devient le contact ; à défaut, on fallback sur le nom de l'entreprise
        const prenom = r.dirigeant_principal?.prenom?.trim() || "—";
        const nom = r.dirigeant_principal?.nom?.trim() || r.nom;
        return {
          owner_id: user.id,
          first_name: prenom,
          last_name: nom,
          company: r.nom,
          title: r.dirigeant_principal?.qualite || null,
          email: r.email || null,
          phone: r.telephone || null,
          website: r.website_url || null,
          location: [r.ville, r.code_postal].filter(Boolean).join(" "),
          siret: r.siret,
          industry: r.libelle_naf,
          source: "pappers",
          website_status: r.website_status,
          website_score: r.website_score,
          website_checked_at: new Date().toISOString(),
          tags: [batchTag, STATUS_META[r.website_status].label.toLowerCase().replace(/\s+/g, "_")],
        };
      });

      const { data, error } = await supabase.from("prospects").insert(payloads as never).select("id");
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`${count} prospect(s) ajouté(s) au CRM`);
      setSelectedSirens(new Set());
      qc.invalidateQueries({ queryKey: ["imported-sirets"] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
    },
    onError: (e: Error) => toast.error("Échec ajout", { description: e.message }),
  });

  // ─── Résultats triés (cibles prime d'abord) ────────────────────────────
  const sortedResults = useMemo(
    () =>
      [...results].sort(
        (a, b) =>
          STATUS_META[a.website_status].priority - STATUS_META[b.website_status].priority,
      ),
    [results],
  );

  const counts = useMemo(() => {
    const c = { no_website: 0, outdated: 0, has_website: 0, unknown: 0 };
    for (const r of results) c[r.website_status]++;
    return c;
  }, [results]);

  const selectedResults = useMemo(
    () => sortedResults.filter((r) => selectedSirens.has(r.siren)),
    [sortedResults, selectedSirens],
  );

  const toggleSelect = (siren: string) =>
    setSelectedSirens((prev) => {
      const next = new Set(prev);
      next.has(siren) ? next.delete(siren) : next.add(siren);
      return next;
    });

  const selectAllPrime = () => {
    const prime = sortedResults
      .filter((r) => r.website_status === "no_website" || r.website_status === "outdated")
      .filter((r) => !importedSirets.data?.has(r.siret ?? ""))
      .map((r) => r.siren);
    setSelectedSirens(new Set(prime));
  };

  const isConnected = connectionTest.data && !connectionTest.isError;

  // ─── UI ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Chasse aux prospects
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trouve des TPE françaises et détecte automatiquement celles sans site web.
          </p>
        </div>
        {connectionTest.isPending ? (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Connexion…
          </Badge>
        ) : isConnected ? (
          <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Pappers connecté
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Pappers non connecté
          </Badge>
        )}
      </div>

      {connectionTest.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm space-y-2">
            <div className="font-medium text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Pappers n'est pas connecté
            </div>
            <p className="text-muted-foreground">{(connectionTest.error as Error)?.message}</p>
            <p className="text-muted-foreground">
              Ajoute le secret <code className="px-1 py-0.5 rounded bg-muted">PAPPERS_API_KEY</code> dans{" "}
              <strong>Supabase Dashboard → Edge Functions → Secrets</strong>. Récupère ta clé sur{" "}
              <a href="https://www.pappers.fr/api" target="_blank" rel="noreferrer" className="underline">
                pappers.fr/api
              </a>{" "}
              (plan Pro 19€/mois).
            </p>
          </CardContent>
        </Card>
      )}

      {/* Formulaire de recherche */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Critères de recherche
          </CardTitle>
          <CardDescription>
            Active la combinaison qui correspond à TA cible (TPE françaises selon métier + zone).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="naf">Activité (code NAF)</Label>
              <div className="flex gap-2">
                <select
                  id="naf"
                  className="flex-1 text-sm border rounded-md px-2 py-2 bg-background"
                  value={codeNaf}
                  onChange={(e) => setCodeNaf(e.target.value)}
                >
                  {NAF_PRESETS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label} ({p.code})
                    </option>
                  ))}
                </select>
                <Input
                  className="w-28"
                  placeholder="ou 10.71B"
                  value={codeNaf}
                  onChange={(e) => setCodeNaf(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effectif">Effectif</Label>
              <select
                id="effectif"
                className="w-full text-sm border rounded-md px-2 py-2 bg-background"
                value={effectif}
                onChange={(e) => setEffectif(e.target.value)}
              >
                <option value="">— Tous —</option>
                {EFFECTIF_PRESETS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ville">Ville</Label>
              <Input
                id="ville"
                placeholder="ex: Toulouse"
                value={ville}
                onChange={(e) => setVille(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp">Code postal</Label>
              <Input
                id="cp"
                placeholder="ex: 31000"
                value={codePostal}
                onChange={(e) => setCodePostal(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => search.mutate()}
              disabled={!isConnected || search.isPending || checking}
              className="gap-2"
            >
              {search.isPending || checking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Lancer la chasse
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress des checks websites */}
      {checking && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Analyse des sites web en cours…
              </span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Résultats */}
      {results.length > 0 && (
        <>
          {/* Compteurs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                <Flame className="h-5 w-5" /> {counts.no_website}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Pas de site (prime)</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-5 w-5" /> {counts.outdated}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Site obsolète</div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-5 w-5" /> {counts.has_website}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Site OK (skip)</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <div className="text-2xl font-bold flex items-center gap-1">
                <Loader2 className="h-5 w-5 animate-spin" /> {counts.unknown}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">En cours</div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllPrime}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Tout sélectionner (prime + obsolète)
              </Button>
              {selectedSirens.size > 0 && (
                <Button variant="outline" size="sm" onClick={() => setSelectedSirens(new Set())}>
                  Désélectionner
                </Button>
              )}
            </div>
            {selectedSirens.size > 0 && (
              <Button
                onClick={() => addBulk.mutate(selectedResults)}
                disabled={addBulk.isPending}
                className="gap-2"
              >
                {addBulk.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Ajouter {selectedSirens.size} au CRM
              </Button>
            )}
          </div>

          {/* Liste */}
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                {sortedResults.map((r) => {
                  const meta = STATUS_META[r.website_status];
                  const isImported = r.siret ? importedSirets.data?.has(r.siret) : false;
                  const isSelected = selectedSirens.has(r.siren);
                  return (
                    <div
                      key={r.siren}
                      className={`flex items-start gap-3 p-3 rounded-lg border bg-card transition ${
                        isSelected ? "ring-2 ring-primary" : "hover:bg-accent/30"
                      } ${isImported ? "opacity-60" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isImported || r.website_status === "has_website"}
                        onChange={() => toggleSelect(r.siren)}
                        className="mt-1.5 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-medium truncate">{r.nom}</span>
                          <Badge variant="outline" className={meta.cls}>
                            {meta.emoji} {meta.label}
                          </Badge>
                          {isImported && (
                            <Badge variant="outline" className="text-xs">
                              déjà dans CRM
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                          {r.libelle_naf && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {r.libelle_naf}
                            </span>
                          )}
                          {r.ville && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {r.ville} {r.code_postal}
                            </span>
                          )}
                          {r.tranche_effectif && <span>{r.tranche_effectif}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                          {r.dirigeant_principal && (
                            <span className="font-medium text-foreground">
                              {r.dirigeant_principal.prenom} {r.dirigeant_principal.nom}
                              {r.dirigeant_principal.qualite && (
                                <span className="text-muted-foreground font-normal">
                                  {" "}
                                  · {r.dirigeant_principal.qualite}
                                </span>
                              )}
                            </span>
                          )}
                          {r.telephone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {r.telephone}
                            </span>
                          )}
                          {r.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {r.email}
                            </span>
                          )}
                          {r.website_url && (
                            <a
                              href={r.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              <Globe className="h-3 w-3" /> {r.website_url.replace(/^https?:\/\//, "")}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
