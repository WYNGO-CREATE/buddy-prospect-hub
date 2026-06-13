/**
 * ─── Wyngo Studio — Éditeur de site piloté par l'IA ───────────────────
 *
 * Édite le site d'un client. Aperçu en direct (iframe) + modifications en
 * langage naturel : tu décris la modif, l'IA modifie le vrai HTML.
 *   "change le titre en…"  ·  "mets les horaires à jour"
 *   "ajoute une section avis"  ·  "des couleurs plus chaudes"
 *
 * Bouton "Publier" → marque le site en ligne (déploiement réel : brique
 * suivante, quand le client aura son domaine).
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, Wand2, Loader2, Rocket, Monitor, Smartphone, Undo2, Maximize2, Image as ImageIcon } from "lucide-react";
import { SitePhotosPanel } from "@/components/site-photos-panel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const APP_URL = "https://wyngo.bold-unit-739e.workers.dev";

export const Route = createFileRoute("/_authenticated/studio/site/$id")({
  component: SiteEditor,
  head: () => ({ meta: [{ title: "Éditeur de site — Wyngo Studio" }] }),
});

type Site = { id: string; prospect_id: string; title: string | null; slug: string | null; status: string; html: string | null };

const SUGGESTIONS = [
  "Rends le ton plus chaleureux et accueillant",
  "Mets les horaires d'ouverture à jour",
  "Ajoute une section avis clients",
  "Change la couleur principale pour quelque chose de plus moderne",
  "Raccourcis le texte d'accroche, plus percutant",
];

function SiteEditor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [html, setHtml] = useState<string>("");
  const [prevHtml, setPrevHtml] = useState<string | null>(null); // undo 1 étape
  const [instruction, setInstruction] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [panel, setPanel] = useState<"ia" | "photos">("ia");
  const initedFor = useRef<string | null>(null); // init unique par site (évite l'écrasement)

  // Persiste un nouveau HTML (utilisé par l'édition de photos) + active l'undo.
  const persist = useCallback(async (newHtml: string) => {
    setPrevHtml(html);
    setHtml(newHtml);
    const { error } = await supabase.from("client_sites").update({ html: newHtml, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  }, [html, id]);

  const { data: site, isLoading } = useQuery({
    queryKey: ["studio-site", id],
    queryFn: async (): Promise<Site | null> => {
      const { data } = await supabase.from("client_sites").select("id, prospect_id, title, slug, status, html").eq("id", id).maybeSingle();
      return (data as Site) || null;
    },
  });

  // Charge le HTML initial UNE SEULE FOIS par site (travail existant, sinon
  // la maquette). On ne ré-initialise pas si la query se rafraîchit, sinon
  // une édition en cours serait écrasée.
  useEffect(() => {
    if (!site || initedFor.current === id) return;
    initedFor.current = id;
    if (site.html) { setHtml(site.html); return; }
    (async () => {
      const { data: prev } = await supabase.from("prospect_previews")
        .select("html_url, slug").eq("prospect_id", site.prospect_id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
      const url = prev?.html_url || (prev?.slug ? `${APP_URL}/p/${prev.slug}` : null);
      if (url) { try { const r = await fetch(url); if (r.ok) setHtml(await r.text()); } catch { /* */ } }
    })();
  }, [site, id]);

  // Undo : restaure la version précédente (local + DB)
  const undo = useMutation({
    mutationFn: async () => {
      if (prevHtml == null) return;
      await supabase.from("client_sites").update({ html: prevHtml, updated_at: new Date().toISOString() }).eq("id", id);
      return prevHtml;
    },
    onSuccess: (restored) => { if (restored != null) { setHtml(restored); setPrevHtml(null); toast.success("Modification annulée"); } },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = useMutation({
    mutationFn: async (instr: string) => {
      const { data, error } = await supabase.functions.invoke("site-edit", { body: { site_id: id, instruction: instr } });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Modification impossible");
      return data as { html: string; applied: number; skipped: number; summary: string };
    },
    onMutate: () => { setPrevHtml(html); }, // mémorise pour l'undo
    onSuccess: (d) => {
      setHtml(d.html);
      setInstruction("");
      if (d.applied > 0) toast.success(`Modifié : ${d.summary || "site mis à jour"}`);
      else { setPrevHtml(null); toast.warning(d.summary || "Aucune modification appliquée — reformule ta demande."); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_sites")
        .update({ status: "published", published_at: new Date().toISOString(), html }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["studio-site", id] }); qc.invalidateQueries({ queryKey: ["studio-sites"] }); toast.success("Site publié 🚀 (déploiement domaine : à venir)"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Chargement…</div>;
  if (!site) return <div className="p-6 text-muted-foreground">Site introuvable. <Link to="/studio" className="text-primary underline">Retour Studio</Link></div>;

  return (
    <div className="h-[calc(100vh-3rem)] -m-6 flex flex-col">
      {/* Barre du haut */}
      <div className="border-b px-4 py-2 flex items-center justify-between gap-3 bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild className="gap-1"><Link to="/studio"><ArrowLeft className="h-4 w-4" /> Studio</Link></Button>
          <div className="min-w-0">
            <p className="font-semibold truncate text-sm">{site.title || "Site client"}</p>
          </div>
          <Badge className={cn("border-0", site.status === "published" ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300")}>
            {site.status === "published" ? "En ligne" : "Brouillon"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {prevHtml != null && (
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => undo.mutate()} disabled={undo.isPending} title="Annuler la dernière modification">
              <Undo2 className="h-3.5 w-3.5" /> Annuler
            </Button>
          )}
          <div className="flex rounded-md border overflow-hidden mr-1">
            <button onClick={() => setDevice("desktop")} className={cn("px-2 py-1.5", device === "desktop" ? "bg-muted" : "hover:bg-muted/50")} title="Bureau"><Monitor className="h-3.5 w-3.5" /></button>
            <button onClick={() => setDevice("mobile")} className={cn("px-2 py-1.5", device === "mobile" ? "bg-muted" : "hover:bg-muted/50")} title="Mobile"><Smartphone className="h-3.5 w-3.5" /></button>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" disabled={!html} title="Voir le site en plein écran"
            onClick={() => { const b = new Blob([html], { type: "text/html" }); window.open(URL.createObjectURL(b), "_blank"); }}>
            <Maximize2 className="h-3.5 w-3.5" /> Plein écran
          </Button>
          <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending || !html} className="gap-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white">
            {publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />} Publier
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Panneau gauche : onglets IA / Photos */}
        <div className="w-80 border-r bg-card flex flex-col">
          <div className="grid grid-cols-2 gap-1 p-2 border-b">
            <button onClick={() => setPanel("ia")} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition", panel === "ia" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <Sparkles className="h-3.5 w-3.5" /> Modifier (IA)
            </button>
            <button onClick={() => setPanel("photos")} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition", panel === "photos" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <ImageIcon className="h-3.5 w-3.5" /> Photos & logo
            </button>
          </div>

          {panel === "photos" ? (
            <SitePhotosPanel html={html} siteId={id} onChange={persist} />
          ) : (
          <div className="p-4 space-y-3 overflow-y-auto">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Modifier avec l'IA</p>
              <p className="text-xs text-muted-foreground mt-0.5">Décris ce que tu veux changer, l'IA modifie le site.</p>
            </div>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="Ex : Change le titre en 'Boulangerie Martin, artisan depuis 1987' et mets les horaires : 7h-19h du mardi au dimanche."
              className="resize-none text-sm"
              disabled={edit.isPending}
            />
            <Button className="w-full gap-1.5" disabled={!instruction.trim() || edit.isPending} onClick={() => edit.mutate(instruction)}>
              {edit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {edit.isPending ? "Modification…" : "Appliquer"}
            </Button>

            <div className="pt-1">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Suggestions</p>
              <div className="space-y-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => setInstruction(s)} disabled={edit.isPending}
                    className="w-full text-left text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted/50 transition disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Aperçu live */}
        <div className="flex-1 bg-muted/30 overflow-auto flex items-start justify-center p-4">
          {html ? (
            <iframe
              title="Aperçu du site"
              srcDoc={html}
              className={cn("bg-white rounded-lg shadow-xl border transition-all", device === "mobile" ? "w-[390px] h-[844px] max-w-full" : "w-full h-full min-h-[80vh]")}
            />
          ) : (
            <div className="text-muted-foreground text-sm flex items-center gap-2 mt-20"><Loader2 className="h-4 w-4 animate-spin" /> Chargement de la maquette…</div>
          )}
        </div>
      </div>
    </div>
  );
}
