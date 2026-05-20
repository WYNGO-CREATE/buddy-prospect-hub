import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Mail,
  Linkedin,
  Phone,
  MessageCircle,
  StickyNote,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Plus,
  Inbox as InboxIcon,
  Archive,
  ArchiveRestore,
  Circle,
  CircleDot,
  ExternalLink,
  Send,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
  head: () => ({
    meta: [{ title: "Inbox — Wyngo Workspace" }],
  }),
});

type Channel = "email" | "linkedin" | "call" | "whatsapp" | "note";
type Direction = "inbound" | "outbound";

type Message = {
  id: string;
  prospect_id: string;
  owner_id: string;
  channel: Channel;
  direction: Direction;
  subject: string | null;
  content: string;
  is_read: boolean;
  is_archived: boolean;
  occurred_at: string;
  created_at: string;
};

type Prospect = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
};

type EnrichedMessage = Message & { prospect: Prospect | null };

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Mail; tone: string }> = {
  email: { label: "Email", icon: Mail, tone: "text-sky-600 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-400" },
  linkedin: { label: "LinkedIn", icon: Linkedin, tone: "text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400" },
  call: { label: "Appel", tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", icon: Phone },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, tone: "text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-400" },
  note: { label: "Note", icon: StickyNote, tone: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400" },
};

function InboxPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "archived">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Compte Gmail connecté ?
  const { data: gmailAccount } = useQuery({
    queryKey: ["my-gmail-account"],
    queryFn: async () => {
      const { data } = await supabase.from("gmail_accounts").select("*").maybeSingle();
      return data;
    },
  });

  // ─── Récupération des messages + prospects ───
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["inbox-messages", user?.id, statusFilter],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase.from("messages").select("*").order("occurred_at", { ascending: false });
      if (statusFilter === "unread") q = q.eq("is_read", false).eq("is_archived", false);
      else if (statusFilter === "archived") q = q.eq("is_archived", true);
      else q = q.eq("is_archived", false);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data || []) as Message[];
    },
  });

  // Tous les prospects référencés dans les messages
  const prospectIds = useMemo(
    () => Array.from(new Set(messages.map((m) => m.prospect_id))),
    [messages],
  );

  const { data: prospects = [] } = useQuery({
    queryKey: ["inbox-prospects", prospectIds.join(",")],
    enabled: prospectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email")
        .in("id", prospectIds);
      if (error) throw error;
      return (data || []) as Prospect[];
    },
  });

  const prospectMap = useMemo(
    () => new Map(prospects.map((p) => [p.id, p])),
    [prospects],
  );

  const enriched = useMemo<EnrichedMessage[]>(
    () => messages.map((m) => ({ ...m, prospect: prospectMap.get(m.prospect_id) || null })),
    [messages, prospectMap],
  );

  // ─── Filtres locaux ───
  const filtered = useMemo(() => {
    return enriched.filter((m) => {
      if (channelFilter !== "all" && m.channel !== channelFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [
          m.subject || "",
          m.content,
          m.prospect ? `${m.prospect.first_name} ${m.prospect.last_name}` : "",
          m.prospect?.company || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, channelFilter, search]);

  const selected = filtered.find((m) => m.id === selectedId) || null;

  // ─── Mutations ───
  const toggleRead = useMutation({
    mutationFn: async ({ id, is_read }: { id: string; is_read: boolean }) => {
      const { error } = await supabase.from("messages").update({ is_read }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-messages"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
    },
  });

  const toggleArchive = useMutation({
    mutationFn: async ({ id, is_archived }: { id: string; is_archived: boolean }) => {
      const { error } = await supabase.from("messages").update({ is_archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox-messages"] });
      qc.invalidateQueries({ queryKey: ["inbox-unread"] });
      toast.success("Message archivé");
      setSelectedId(null);
    },
  });

  const stats = useMemo(() => {
    const total = enriched.length;
    const unread = enriched.filter((m) => !m.is_read && !m.is_archived).length;
    const byChannel: Record<Channel, number> = {
      email: 0, linkedin: 0, call: 0, whatsapp: 0, note: 0,
    };
    enriched.forEach((m) => { byChannel[m.channel]++; });
    return { total, unread, byChannel };
  }, [enriched]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <InboxIcon className="h-6 w-6 text-primary" />
            Inbox
            {stats.unread > 0 && (
              <span className="text-sm font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                {stats.unread} non lu{stats.unread > 1 ? "s" : ""}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Toutes vos interactions, tous canaux confondus.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {gmailAccount && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setSyncing(true);
                const { error } = await supabase.functions.invoke("gmail-sync");
                setSyncing(false);
                if (error) toast.error("Sync échouée");
                else toast.success("Synchronisé");
                qc.invalidateQueries({ queryKey: ["inbox-messages"] });
                qc.invalidateQueries({ queryKey: ["inbox-unread"] });
                qc.invalidateQueries({ queryKey: ["my-gmail-account"] });
              }}
              disabled={syncing}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sync…" : "Synchroniser Gmail"}
            </Button>
          )}
          <ComposeDialog
            open={composeOpen}
            onOpenChange={setComposeOpen}
            ownerId={user?.id}
            gmailConnected={!!gmailAccount}
            onCreated={() => {
              qc.invalidateQueries({ queryKey: ["inbox-messages"] });
              qc.invalidateQueries({ queryKey: ["inbox-unread"] });
            }}
          />
        </div>
      </div>

      {/* Bandeau Gmail status */}
      {gmailAccount && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs">
          <Mail className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-900 dark:text-emerald-200 font-medium">{gmailAccount.email}</span>
          {gmailAccount.last_sync_at && (
            <span className="text-emerald-700 dark:text-emerald-300">
              · synchronisé {formatDistanceToNow(new Date(gmailAccount.last_sync_at), { addSuffix: true, locale: fr })}
            </span>
          )}
          {gmailAccount.sync_error && (
            <span className="text-amber-700 dark:text-amber-300 ml-auto">⚠ {gmailAccount.sync_error.slice(0, 80)}</span>
          )}
        </div>
      )}
      {!gmailAccount && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-muted/40 border text-xs">
          <span className="text-muted-foreground">Connectez Gmail pour synchroniser automatiquement vos échanges.</span>
          <Link to="/profil" className="text-primary font-medium hover:underline">
            Connecter Gmail →
          </Link>
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher dans l'inbox…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={channelFilter} onValueChange={(v) => setChannelFilter(v as Channel | "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tous les canaux" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les canaux</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="call">Appel</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="note">Note</SelectItem>
          </SelectContent>
        </Select>

        <div className="inline-flex rounded-md border bg-card overflow-hidden">
          {(["all", "unread", "archived"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s === "all" ? "Tous" : s === "unread" ? "Non lus" : "Archivés"}
            </button>
          ))}
        </div>
      </div>

      {/* Layout 2 colonnes : liste + détail */}
      <div className="grid lg:grid-cols-[minmax(320px,420px)_1fr] gap-4 min-h-[60vh]">
        {/* Liste */}
        <Card className="overflow-hidden">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between bg-muted/30">
            <span>{filtered.length} message{filtered.length > 1 ? "s" : ""}</span>
            {stats.unread > 0 && statusFilter !== "archived" && (
              <span className="text-primary font-semibold">{stats.unread} non lu{stats.unread > 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                onCompose={() => setComposeOpen(true)}
                isFiltered={!!search || channelFilter !== "all" || statusFilter !== "all"}
              />
            ) : (
              filtered.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  isSelected={selectedId === m.id}
                  onSelect={() => {
                    setSelectedId(m.id);
                    if (!m.is_read) toggleRead.mutate({ id: m.id, is_read: true });
                  }}
                />
              ))
            )}
          </div>
        </Card>

        {/* Détail */}
        <Card className="overflow-hidden">
          {selected ? (
            <MessageDetail
              message={selected}
              onToggleRead={() =>
                toggleRead.mutate({ id: selected.id, is_read: !selected.is_read })
              }
              onArchive={() =>
                toggleArchive.mutate({ id: selected.id, is_archived: !selected.is_archived })
              }
            />
          ) : (
            <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center px-8 py-16">
              <InboxIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">
                Sélectionnez un message pour le consulter.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function MessageRow({
  message,
  isSelected,
  onSelect,
}: {
  message: EnrichedMessage;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const meta = CHANNEL_META[message.channel];
  const Icon = meta.icon;
  const prospectName = message.prospect
    ? `${message.prospect.first_name} ${message.prospect.last_name}`
    : "Prospect inconnu";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-4 py-3 hover:bg-muted/50 transition relative",
        isSelected && "bg-muted",
        !message.is_read && "bg-primary/[0.03]",
      )}
    >
      {!message.is_read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-primary" />
      )}
      <div className="flex items-start gap-3 pl-2">
        <div className={cn("size-9 rounded-lg flex items-center justify-center flex-shrink-0", meta.tone)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              "text-sm truncate",
              !message.is_read ? "font-semibold text-foreground" : "font-medium text-foreground/90",
            )}>
              {prospectName}
            </span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0 flex items-center gap-1">
              {message.direction === "inbound" ? (
                <ArrowDownLeft className="h-3 w-3 text-emerald-500" />
              ) : (
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              )}
              {formatDistanceToNow(new Date(message.occurred_at), { addSuffix: true, locale: fr })}
            </span>
          </div>
          {message.prospect?.company && (
            <p className="text-[11px] text-muted-foreground truncate">{message.prospect.company}</p>
          )}
          {message.subject && (
            <p className="text-xs font-medium text-foreground/80 mt-1 truncate">{message.subject}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
            {message.content}
          </p>
        </div>
      </div>
    </button>
  );
}

function MessageDetail({
  message,
  onToggleRead,
  onArchive,
}: {
  message: EnrichedMessage;
  onToggleRead: () => void;
  onArchive: () => void;
}) {
  const meta = CHANNEL_META[message.channel];
  const Icon = meta.icon;
  const prospectName = message.prospect
    ? `${message.prospect.first_name} ${message.prospect.last_name}`
    : "Prospect inconnu";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("size-10 rounded-lg flex items-center justify-center flex-shrink-0", meta.tone)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground truncate">{prospectName}</h2>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{meta.label}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                {message.direction === "inbound" ? (
                  <><ArrowDownLeft className="h-3 w-3 text-emerald-500" /> Reçu</>
                ) : (
                  <><ArrowUpRight className="h-3 w-3" /> Envoyé</>
                )}
              </span>
              <span>·</span>
              <span>{new Date(message.occurred_at).toLocaleString("fr-FR")}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onToggleRead} title={message.is_read ? "Marquer non lu" : "Marquer lu"}>
            {message.is_read ? <Circle className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onArchive} title={message.is_archived ? "Désarchiver" : "Archiver"}>
            {message.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          {message.prospect && (
            <Link
              to="/prospects/$id"
              params={{ id: message.prospect.id }}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Fiche
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {message.subject && (
          <h3 className="text-lg font-semibold text-foreground">{message.subject}</h3>
        )}
        <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground/90 leading-relaxed">
          {message.content}
        </div>
        {message.prospect && (
          <div className="mt-8 pt-4 border-t text-xs text-muted-foreground">
            {message.prospect.company && <p>Société : {message.prospect.company}</p>}
            {message.prospect.email && <p>Email : {message.prospect.email}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCompose, isFiltered }: { onCompose: () => void; isFiltered: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <InboxIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">
        {isFiltered ? "Aucun message avec ces filtres" : "Votre inbox est vide"}
      </p>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        {isFiltered
          ? "Essayez de relâcher les filtres."
          : "Commencez par enregistrer un échange avec un prospect."}
      </p>
      {!isFiltered && (
        <Button size="sm" onClick={onCompose}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau message
        </Button>
      )}
    </div>
  );
}

function ComposeDialog({
  open,
  onOpenChange,
  ownerId,
  gmailConnected,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownerId: string | undefined;
  gmailConnected: boolean;
  onCreated: () => void;
}) {
  const [prospectId, setProspectId] = useState("");
  const [channel, setChannel] = useState<Channel>("note");
  const [direction, setDirection] = useState<Direction>("outbound");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendViaGmail, setSendViaGmail] = useState(false);

  const { data: prospects = [] } = useQuery({
    queryKey: ["all-prospects-compose"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email")
        .order("first_name");
      return (data || []) as Array<{ id: string; first_name: string; last_name: string; company: string | null; email: string | null }>;
    },
  });

  const selectedProspect = prospects.find((p) => p.id === prospectId);

  const reset = () => {
    setProspectId(""); setChannel("note"); setDirection("outbound");
    setSubject(""); setContent(""); setSendViaGmail(false);
  };

  // Si l'utilisateur passe en canal email avec Gmail connecté, propose l'envoi
  useEffect(() => {
    if (channel === "email" && gmailConnected && direction === "outbound") {
      setSendViaGmail(true);
    } else {
      setSendViaGmail(false);
    }
  }, [channel, gmailConnected, direction]);

  const submit = async () => {
    if (!ownerId) return;
    if (!prospectId) { toast.error("Sélectionnez un prospect"); return; }
    if (!content.trim()) { toast.error("Le contenu est vide"); return; }

    // Mode "Envoyer réellement via Gmail"
    if (sendViaGmail) {
      if (!selectedProspect?.email) {
        toast.error("Ce prospect n'a pas d'email enregistré"); return;
      }
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke("gmail-send", {
        body: {
          prospect_id: prospectId,
          to: selectedProspect.email,
          subject: subject.trim(),
          body: content.trim(),
        },
      });
      setSubmitting(false);
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Envoi échoué"); return;
      }
      toast.success(`Email envoyé à ${selectedProspect.email}`);
      reset();
      onCreated();
      onOpenChange(false);
      return;
    }

    // Mode log manuel (par défaut)
    setSubmitting(true);
    const { error } = await supabase.from("messages").insert({
      prospect_id: prospectId,
      owner_id: ownerId,
      channel,
      direction,
      subject: subject.trim() || null,
      content: content.trim(),
      is_read: true,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Message enregistré");
    reset();
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau message
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enregistrer un échange</DialogTitle>
          <DialogDescription>
            Logez manuellement un email, message LinkedIn, appel, WhatsApp ou note.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Prospect</Label>
            <Select value={prospectId} onValueChange={setProspectId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un prospect" />
              </SelectTrigger>
              <SelectContent>
                {prospects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                    {p.company ? ` · ${p.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">📧 Email</SelectItem>
                  <SelectItem value="linkedin">💼 LinkedIn</SelectItem>
                  <SelectItem value="call">📞 Appel</SelectItem>
                  <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                  <SelectItem value="note">📝 Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">↗ Envoyé / sortant</SelectItem>
                  <SelectItem value="inbound">↙ Reçu / entrant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {(channel === "email" || channel === "linkedin") && (
            <div className="space-y-2">
              <Label>Sujet {channel === "email" && sendViaGmail ? "*" : "(optionnel)"}</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex : Suivi proposition commerciale" />
            </div>
          )}

          <div className="space-y-2">
            <Label>Contenu</Label>
            <Textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={sendViaGmail ? "Tapez votre email…" : "Tapez le contenu du message ou un résumé de l'appel…"}
            />
          </div>

          {channel === "email" && gmailConnected && direction === "outbound" && (
            <label className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 cursor-pointer">
              <input
                type="checkbox"
                checked={sendViaGmail}
                onChange={(e) => setSendViaGmail(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5 text-primary" />
                  Envoyer réellement via Gmail
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedProspect?.email
                    ? `L'email sera envoyé à ${selectedProspect.email} depuis votre Gmail.`
                    : "⚠ Ce prospect n'a pas d'email enregistré."}
                </p>
              </div>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting
              ? (sendViaGmail ? "Envoi…" : "Enregistrement…")
              : sendViaGmail
                ? (<><Send className="h-4 w-4 mr-1.5" /> Envoyer</>)
                : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
