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
import { useEffect, useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

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
  // Enrichissements
  google_phone: string | null;
  google_address: string | null;
  google_rating: number | null;
  scraped_email: string | null;
  hunter_email: string | null;
  // États
  checking: boolean;
  enriching: boolean;
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

  // Results — persistés dans localStorage pour ne pas perdre l'historique
  // entre les navigations. Les nouvelles recherches AJOUTENT (dédup par SIREN)
  // au lieu d'écraser. Bouton "Effacer" disponible pour repartir à zéro.
  const STORAGE_KEY = "wyngo.chasse.results.v1";
  const [results, setResults] = useState<EnrichedResult[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored) as EnrichedResult[];
    } catch { /* corrupted JSON → on ignore */ }
    return [];
  });
  // Sauvegarde à chaque mise à jour (debounced via React's batching).
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
    } catch { /* quota dépassé → silencieux */ }
  }, [results]);

  const [selectedSirens, setSelectedSirens] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  // Filtre : ne montrer que les prospects avec au moins un moyen de contact
  const [onlyWithContact, setOnlyWithContact] = useState(true);

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

      // Marque toutes comme "checking" puis on lance les checks en parallèle.
      // On garde les SIREN déjà connus dans le state pour dédupliquer et
      // PRÉSERVER l'historique (l'utilisateur veut naviguer entre prospects
      // de plusieurs chasses sans tout perdre).
      const existingSirens = new Set(results.map((r) => r.siren));
      const newOnes: EnrichedResult[] = entreprises
        .filter((e) => !existingSirens.has(e.siren))
        .map((e) => ({
          ...e,
          website_status: "unknown" as WebsiteStatus,
          website_score: 0,
          website_url: e.site_web,
          google_phone: null,
          google_address: null,
          google_rating: null,
          scraped_email: null,
          hunter_email: null,
          checking: true,
          enriching: true,
        }));
      const duplicates = entreprises.length - newOnes.length;
      // Append: nouveaux d'abord, anciens à la suite pour visibilité
      setResults((prev) => [...newOnes, ...prev]);
      if (newOnes.length === 0) {
        setChecking(false);
        return { count: 0, total: total ?? 0, duplicates };
      }
      const enriched = newOnes;

      setChecking(true);
      setProgress(0);
      const CONCURRENCY = 4;
      let done = 0;
      const queue = [...enriched];

      // Pour chaque entreprise, on lance EN PARALLÈLE :
      //   1. website-checker  → classifie le statut du site
      //   2. places-enrich    → téléphone + site officiel via Google Maps
      //   3. scrape-email     → extrait l'email depuis le site (si on en a un)
      //   4. hunter-find      → fallback si scraping a rien donné
      async function enrichOne(item: EnrichedResult) {
        // Étape 1+2 en parallèle (indépendants)
        const [checkRes, placesRes] = await Promise.allSettled([
          supabase.functions.invoke("website-checker", {
            body: { company_name: item.nom, hint_url: item.site_web || undefined },
          }),
          supabase.functions.invoke("places-enrich", {
            body: { name: item.nom, city: item.ville, code_postal: item.code_postal },
          }),
        ]);

        const checkData = checkRes.status === "fulfilled" ? (checkRes.value.data as any) : null;
        const placesData = placesRes.status === "fulfilled" ? (placesRes.value.data as any) : null;
        const place = placesData?.place;

        const status: WebsiteStatus = checkData?.status || "unknown";
        const score: number = checkData?.score ?? 0;
        // Le site officiel Google Maps est souvent plus fiable que celui devinéb
        const url: string | null = checkData?.url || place?.website || item.site_web || null;

        // Étape 3 : scraping email si on a un site
        let scrapedEmail: string | null = null;
        if (url) {
          try {
            const { data: scrapeData } = await supabase.functions.invoke("email-scraper", {
              body: { url },
            });
            scrapedEmail = (scrapeData as any)?.email || null;
          } catch {
            // silencieux
          }
        }

        // Étape 4 : Hunter fallback si scraping vide ET on a un domaine
        let hunterEmail: string | null = null;
        if (!scrapedEmail && url) {
          try {
            const domain = new URL(url).hostname.replace(/^www\./, "");
            const { data: hunterData } = await supabase.functions.invoke("hunter-find", {
              body: { action: "domain-search", params: { domain } },
            });
            hunterEmail = (hunterData as any)?.email || null;
          } catch {
            // silencieux (Hunter pas configuré OU quota dépassé)
          }
        }

        setResults((prev) =>
          prev.map((p) =>
            p.siren === item.siren
              ? {
                  ...p,
                  website_status: status,
                  website_score: score,
                  website_url: url,
                  google_phone: place?.phone || null,
                  google_address: place?.address || null,
                  google_rating: place?.rating || null,
                  scraped_email: scrapedEmail,
                  hunter_email: hunterEmail,
                  checking: false,
                  enriching: false,
                }
              : p,
          ),
        );
      }

      async function worker() {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          try {
            await enrichOne(item);
          } catch {
            setResults((prev) =>
              prev.map((p) =>
                p.siren === item.siren ? { ...p, checking: false, enriching: false } : p,
              ),
            );
          }
          done++;
          setProgress(Math.round((done / enriched.length) * 100));
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      setChecking(false);
      return {
        count: enriched.length,
        total: total ?? enriched.length,
        duplicates,
      };
    },
    onSuccess: (res) => {
      const parts = [`${res.count} ajoutées`];
      if (res.duplicates) parts.push(`${res.duplicates} déjà présentes`);
      parts.push(`sur ${res.total.toLocaleString("fr-FR")} disponibles`);
      toast.success(parts.join(" — "));
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

      // Garde-fou : on n'importe JAMAIS un prospect sans email ni téléphone
      const eligible = selected.filter(
        (r) =>
          (r.scraped_email || r.hunter_email || r.email) ||
          (r.google_phone || r.telephone),
      );
      const skipped = selected.length - eligible.length;
      if (eligible.length === 0) {
        throw new Error(
          "Aucun prospect sélectionné n'a d'email ni de téléphone. Les prospects sans coordonnées ne sont pas ajoutés.",
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      const batchTag = `chasse_${today}`;

      const payloads = eligible.map((r) => {
        // Si pas de dirigeant identifié, on met "Contact" en first_name et la
        // société comme last_name (au lieu d'un "—" moche qui pollue le CRM).
        const prenom = r.dirigeant_principal?.prenom?.trim() || "Contact";
        const nom = r.dirigeant_principal?.nom?.trim() || r.nom;
        const email = r.scraped_email || r.hunter_email || r.email || null;
        const phone = r.google_phone || r.telephone || null;
        const loc =
          r.google_address || [r.adresse, r.code_postal, r.ville].filter(Boolean).join(" ");
        return {
          owner_id: user.id,
          first_name: prenom,
          last_name: nom,
          company: r.nom,
          title: r.dirigeant_principal?.qualite || null,
          email,
          phone,
          website: r.website_url || null,
          location: loc,
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
      return { created: data?.length ?? 0, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      if (skipped > 0) {
        toast.success(`${created} prospect(s) ajouté(s) — ${skipped} ignoré(s) sans coordonnées`);
      } else {
        toast.success(`${created} prospect(s) ajouté(s) au CRM`);
      }
      setSelectedSirens(new Set());
      qc.invalidateQueries({ queryKey: ["imported-sirets"] });
      qc.invalidateQueries({ queryKey: ["prospects"] });
    },
    onError: (e: Error) => toast.error("Échec ajout", { description: e.message }),
  });

  // ─── Helpers : un prospect a-t-il un moyen de contact ? ───
  const bestPhone = (r: EnrichedResult) => r.google_phone || r.telephone || null;
  const bestEmail = (r: EnrichedResult) =>
    r.scraped_email || r.hunter_email || r.email || null;
  const hasContact = (r: EnrichedResult) => !!(bestPhone(r) || bestEmail(r));

  // ─── Résultats triés (cibles prime d'abord) + filtre "avec contact" ────
  const sortedResults = useMemo(() => {
    const sorted = [...results].sort(
      (a, b) =>
        STATUS_META[a.website_status].priority - STATUS_META[b.website_status].priority,
    );
    if (onlyWithContact) {
      return sorted.filter((r) => r.enriching || hasContact(r));
    }
    return sorted;
  }, [results, onlyWithContact]);

  const counts = useMemo(() => {
    const c = { no_website: 0, outdated: 0, has_website: 0, unknown: 0, with_contact: 0 };
    for (const r of results) {
      c[r.website_status]++;
      if (hasContact(r)) c.with_contact++;
    }
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
      .filter((r) => hasContact(r)) // n'ajoute jamais sans coordonnées
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
            <div className="flex gap-2 items-center flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAllPrime}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Tout sélectionner (prime + obsolète)
              </Button>
              {selectedSirens.size > 0 && (
                <Button variant="outline" size="sm" onClick={() => setSelectedSirens(new Set())}>
                  Désélectionner
                </Button>
              )}
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none ml-2">
                <input
                  type="checkbox"
                  checked={onlyWithContact}
                  onChange={(e) => setOnlyWithContact(e.target.checked)}
                  className="rounded"
                />
                Seulement avec contact ({counts.with_contact}/{results.length})
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Effacer les ${results.length} résultat(s) actuels ? Les prospects déjà ajoutés au CRM restent.`)) {
                    setResults([]);
                    setSelectedSirens(new Set());
                  }
                }}
                className="text-muted-foreground hover:text-rose-600"
              >
                Effacer les résultats
              </Button>
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
                          {/* Badges contact : vert si trouvé, rouge si manquant */}
                          {!r.enriching && (
                            <>
                              <Badge
                                variant="outline"
                                title={bestPhone(r) ? `Téléphone : ${bestPhone(r)}` : "Aucun téléphone trouvé"}
                                className={cn(
                                  "text-[10px] gap-1",
                                  bestPhone(r)
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : "bg-rose-50 text-rose-700 border-rose-300",
                                )}
                              >
                                <Phone className="h-3 w-3" />
                                {bestPhone(r) ? "OK" : "—"}
                              </Badge>
                              <Badge
                                variant="outline"
                                title={bestEmail(r) ? `Email : ${bestEmail(r)}` : "Aucun email trouvé"}
                                className={cn(
                                  "text-[10px] gap-1",
                                  bestEmail(r)
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : "bg-rose-50 text-rose-700 border-rose-300",
                                )}
                              >
                                <Mail className="h-3 w-3" />
                                {bestEmail(r) ? "OK" : "—"}
                              </Badge>
                            </>
                          )}
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
                          {(r.google_phone || r.telephone) && (
                            <a
                              href={`tel:${r.google_phone || r.telephone}`}
                              className="inline-flex items-center gap-1 text-foreground hover:underline"
                            >
                              <Phone className="h-3 w-3" />
                              {r.google_phone || r.telephone}
                              {r.google_phone && (
                                <span className="text-[10px] text-emerald-600 ml-1">G</span>
                              )}
                            </a>
                          )}
                          {(r.scraped_email || r.hunter_email || r.email) && (
                            <a
                              href={`mailto:${r.scraped_email || r.hunter_email || r.email}`}
                              className="inline-flex items-center gap-1 text-foreground hover:underline"
                            >
                              <Mail className="h-3 w-3" />
                              {r.scraped_email || r.hunter_email || r.email}
                              {r.scraped_email && (
                                <span className="text-[10px] text-blue-600 ml-1">site</span>
                              )}
                              {!r.scraped_email && r.hunter_email && (
                                <span className="text-[10px] text-amber-600 ml-1">H</span>
                              )}
                            </a>
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
                          {r.google_rating != null && (
                            <span className="text-amber-600">
                              ★ {r.google_rating.toFixed(1)}
                            </span>
                          )}
                          {r.enriching && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" /> Enrichissement…
                            </span>
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
