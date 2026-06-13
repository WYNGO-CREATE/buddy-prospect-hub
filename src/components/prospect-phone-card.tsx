/**
 * ─── ProspectPhoneCard — Carte Téléphone éditable ────────────────────
 *
 * Affiche le téléphone (cliquable tel:) avec un petit crayon pour le
 * corriger sur place (ex: un 0 manquant). Sauvegarde directe.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Phone, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ProspectPhoneCard({ prospectId, phone }: { prospectId: string; phone: string | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone || "");

  const save = useMutation({
    mutationFn: async (v: string) => {
      const clean = v.trim() || null;
      const { error } = await supabase.from("prospects").update({ phone: clean, updated_at: new Date().toISOString() }).eq("id", prospectId);
      if (error) throw error;
      return clean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect", prospectId] });
      setEditing(false);
      toast.success("Téléphone mis à jour");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const base = "flex items-center gap-3 p-3 rounded-lg border transition";

  if (editing) {
    return (
      <div className={cn(base, "bg-accent/30")}>
        <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
          <Phone className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Téléphone</p>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save.mutate(value); if (e.key === "Escape") { setEditing(false); setValue(phone || ""); } }}
            placeholder="06 12 34 56 78"
            className="h-7 mt-0.5 text-sm"
          />
        </div>
        <button onClick={() => save.mutate(value)} disabled={save.isPending} className="size-7 rounded-md bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 flex-shrink-0" title="Enregistrer">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={() => { setEditing(false); setValue(phone || ""); }} className="size-7 rounded-md bg-muted flex items-center justify-center hover:bg-muted-foreground/20 flex-shrink-0" title="Annuler">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn(base, phone ? "hover:bg-accent/50" : "opacity-70")}>
      <a href={phone ? `tel:${phone}` : undefined} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
          <Phone className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Téléphone</p>
          <p className="font-semibold truncate">{phone || "Non renseigné"}</p>
        </div>
      </a>
      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => { setValue(phone || ""); setEditing(true); }} title="Modifier le téléphone">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
