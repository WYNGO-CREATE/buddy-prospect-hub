import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Search, User, Mail, Phone, Inbox as InboxIcon, MessageSquareWarning } from "lucide-react";

/**
 * Recherche globale — recherche transverse sur l'ensemble du CRM.
 *
 * Champs interrogés en parallèle :
 *   • Prospects     (RPC search_prospects)
 *   • Templates     (email_templates : name, subject, body)
 *   • Scripts       (call_scripts : title, content)
 *   • Objections    (call_scripts kind=objection : title, content)
 *   • Messages      (messages : subject, content)
 *
 * Chaque résultat est cliquable et redirige vers la bonne section.
 */

type ProspectResult = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
};

type TemplateResult = { id: string; name: string; subject: string; category: string | null };
type ScriptResult = { id: string; kind: "script" | "objection"; title: string; content: string; category: string | null };
type MessageResult = {
  id: string;
  prospect_id: string;
  subject: string | null;
  content: string;
  channel: string;
  occurred_at: string;
  prospect_name?: string;
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [prospects, setProspects] = useState<ProspectResult[]>([]);
  const [templates, setTemplates] = useState<TemplateResult[]>([]);
  const [scripts, setScripts] = useState<ScriptResult[]>([]);
  const [objections, setObjections] = useState<ScriptResult[]>([]);
  const [messages, setMessages] = useState<MessageResult[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  // Cmd/Ctrl+K
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

  // Recherche fan-out
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setProspects([]);
      setTemplates([]);
      setScripts([]);
      setObjections([]);
      setMessages([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const term = q.trim();
      const like = `%${term}%`;
      try {
        const [prosRes, tplRes, scriptRes, msgRes] = await Promise.all([
          // Prospects via RPC (utilise un index fts si dispo)
          supabase.rpc("search_prospects", { _q: term, _limit: 6 }),
          // Templates : recherche dans name, subject, body
          supabase
            .from("email_templates")
            .select("id, name, subject, body, category")
            .or(`name.ilike.${like},subject.ilike.${like},body.ilike.${like}`)
            .limit(6),
          // Scripts + objections : recherche dans title, content
          supabase
            .from("call_scripts")
            .select("id, kind, title, content, category")
            .or(`title.ilike.${like},content.ilike.${like}`)
            .limit(12),
          // Messages : recherche dans subject + content (limité aux 6 plus récents qui matchent)
          supabase
            .from("messages")
            .select("id, prospect_id, subject, content, channel, occurred_at, prospects(first_name, last_name)")
            .or(`subject.ilike.${like},content.ilike.${like}`)
            .order("occurred_at", { ascending: false })
            .limit(6),
        ]);

        setProspects(((prosRes.data as ProspectResult[]) || []));
        setTemplates(((tplRes.data as TemplateResult[]) || []));

        const allScripts = ((scriptRes.data as ScriptResult[]) || []);
        setScripts(allScripts.filter((s) => s.kind === "script"));
        setObjections(allScripts.filter((s) => s.kind === "objection"));

        const msgs = ((msgRes.data || []) as any[]).map((m: any) => ({
          id: m.id,
          prospect_id: m.prospect_id,
          subject: m.subject,
          content: m.content,
          channel: m.channel,
          occurred_at: m.occurred_at,
          prospect_name: m.prospects ? `${m.prospects.first_name} ${m.prospects.last_name}` : undefined,
        })) as MessageResult[];
        setMessages(msgs);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  function closeAndNav(fn: () => void) {
    setOpen(false);
    setQ("");
    fn();
  }

  const totalResults = prospects.length + templates.length + scripts.length + objections.length + messages.length;

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
        <CommandInput
          value={q}
          onValueChange={setQ}
          placeholder="Prospect, email, script, objection, message…"
        />
        <CommandList>
          <CommandEmpty>
            {q.length < 2
              ? "Tapez au moins 2 caractères…"
              : searching
                ? "Recherche en cours…"
                : "Aucun résultat dans tout le CRM"}
          </CommandEmpty>

          {/* Prospects */}
          {prospects.length > 0 && (
            <CommandGroup heading={`Prospects (${prospects.length})`}>
              {prospects.map((r) => (
                <CommandItem
                  key={"p-" + r.id}
                  value={"p-" + r.id}
                  onSelect={() => closeAndNav(() => navigate({ to: "/prospects/$id", params: { id: r.id } }))}
                >
                  <User className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">
                      {r.first_name} {r.last_name}
                      {r.company ? ` — ${r.company}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {[r.email, r.phone, r.website].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Templates */}
          {templates.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Templates d'emails (${templates.length})`}>
                {templates.map((t) => (
                  <CommandItem
                    key={"t-" + t.id}
                    value={"t-" + t.id}
                    onSelect={() => closeAndNav(() => navigate({ to: "/templates" }))}
                  >
                    <Mail className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">{t.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {t.subject}
                        {t.category && <span className="ml-2 text-[10px] uppercase tracking-wide">· {t.category}</span>}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Scripts */}
          {scripts.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Scripts d'appel (${scripts.length})`}>
                {scripts.map((s) => (
                  <CommandItem
                    key={"s-" + s.id}
                    value={"s-" + s.id}
                    onSelect={() => closeAndNav(() => navigate({ to: "/scripts" }))}
                  >
                    <Phone className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">{s.title}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {s.content.slice(0, 90)}…
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Objections */}
          {objections.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Banque d'objections (${objections.length})`}>
                {objections.map((o) => (
                  <CommandItem
                    key={"o-" + o.id}
                    value={"o-" + o.id}
                    onSelect={() => closeAndNav(() => navigate({ to: "/scripts" }))}
                  >
                    <MessageSquareWarning className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">{o.title}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {o.content.slice(0, 90)}…
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Messages inbox */}
          {messages.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={`Messages (${messages.length})`}>
                {messages.map((m) => (
                  <CommandItem
                    key={"m-" + m.id}
                    value={"m-" + m.id}
                    onSelect={() => closeAndNav(() => {
                      if (m.prospect_id) navigate({ to: "/prospects/$id", params: { id: m.prospect_id } });
                      else navigate({ to: "/inbox" });
                    })}
                  >
                    <InboxIcon className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">
                        {m.subject || m.content.slice(0, 60)}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {m.prospect_name ? `${m.prospect_name} · ` : ""}{m.channel}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {/* Footer info */}
          {q.length >= 2 && !searching && totalResults > 0 && (
            <div className="px-3 py-2 text-[10px] text-muted-foreground border-t mt-1">
              {totalResults} résultat{totalResults > 1 ? "s" : ""} dans tout le CRM
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
