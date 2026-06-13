/**
 * ─── SitePhotosPanel — Remplacer les photos & le logo du site ─────────
 *
 * Détecte toutes les images du site (<img>) et permet de les remplacer
 * par les vraies photos du commerce (upload) ou un logo. Le src est
 * échangé dans le HTML, puis sauvegardé.
 *
 * L'éditeur passe le HTML courant + onChange(newHtml) (qui persiste).
 */

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, ImageOff } from "lucide-react";
import { toast } from "sonner";

const STORAGE_BASE = "https://mwkkgubvdswmdaiswepl.supabase.co/storage/v1/object/public/site-assets";

function extractImages(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    const src = m[1];
    if (src && !src.startsWith("data:")) set.add(src);
  }
  return Array.from(set);
}

export function SitePhotosPanel({
  html, siteId, onChange,
}: {
  html: string;
  siteId: string;
  onChange: (newHtml: string) => Promise<void> | void;
}) {
  const images = useMemo(() => extractImages(html), [html]);
  const [busySrc, setBusySrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const targetSrc = useRef<string | null>(null);

  const pick = (src: string) => { targetSrc.current = src; fileRef.current?.click(); };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset pour pouvoir re-sélectionner le même fichier
    const oldSrc = targetSrc.current;
    if (!file || !oldSrc) return;
    if (!file.type.startsWith("image/")) { toast.error("Choisis un fichier image."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Image trop lourde (max 8 Mo)."); return; }

    setBusySrc(oldSrc);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${siteId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const newUrl = `${STORAGE_BASE}/${path}`;
      // Remplace TOUTES les occurrences de l'ancienne URL dans le HTML
      const newHtml = html.split(oldSrc).join(newUrl);
      await onChange(newHtml);
      toast.success("Image remplacée");
    } catch (err) {
      toast.error("Échec de l'upload : " + (err as Error).message);
    }
    setBusySrc(null);
  };

  return (
    <div className="p-4 space-y-3 overflow-y-auto">
      <div>
        <p className="text-sm font-semibold flex items-center gap-1.5">🖼️ Photos & logo</p>
        <p className="text-xs text-muted-foreground mt-0.5">Remplace chaque image par les vraies photos du commerce ou leur logo.</p>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {images.length === 0 ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2 py-6 justify-center border border-dashed rounded-lg">
          <ImageOff className="h-4 w-4" /> Aucune image détectée dans ce site.
        </div>
      ) : (
        <div className="space-y-2.5">
          {images.map((src, i) => (
            <div key={i} className="rounded-lg border overflow-hidden">
              <div className="aspect-video bg-muted/40 flex items-center justify-center overflow-hidden">
                <img src={src} alt={`Image ${i + 1}`} className="w-full h-full object-cover" loading="lazy"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }} />
              </div>
              <div className="p-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Image {i + 1}</span>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={busySrc === src} onClick={() => pick(src)}>
                  {busySrc === src ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  Remplacer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground pt-1">
        💡 Pour le logo : remplace l'image d'en-tête. Tu peux aussi demander à l'IA de "mettre le logo plus grand" après l'avoir posé.
      </p>
    </div>
  );
}
