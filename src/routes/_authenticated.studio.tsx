/**
 * ─── Wyngo Studio — Production des sites clients (CRM #2) ──────────────
 *
 * Backend PARTAGÉ avec Wyngo. Studio lit les prospects "convertis" (les
 * clients) et permet de transformer leur maquette approuvée (Aperçu
 * Instantané) en site à produire puis à mettre en ligne.
 *
 * V1 (sans domaine perso, géré plus tard) :
 *   - File "À produire" : clients convertis qui n'ont pas encore de site
 *   - Bouton "Créer le site" → crée la ligne client_sites depuis la maquette
 *   - "En production" : sites créés, avec lien vers la maquette + statut
 *
 * Le déploiement réel (domaine perso, SSL) viendra ensuite — le client
 * achètera son domaine et on branchera Cloudflare for SaaS à ce moment-là.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Wand2, ExternalLink, Globe, Hammer, CheckCircle2, Clock, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const APP_URL = "https://wyngo.bold-unit-739e.workers.dev";

export const Route = createFileRoute("/_authenticated/studio")({
  component: StudioPage,
  head: () => ({ meta: [{ title: "Wyngo Studio — Production des sites" }] }),
});

function slugify(s: string): string {
  return (s || "site")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "site";
}

type Client = { id: string; first_name: string; last_name: string; company: string | null; status: string };
type Preview = { prospect_id: string; slug: string; html_url: string | null; generated_at: string };
type Site = { id: string; prospect_id: string; title: string | null; slug: string | null; status: string; custom_domain: string | null; created_at: string };

function StudioPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Clients convertis (la source : Wyngo)
  const { data: clients } = useQuery({
    queryKey: ["studio-clients", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Client[]> => {
      const { data } = await supabase.from("prospects")
        .select("id, first_name, last_name, company, status")
        .eq("owner_id", user!.id).eq("status", "converti")
        .order("updated_at", { ascending: false });
      return (data as Client[]) || [];
    },
  });

  // Maquettes existantes (prospect_id → la plus récente)
  const { data: previews } = useQuery({
    queryKey: ["studio-previews", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Map<string, Preview>> => {
      const { data } = await supabase.from("prospect_previews")
        .select("prospect_id, slug, html_url, generated_at")
        .order("generated_at", { ascending: false });
      const m = new Map<string, Preview>();
      for (const p of (data as Preview[]) || []) if (!m.has(p.prospect_id)) m.set(p.prospect_id, p);
      return m;
    },
  });

  // Sites déjà créés dans Studio
  const { data: sites } = useQuery({
    queryKey: ["studio-sites", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Site[]> => {
      const { data } = await supabase.from("client_sites")
        .select("id, prospect_id, title, slug, status, custom_domain, created_at")
        .order("created_at", { ascending: false });
      return (data as Site[]) || [];
    },
  });

  const siteByProspect = useMemo(() => {
    const m = new Map<string, Site>();
    for (const s of sites || []) if (!m.has(s.prospect_id)) m.set(s.prospect_id, s);
    return m;
  }, [sites]);

  const toProduce = (clients || []).filter((c) => !siteByProspect.has(c.id));

  const createSite = useMutation({
    mutationFn: async (client: Client) => {
      const preview = previews?.get(client.id);
      const company = client.company || `${client.first_name} ${client.last_name}`.trim();
      const slug = `${slugify(company)}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("client_sites").insert({
        prospect_id: client.id, owner_id: user!.id,
        preview_id: null, // on ne lie pas l'id ici (la maquette est retrouvée par prospect)
        title: company, slug, status: "draft",
        html_path: preview?.html_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-sites"] });
      toast.success("Site créé — prêt à être produit 🚀");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clientName = (id: string) => {
    const c = clients?.find((x) => x.id === id);
    return c ? (c.company || `${c.first_name} ${c.last_name}`.trim()) : "Client";
  };
  const previewUrl = (id: string) => {
    const p = previews?.get(id);
    return p?.html_url || (p?.slug ? `${APP_URL}/p/${p.slug}` : null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 md:p-6">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary/15 flex items-center justify-center">
            <Rocket className="size-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Wyngo Studio</h1>
            <p className="text-sm text-muted-foreground">Transforme tes clients signés en sites en ligne — de la maquette au déploiement.</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5">
          <Stat icon={Hammer} label="À produire" value={toProduce.length} tone="amber" />
          <Stat icon={Clock} label="En production" value={(sites || []).filter((s) => s.status === "draft").length} tone="sky" />
          <Stat icon={CheckCircle2} label="En ligne" value={(sites || []).filter((s) => s.status === "published").length} tone="emerald" />
        </div>
      </div>

      {/* À produire */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Hammer className="size-4" /> À produire ({toProduce.length})
        </h2>
        {toProduce.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aucun client en attente de production. Les prospects passés <b>Converti</b> dans Wyngo apparaissent ici automatiquement.
          </CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {toProduce.map((c) => {
              const hasPreview = !!previews?.get(c.id);
              return (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="font-semibold">{c.company || `${c.first_name} ${c.last_name}`}</p>
                      <p className="text-xs text-muted-foreground">{c.first_name} {c.last_name}</p>
                    </div>
                    {hasPreview ? (
                      <a href={previewUrl(c.id)!} target="_blank" rel="noreferrer"
                        className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                        <Wand2 className="size-3" /> Voir la maquette approuvée <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Pas encore de maquette — génère un Aperçu sur sa fiche d'abord.</p>
                    )}
                    <Button size="sm" className="w-full gap-1.5" disabled={createSite.isPending}
                      onClick={() => createSite.mutate(c)}>
                      <PlusCircle className="size-3.5" /> Créer le site
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* En production */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Globe className="size-4" /> Sites ({(sites || []).length})
        </h2>
        {(sites || []).length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aucun site créé pour l'instant.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(sites || []).map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{s.title || clientName(s.prospect_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.custom_domain ? s.custom_domain : `${s.slug}.wyngo.site`}
                      <span className="opacity-50"> · domaine perso à brancher plus tard</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("border-0",
                      s.status === "published" ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                      : "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300")}>
                      {s.status === "published" ? "En ligne" : "Brouillon"}
                    </Badge>
                    {previewUrl(s.prospect_id) && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs" asChild>
                        <a href={previewUrl(s.prospect_id)!} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-3" /> Maquette
                        </a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs" asChild>
                      <Link to="/prospects/$id" params={{ id: s.prospect_id }}>Fiche</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-center text-muted-foreground pt-2">
        🔜 Prochaine étape : éditer le site + le mettre en ligne sur le domaine du client.
      </p>
    </div>
  );
}

const TONE: Record<string, string> = {
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};
function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border bg-card/60 p-3 flex items-center gap-3">
      <div className={cn("size-9 rounded-lg flex items-center justify-center", TONE[tone])}><Icon className="size-4" /></div>
      <div>
        <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}
