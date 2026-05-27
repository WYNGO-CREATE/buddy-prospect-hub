/**
 * ─── Page Apollo ───
 *
 * Recherche de prospects via l'API Apollo.io et ajout en 1 clic au CRM.
 *
 * Architecture :
 *   • UI = formulaire de recherche + grille de résultats
 *   • Aucun appel direct à Apollo : tout passe par l'edge function
 *     `apollo-proxy` qui détient la clé secrète côté serveur.
 *
 * Workflow :
 *   1. L'utilisateur saisit titres / société / domaine / localisation
 *   2. On envoie à apollo-proxy {action:"search_people", params:{...}}
 *   3. Affichage des résultats avec bouton "Ajouter au CRM"
 *   4. À l'ajout, on insère dans la table prospects avec apollo_id pour dédup
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Linkedin,
  Mail,
  Phone,
  Building2,
  MapPin,
  Target,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/apollo")({
  component: ApolloPage,
  head: () => ({ meta: [{ title: "Apollo — Wyngo Workspace" }] }),
});

type ApolloPerson = {
  apollo_id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string | null;
  email: string | null;
  email_status: string | null;
  phone: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  seniority: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization: {
    id: string | null;
    name: string | null;
    website: string | null;
    domain: string | null;
    industry: string | null;
    size: string | null;
    location: string | null;
  } | null;
};

type SearchResponse = {
  ok: boolean;
  people: ApolloPerson[];
  pagination: { page: number; per_page: number; total_entries: number; total_pages: number };
};

function ApolloPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Formulaire de recherche
  const [titles, setTitles] = useState("");
  const [location, setLocation] = useState("");
  const [domain, setDomain] = useState("");
  const [keywords, setKeywords] = useState("");
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<ApolloPerson[] | null>(null);
  const [pagination, setPagination] = useState<SearchResponse["pagination"] | null>(null);

  // Test de connexion Apollo (vérifie que la clé est bien configurée)
  const connectionTest = useQuery({
    queryKey: ["apollo-test"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("apollo-proxy", {
        body: { action: "test" },
      });
      if (error) {
        // Essaie d'extraire le détail si dispo
        let detail = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) detail = ctx.error;
        } catch { /* noop */ }
        throw new Error(detail);
      }
      return data;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Liste des apollo_id déjà importés (pour griser le bouton)
  const importedIds = useQuery({
    queryKey: ["apollo-imported", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("prospects")
        .select("apollo_id")
        .eq("owner_id", user!.id)
        .not("apollo_id", "is", null);
      return new Set(((data || []) as Array<{ apollo_id: string }>).map((r) => r.apollo_id));
    },
  });

  // Recherche
  const search = useMutation({
    mutationFn: async (vars: { page?: number }) => {
      const params: Record<string, unknown> = {
        page: vars.page ?? 1,
        per_page: 25,
      };
      if (titles.trim()) params.person_titles = titles.split(",").map((s) => s.trim()).filter(Boolean);
      if (location.trim()) params.organization_locations = location.split(",").map((s) => s.trim()).filter(Boolean);
      if (domain.trim()) params.q_organization_domains = domain.trim();
      if (keywords.trim()) params.q_keywords = keywords.trim();

      const { data, error } = await supabase.functions.invoke("apollo-proxy", {
        body: { action: "search_people", params },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) detail = ctx.error;
        } catch { /* noop */ }
        throw new Error(detail);
      }
      return data as SearchResponse;
    },
    onSuccess: (data, vars) => {
      setResults(data.people);
      setPagination(data.pagination);
      setPage(vars.page ?? 1);
      if (data.people.length === 0) {
        toast.info("Aucun résultat — essaie d'élargir tes critères");
      } else {
        toast.success(`${data.pagination.total_entries.toLocaleString("fr-FR")} résultat${data.pagination.total_entries > 1 ? "s" : ""} trouvé${data.pagination.total_entries > 1 ? "s" : ""}`);
      }
    },
    onError: (e: Error) => {
      toast.error("Recherche Apollo échouée", { description: e.message });
    },
  });

  // Ajout au CRM
  const addToCrm = useMutation({
    mutationFn: async (p: ApolloPerson) => {
      if (!user) throw new Error("Non connecté");
      const insert = {
        owner_id: user.id,
        first_name: p.first_name || p.name.split(" ")[0] || "",
        last_name: p.last_name || p.name.split(" ").slice(1).join(" ") || "",
        company: p.organization?.name ?? null,
        email: p.email,
        phone: p.phone,
        title: p.title,
        linkedin_url: p.linkedin_url,
        website: p.organization?.website ?? null,
        company_domain: p.organization?.domain ?? null,
        company_size: p.organization?.size ?? null,
        industry: p.organization?.industry ?? null,
        seniority: p.seniority,
        location: [p.city, p.state, p.country].filter(Boolean).join(", ") || p.organization?.location || null,
        photo_url: p.photo_url,
        apollo_id: p.apollo_id,
        apollo_synced_at: new Date().toISOString(),
        source: "apollo",
        status: "nouveau" as const,
      };
      const { error } = await (supabase as any).from("prospects").insert(insert);
      if (error) {
        if (error.code === "23505") {
          throw new Error("Ce contact est déjà dans ton CRM");
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Prospect ajouté au CRM");
      queryClient.invalidateQueries({ queryKey: ["apollo-imported"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
    },
    onError: (e: Error) => {
      toast.error("Impossible d'ajouter", { description: e.message });
    },
  });

  const isConnected = connectionTest.data && !connectionTest.isError;
  const importedSet = importedIds.data ?? new Set<string>();

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Apollo.io
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recherche de prospects depuis la base Apollo et ajout en 1 clic à ton CRM.
          </p>
        </div>
        <div>
          {connectionTest.isPending ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Test de connexion…
            </Badge>
          ) : isConnected ? (
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Connecté à Apollo
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Non connecté
            </Badge>
          )}
        </div>
      </div>

      {/* Erreur de connexion */}
      {connectionTest.isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm space-y-2">
            <div className="font-medium text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Apollo n'est pas connecté
            </div>
            <p className="text-muted-foreground">
              {(connectionTest.error as Error)?.message}
            </p>
            <p className="text-muted-foreground">
              Pour activer Apollo, ajoute le secret <code className="px-1 py-0.5 rounded bg-muted">APOLLO_API_KEY</code>{" "}
              dans <strong>Supabase Dashboard → Edge Functions → Secrets</strong>. Ta clé se trouve dans{" "}
              <em>Apollo → Settings → Integrations → API</em>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Formulaire de recherche */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Rechercher des prospects
          </CardTitle>
          <CardDescription>
            Sépare plusieurs valeurs par une virgule. Tous les champs sont optionnels — laisse vide pour élargir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="titles">Postes recherchés</Label>
              <Input
                id="titles"
                value={titles}
                onChange={(e) => setTitles(e.target.value)}
                placeholder="ex: CEO, Founder, Directeur commercial"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Localisation</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ex: France, Paris, Lyon"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domaine d'entreprise</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ex: acme.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keywords">Mots-clés libres</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="ex: SaaS, e-commerce, expertise comptable"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => search.mutate({ page: 1 })}
              disabled={!isConnected || search.isPending}
              className="gap-2"
            >
              {search.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Lancer la recherche
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Résultats */}
      {results !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Résultats ({pagination?.total_entries.toLocaleString("fr-FR") ?? 0})
              </span>
              {pagination && pagination.total_pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || search.isPending}
                    onClick={() => search.mutate({ page: page - 1 })}
                  >
                    ← Précédent
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} / {pagination.total_pages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pagination.total_pages || search.isPending}
                    onClick={() => search.mutate({ page: page + 1 })}
                  >
                    Suivant →
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Aucun résultat. Essaie d'élargir tes critères.
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((p) => {
                  const already = importedSet.has(p.apollo_id);
                  return (
                    <div
                      key={p.apollo_id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition"
                    >
                      {p.photo_url ? (
                        <img
                          src={p.photo_url}
                          alt={p.name}
                          className="h-10 w-10 rounded-full object-cover ring-1 ring-border flex-shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {p.first_name?.[0]}
                          {p.last_name?.[0]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-medium truncate">{p.name}</span>
                          {p.title && <span className="text-xs text-muted-foreground">— {p.title}</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                          {p.organization?.name && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {p.organization.name}
                              {p.organization.size && ` · ${p.organization.size} pers.`}
                            </span>
                          )}
                          {p.organization?.industry && (
                            <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">
                              {p.organization.industry}
                            </span>
                          )}
                          {(p.city || p.country) && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {[p.city, p.country].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                          {p.email ? (
                            <span className="inline-flex items-center gap-1 text-foreground/80">
                              <Mail className="h-3 w-3" />
                              {p.email}
                              {p.email_status === "verified" && (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Email non révélé</span>
                          )}
                          {p.phone && (
                            <span className="inline-flex items-center gap-1 text-foreground/80">
                              <Phone className="h-3 w-3" />
                              {p.phone}
                            </span>
                          )}
                          {p.linkedin_url && (
                            <a
                              href={p.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              <Linkedin className="h-3 w-3" />
                              LinkedIn
                            </a>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={already ? "outline" : "default"}
                        disabled={already || addToCrm.isPending}
                        onClick={() => addToCrm.mutate(p)}
                        className="gap-1.5 flex-shrink-0"
                      >
                        {already ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Dans le CRM
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" />
                            Ajouter
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
