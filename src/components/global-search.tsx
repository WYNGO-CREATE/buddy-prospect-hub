import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";

type Result = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_prospects", { _q: q.trim(), _limit: 10 });
      setResults((data as Result[]) || []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  function go(id: string) {
    setOpen(false);
    setQ("");
    navigate({ to: "/prospects/$id", params: { id } });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition"
      >
        <Search className="h-3.5 w-3.5" />
        Rechercher…
        <kbd className="ml-2 text-[10px] bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput value={q} onValueChange={setQ} placeholder="Nom, société, email, téléphone, site…" />
        <CommandList>
          <CommandEmpty>{q.length < 2 ? "Tapez au moins 2 caractères…" : "Aucun résultat"}</CommandEmpty>
          {results.length > 0 && (
            <CommandGroup heading="Prospects">
              {results.map((r) => (
                <CommandItem key={r.id} value={r.id} onSelect={() => go(r.id)}>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {r.first_name} {r.last_name}
                      {r.company ? ` — ${r.company}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[r.email, r.phone, r.website].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
