import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EVENT_LABELS, STATUS_LABELS } from "@/lib/crm";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Activity, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/logs")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const uid = data.session.user.id;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    if (!roles?.some((r) => r.role === "admin")) {
      throw redirect({ to: "/tableau" });
    }
  },
  component: LogsPage,
  head: () => ({ meta: [{ title: "Journal d'activité — Wyngo Workspace" }] }),
});

const EVENT_TYPES = ["all", "created", "status_changed", "call_logged", "follow_up_scheduled"];

function LogsPage() {
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const { data: profiles } = useQuery({
    queryKey: ["profiles-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
  });
  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    (profiles || []).forEach((p) => m.set(p.id, p.full_name || p.email || "—"));
    return m;
  }, [profiles]);

  const { data: events, isLoading } = useQuery({
    queryKey: ["events-log", eventType, ownerFilter],
    queryFn: async () => {
      let q = supabase
        .from("prospect_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (eventType !== "all") q = q.eq("event_type", eventType);
      if (ownerFilter !== "all") q = q.eq("owner_id", ownerFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: prospectMap } = useQuery({
    queryKey: ["prospect-map-for-logs", events?.length],
    enabled: !!events && events.length > 0,
    queryFn: async () => {
      const ids = Array.from(new Set(events!.map((e) => e.prospect_id)));
      const { data } = await supabase.from("prospects").select("id, first_name, last_name, company").in("id", ids);
      const m = new Map<string, { name: string; company: string | null }>();
      (data || []).forEach((p) =>
        m.set(p.id, { name: `${p.first_name} ${p.last_name}`, company: p.company }),
      );
      return m;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return events || [];
    const s = search.toLowerCase();
    return (events || []).filter((e) => {
      const p = prospectMap?.get(e.prospect_id);
      const author = profileMap.get(e.owner_id) || "";
      return (
        p?.name.toLowerCase().includes(s) ||
        p?.company?.toLowerCase().includes(s) ||
        author.toLowerCase().includes(s)
      );
    });
  }, [events, search, prospectMap, profileMap]);

  function describe(ev: any): string {
    if (ev.event_type === "status_changed") {
      const from = STATUS_LABELS[ev.payload?.from] || ev.payload?.from;
      const to = STATUS_LABELS[ev.payload?.to] || ev.payload?.to;
      return `${from} → ${to}`;
    }
    if (ev.event_type === "call_logged") {
      const outcome = ev.payload?.outcome ? ` · ${ev.payload.outcome}` : "";
      const dur = ev.payload?.duration ? ` · ${ev.payload.duration} min` : "";
      return `Appel${outcome}${dur}`;
    }
    if (ev.event_type === "follow_up_scheduled") {
      const at = ev.payload?.scheduled_at ? format(new Date(ev.payload.scheduled_at), "PP", { locale: fr }) : "";
      return `Relance prévue ${at}${ev.payload?.reason ? ` — ${ev.payload.reason}` : ""}`;
    }
    if (ev.event_type === "created") return "Nouveau prospect ajouté";
    return "";
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="h-7 w-7" /> Journal d'activité
        </h1>
        <p className="text-muted-foreground">Toutes les actions de l'équipe — réservé aux administrateurs</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher (prospect, commercial)…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t === "all" ? "Tous les événements" : EVENT_LABELS[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les commerciaux</SelectItem>
              {(profiles || []).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-muted-foreground">Chargement…</p>
          ) : filtered.length > 0 ? (
            <ul className="divide-y">
              {filtered.map((ev) => {
                const p = prospectMap?.get(ev.prospect_id);
                return (
                  <li key={ev.id} className="p-4 flex items-start gap-3 hover:bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {EVENT_LABELS[ev.event_type] || ev.event_type}
                        </span>
                        {p && (
                          <Link to="/prospects/$id" params={{ id: ev.prospect_id }} className="font-medium hover:underline">
                            {p.name}{p.company ? ` — ${p.company}` : ""}
                          </Link>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{describe(ev)}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      <div>{profileMap.get(ev.owner_id) || "—"}</div>
                      <div>{format(new Date(ev.created_at), "Pp", { locale: fr })}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-12 text-center text-muted-foreground">Aucun événement</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
