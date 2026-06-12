/**
 * ─── À faire aujourd'hui — Cockpit du commercial ────────────────────────
 *
 * Anciennement "Relances" (page vide). Devenu le tableau de bord prioritaire
 * du matin : 7 sections classées par chaleur, avec quick-actions inline.
 *
 * Sections (priorité décroissante) :
 *  1. 🔥 Aperçu ouvert < 24h        → appeler MAINTENANT
 *  2. 💬 Réponses reçues à traiter   → lire + classer (positif/négatif/froid)
 *  3. 📞 Relances planifiées du jour → terminer ou repousser
 *  4. ⚠️  Prospects en retard         → jamais appelés ou silence > 14j
 *  5. 💼 Intéressés sans suite > 5j  → relance urgente avant qu'ils refroidissent
 *  6. 📭 Aperçus envoyés non ouverts → le prospect a ignoré, à requalifier
 *
 * Toutes les queries tournent en parallèle (Promise.all) pour rapidité.
 * Auto-refresh toutes les 60s pour capter les nouvelles ouvertures live.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CockpitDailyHeader } from "@/components/cockpit-daily-header";
import { CockpitSessionMode, type SessionItem } from "@/components/cockpit-session-mode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Flame, MessageCircle, CalendarClock, AlertTriangle, Briefcase, EyeOff, Snowflake,
  Check, ArrowRight, Phone, Mail, ChevronRight, ExternalLink,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relances")({
  component: CockpitPage,
  head: () => ({ meta: [{ title: "À faire aujourd'hui — Wyngo Workspace" }] }),
});

// ─── HELPERS ──────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const now = () => new Date();
const isoMinusDays = (d: number) => new Date(Date.now() - d * DAY_MS).toISOString();

/** Classification keyword des échanges entrants — emails, SMS, notes d'appel.
 *  Détecte les signaux d'achat (positive) ou de refus (negative) en français
 *  courant, y compris dans le langage parlé typique des notes d'appels. */
function classifyReply(text: string): "positive" | "negative" | "neutral" {
  const t = text.toLowerCase();
  // ── Négatif (refus net, même dans notes d'appel "il a dit que...")
  if (
    /\b(pas intéress|pas pour moi|non merci|non,?\s*pas|trop cher|trop ch[èe]re|hors budget|pas le budget|plus tard|déjà un site|déjà servi|déjà fait|déjà équipé|ne souhaite|ne veux pas|refus|décliné|décline|désinscri|stop)\b/i.test(t)
  ) {
    return "negative";
  }
  // ── Positif (signal d'achat clair)
  if (
    /\b(intéress|partant|d'accord|ok pour|rappele|rappel.{0,20}(demain|lundi|mardi|mercredi|jeudi|vendredi|semaine)|rdv|rendez-vous|disponib|envoyez|envoyer.{0,20}devis|devis|tarif|combien|quel.{0,5}prix|prix|quand peut|quand est-ce que|on signe|c'est bon|allez-y|go|valid[ée])\b/i.test(t)
  ) {
    return "positive";
  }
  return "neutral";
}

const CHANNEL_LABEL: Record<string, { label: string; icon: string }> = {
  email: { label: "Email", icon: "📧" },
  linkedin: { label: "LinkedIn", icon: "💼" },
  whatsapp: { label: "WhatsApp", icon: "💬" },
  sms: { label: "SMS", icon: "📱" },
  call: { label: "Appel", icon: "📞" },
  note: { label: "Note", icon: "📝" },
};

type Prospect = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  updated_at: string;
};

type ItemBase = {
  id?: string;
  prospect: Prospect;
  meta?: React.ReactNode;
};

// ════════════════════════════════════════════════════════════════════
function CockpitPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ─── Q1 : Aperçus ouverts < 24h (PROSPECTS CHAUDS 🔥) ───────────────
  const { data: hotPreviews } = useQuery({
    queryKey: ["cockpit-hot-previews", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_previews")
        .select("id, prospect_id, opened_at, view_count, slug, prospects(id, first_name, last_name, company, email, phone, status, updated_at)")
        .gt("opened_at", isoMinusDays(1))
        .order("view_count", { ascending: false });
      return (data || []) as Array<{
        id: string; prospect_id: string; opened_at: string; view_count: number; slug: string;
        prospects: Prospect;
      }>;
    },
  });

  // ─── Q2 : Échanges entrants récents (TOUS CANAUX) < 7j ─────────────
  //   Inclut : emails reçus, LinkedIn DM, WhatsApp, SMS, notes d'appels
  //   manuelles. Source unifiée = messages (inbound) + call_logs.notes
  const { data: incomingReplies } = useQuery({
    queryKey: ["cockpit-replies", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      // a) Messages entrants tous canaux (email, linkedin, whatsapp, sms…)
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, content, occurred_at, is_read, channel, prospect_id, prospects(id, first_name, last_name, company, email, phone, status, updated_at)")
        .eq("direction", "inbound")
        .gt("occurred_at", isoMinusDays(7))
        .not("prospect_id", "is", null)
        .order("occurred_at", { ascending: false })
        .limit(40);

      // b) Notes d'appels récentes (ce que le prospect a dit pendant l'appel)
      //    On les considère comme un "échange" du prospect à classifier.
      const { data: calls } = await supabase
        .from("call_logs")
        .select("id, summary, called_at, prospect_id, prospects(id, first_name, last_name, company, email, phone, status, updated_at)")
        .gt("called_at", isoMinusDays(7))
        .not("summary", "is", null)
        .order("called_at", { ascending: false })
        .limit(40);

      type UnifiedReply = {
        id: string;
        content: string;
        occurred_at: string;
        is_read: boolean;
        channel: string;
        prospect_id: string;
        prospects: Prospect;
        source: "message" | "call";
      };

      const fromMessages: UnifiedReply[] = (msgs || []).map((m) => ({
        id: m.id,
        content: m.content,
        occurred_at: m.occurred_at,
        is_read: m.is_read,
        channel: (m.channel as string) || "email",
        prospect_id: m.prospect_id,
        prospects: m.prospects as Prospect,
        source: "message",
      }));

      const fromCalls: UnifiedReply[] = (calls || [])
        .filter((c) => c.summary && c.summary.trim().length > 5)
        .map((c) => ({
          id: `call-${c.id}`,
          content: c.summary!,
          occurred_at: c.called_at,
          is_read: true, // les notes d'appel sont par définition "lues" par l'auteur
          channel: "call",
          prospect_id: c.prospect_id,
          prospects: c.prospects as Prospect,
          source: "call",
        }));

      // Combine + trie par date desc + dédup par prospect (garde le + récent)
      const combined = [...fromMessages, ...fromCalls]
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

      return combined;
    },
  });

  // ─── Q3 : Relances planifiées dans les 24h ─────────────────────────
  const { data: dueFollowUps } = useQuery({
    queryKey: ["cockpit-followups", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("follow_ups")
        .select("id, scheduled_at, reason, completed, prospect_id, prospects(id, first_name, last_name, company, email, phone, status, updated_at)")
        .eq("completed", false)
        .lte("scheduled_at", new Date(Date.now() + DAY_MS).toISOString())
        .order("scheduled_at", { ascending: true });
      return (data || []) as Array<{
        id: string; scheduled_at: string; reason: string | null; completed: boolean; prospect_id: string;
        prospects: Prospect;
      }>;
    },
  });

  // ─── Q4 : Prospects en retard (jamais appelés ou pas depuis 14j) ───
  //         Exclut convertis et perdus (pas pertinent)
  const { data: lateProspects } = useQuery({
    queryKey: ["cockpit-late", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      // On récupère les prospects + leur dernier call_log
      const { data: prospects } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email, phone, status, updated_at, created_at")
        .not("status", "in", "(converti,perdu)")
        .order("created_at", { ascending: true })
        .limit(200);
      if (!prospects || prospects.length === 0) return [];

      // Récupère le dernier appel pour chacun
      const { data: lastCalls } = await supabase
        .from("call_logs")
        .select("prospect_id, called_at")
        .in("prospect_id", prospects.map((p) => p.id))
        .order("called_at", { ascending: false });
      const lastCallMap = new Map<string, string>();
      for (const c of (lastCalls || [])) {
        if (!lastCallMap.has(c.prospect_id)) lastCallMap.set(c.prospect_id, c.called_at);
      }

      const cutoff14 = isoMinusDays(14);
      const cutoff5 = isoMinusDays(5); // pour ne pas alerter sur les tout récents

      return prospects.filter((p) => {
        const lastCall = lastCallMap.get(p.id);
        if (lastCall && lastCall > cutoff14) return false; // appelé récemment
        // Si jamais appelé : exclus si créé < 5j (laisse du temps)
        if (!lastCall && p.created_at > cutoff5) return false;
        return true;
      }).map((p) => ({
        ...p,
        last_called_at: lastCallMap.get(p.id) || null,
      })) as Array<Prospect & { created_at: string; last_called_at: string | null }>;
    },
  });

  // ─── Q5 : Intéressés sans suite > 5j ───────────────────────────────
  const { data: stuckInterested } = useQuery({
    queryKey: ["cockpit-stuck", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email, phone, status, updated_at")
        .eq("status", "interesse")
        .lt("updated_at", isoMinusDays(5));
      return (data || []) as Prospect[];
    },
  });

  // ─── Q6 : Aperçus envoyés mais non ouverts > 3 jours ───────────────
  const { data: ignoredPreviews } = useQuery({
    queryKey: ["cockpit-ignored", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_previews")
        .select("id, prospect_id, generated_at, view_count, prospects(id, first_name, last_name, company, email, phone, status, updated_at)")
        .eq("view_count", 0)
        .lt("generated_at", isoMinusDays(3))
        .order("generated_at", { ascending: false })
        .limit(30);
      return (data || []) as Array<{
        id: string; prospect_id: string; generated_at: string; view_count: number;
        prospects: Prospect;
      }>;
    },
  });

  // ─── Q7 : Prospects froids à réveiller (>30j sans aucune interaction) ──
  //         Combine messages, call_logs et previews via la RPC
  //         `prospects_last_contact`. Exclut convertis & perdus.
  const { data: coldProspects } = useQuery({
    queryKey: ["cockpit-cold", user?.id],
    enabled: !!user,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data: lc } = await supabase.rpc("prospects_last_contact");
      const cutoff = Date.now() - 30 * DAY_MS;
      const coldMap = new Map<string, string>();
      ((lc || []) as Array<{ prospect_id: string; last_contact_at: string }>).forEach((r) => {
        if (new Date(r.last_contact_at).getTime() < cutoff) {
          coldMap.set(r.prospect_id, r.last_contact_at);
        }
      });
      if (coldMap.size === 0) return [];
      const { data } = await supabase
        .from("prospects")
        .select("id, first_name, last_name, company, email, phone, status, updated_at")
        .in("id", Array.from(coldMap.keys()))
        .not("status", "in", "(converti,perdu)")
        .eq("owner_id", user!.id);
      return (data || [])
        .map((p) => ({ ...p, last_contact_at: coldMap.get(p.id)! }))
        .sort((a, b) => a.last_contact_at.localeCompare(b.last_contact_at))
        .slice(0, 20) as Array<Prospect & { last_contact_at: string }>;
    },
  });

  // ─── Classification des réponses entrantes (positives / négatives / neutres)
  const classifiedReplies = useMemo(() => {
    return (incomingReplies || []).map((r) => ({
      ...r,
      tone: classifyReply(r.content),
    }));
  }, [incomingReplies]);
  const positives = classifiedReplies.filter((r) => r.tone === "positive");
  const negatives = classifiedReplies.filter((r) => r.tone === "negative");
  const neutrals = classifiedReplies.filter((r) => r.tone === "neutral");

  // ─── Total to-do ───────────────────────────────────────────────────
  const totalTodo =
    (hotPreviews?.length || 0) +
    classifiedReplies.length +
    (dueFollowUps?.length || 0) +
    (lateProspects?.length || 0) +
    (stuckInterested?.length || 0) +
    (ignoredPreviews?.length || 0) +
    (coldProspects?.length || 0);

  // ─── Mutations ──────────────────────────────────────────────────────
  const completeFollowUp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("follow_ups").update({ completed: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cockpit-followups"] });
      toast.success("Relance marquée terminée");
    },
  });

  const markReplyAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("messages").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cockpit-replies"] }),
  });

  // Auto-classify : marque comme "perdu" un prospect avec réponse négative claire
  const markAsLost = useMutation({
    mutationFn: async (prospectId: string) => {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          update: (v: Record<string, unknown>) => {
            eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      }).from("prospects").update({ status: "perdu", updated_at: new Date().toISOString() }).eq("id", prospectId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cockpit-replies"] });
      qc.invalidateQueries({ queryKey: ["cockpit-stuck"] });
      toast.success("Prospect marqué Perdu");
    },
  });


  // ─── Construction de la queue pour le Mode Session ───
  //   On combine toutes les sections (chauds → échanges → relances →
  //   en retard → intéressés sans suite → aperçus non ouverts) en une
  //   liste unique, dédupliquée par prospect_id (un même prospect peut
  //   apparaître dans plusieurs sections, on le présente UNE SEULE FOIS
  //   dans la session avec le contexte le plus prioritaire).
  const sessionQueue: SessionItem[] = useMemo(() => {
    const seen = new Set<string>();
    const items: SessionItem[] = [];
    const push = (item: SessionItem) => {
      if (!item.prospect?.id || seen.has(item.prospect.id)) return;
      seen.add(item.prospect.id);
      items.push(item);
    };
    // 1. Chauds (prio max)
    (hotPreviews || []).forEach((h) => {
      if (!h.prospects) return;
      push({
        key: `hot-${h.id}`,
        kind: "hot",
        prospect: h.prospects,
        contextLabel: `Aperçu vu ${h.view_count}× · dernière ouverture il y a ${formatDistanceToNow(new Date(h.opened_at), { locale: fr })}`,
      });
    });
    // 2. Échanges positifs (signal d'achat)
    classifiedReplies.filter((r) => r.tone === "positive").forEach((r) => {
      if (!r.prospects) return;
      push({
        key: `pos-${r.id}`,
        kind: "reply",
        prospect: r.prospects,
        contextLabel: "Signal d'achat détecté",
        excerpt: r.content.slice(0, 180),
      });
    });
    // 3. Relances planifiées du jour
    (dueFollowUps || []).forEach((f) => {
      if (!f.prospects) return;
      push({
        key: `fu-${f.id}`,
        kind: "followup",
        prospect: f.prospects,
        contextLabel: f.reason || `Relance prévue ${format(new Date(f.scheduled_at), "PPp", { locale: fr })}`,
      });
    });
    // 4. À analyser (réponses neutres)
    classifiedReplies.filter((r) => r.tone === "neutral").forEach((r) => {
      if (!r.prospects) return;
      push({
        key: `neu-${r.id}`,
        kind: "reply",
        prospect: r.prospects,
        contextLabel: "Réponse à analyser",
        excerpt: r.content.slice(0, 180),
      });
    });
    // 5. En retard d'appel
    (lateProspects || []).slice(0, 15).forEach((p) => {
      push({
        key: `late-${p.id}`,
        kind: "late_call",
        prospect: p,
        contextLabel: p.last_called_at
          ? `Pas appelé depuis ${formatDistanceToNow(new Date(p.last_called_at), { locale: fr })}`
          : "Jamais contacté",
      });
    });
    // 6. Intéressés sans suite
    (stuckInterested || []).forEach((p) => {
      push({
        key: `stuck-${p.id}`,
        kind: "stuck",
        prospect: p,
        contextLabel: `Statut Intéressé · sans suite depuis ${formatDistanceToNow(new Date(p.updated_at), { locale: fr })}`,
      });
    });
    // 7. Aperçus non ouverts
    (ignoredPreviews || []).forEach((i) => {
      if (!i.prospects) return;
      push({
        key: `ign-${i.id}`,
        kind: "ignored",
        prospect: i.prospects,
        contextLabel: `Aperçu envoyé il y a ${formatDistanceToNow(new Date(i.generated_at), { locale: fr })} · 0 vue`,
      });
    });
    // 8. Prospects froids à réveiller (>30j sans interaction)
    (coldProspects || []).forEach((p) => {
      push({
        key: `cold-${p.id}`,
        kind: "cold",
        prospect: p,
        contextLabel: `Aucune interaction depuis ${formatDistanceToNow(new Date(p.last_contact_at), { locale: fr })}`,
      });
    });
    return items;
  }, [hotPreviews, classifiedReplies, dueFollowUps, lateProspects, stuckInterested, ignoredPreviews, coldProspects]);

  const [sessionOpen, setSessionOpen] = useState(false);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ═══ HEADER gamifié : score du jour + bouton Démarrer ma session ═══ */}
      <CockpitDailyHeader
        hotCount={hotPreviews?.length || 0}
        totalActions={sessionQueue.length}
        onStartSession={() => setSessionOpen(true)}
      />

      {/* ═══ Mode session plein écran ═══ */}
      <CockpitSessionMode
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        items={sessionQueue}
      />

      {/* Ligne d'info sous le header */}
      <p className="text-sm text-muted-foreground">
        {totalTodo === 0
          ? "🎉 Tu es à jour, plus rien à faire ! Lance une nouvelle chasse ?"
          : `${totalTodo} action${totalTodo > 1 ? "s" : ""} en attente — classées par priorité ci-dessous`}
      </p>

      {/* ─── SECTION 1 : Chauds (Aperçu ouvert < 24h) ─── */}
      <Section
        icon={<Flame className="h-5 w-5" />}
        tone="orange"
        title="Prospects chauds"
        subtitle="Ont ouvert leur Aperçu Instantané dans les dernières 24h — rappelle dans les 5 minutes"
        count={hotPreviews?.length || 0}
        empty="Personne n'a ouvert d'aperçu récemment."
      >
        {(hotPreviews || []).map((h) => (
          <Item
            key={h.id}
            prospect={h.prospects}
            meta={
              <span className="text-xs text-orange-700 dark:text-orange-300 font-semibold">
                {h.view_count}× ouvert · dernière {formatDistanceToNow(new Date(h.opened_at), { locale: fr, addSuffix: true })}
              </span>
            }
            actions={
              <>
                {h.prospects?.phone && (
                  <Button size="sm" variant="default" asChild className="gap-1 bg-orange-600 hover:bg-orange-700">
                    <a href={`tel:${h.prospects.phone}`}><Phone className="h-3 w-3" /> Appeler</a>
                  </Button>
                )}
              </>
            }
          />
        ))}
      </Section>

      {/* ─── SECTION 2 : Réponses reçues — split par tone ─── */}
      <Section
        icon={<MessageCircle className="h-5 w-5" />}
        tone="emerald"
        title="Échanges récents à traiter"
        subtitle="Emails, SMS, LinkedIn, notes d'appel des 7 derniers jours — auto-classés par signal"
        count={classifiedReplies.length}
        empty="Pas de nouvel échange à traiter."
      >
        {positives.length > 0 && (
          <SubGroup label="🟢 Signal d'achat" tone="emerald">
            {positives.map((r) => (
              <Item
                key={r.id}
                prospect={r.prospects}
                meta={
                  <div className="flex items-start gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium shrink-0 mt-0.5">
                      {CHANNEL_LABEL[r.channel]?.icon} {CHANNEL_LABEL[r.channel]?.label || r.channel}
                    </span>
                    <span className="text-xs italic text-emerald-800 dark:text-emerald-300 line-clamp-1">"{r.content.slice(0, 140)}…"</span>
                  </div>
                }
                actions={
                  <>
                    <Button size="sm" variant="default" asChild className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                      <Link to="/inbox">Répondre <ArrowRight className="h-3 w-3" /></Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => markReplyAsRead.mutate(r.id)} title="Marquer lu">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </>
                }
              />
            ))}
          </SubGroup>
        )}
        {neutrals.length > 0 && (
          <SubGroup label="🟡 À analyser" tone="amber">
            {neutrals.map((r) => (
              <Item
                key={r.id}
                prospect={r.prospects}
                meta={
                  <div className="flex items-start gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium shrink-0 mt-0.5">
                      {CHANNEL_LABEL[r.channel]?.icon} {CHANNEL_LABEL[r.channel]?.label || r.channel}
                    </span>
                    <span className="text-xs italic text-muted-foreground line-clamp-1">"{r.content.slice(0, 140)}…"</span>
                  </div>
                }
                actions={
                  <Button size="sm" variant="outline" asChild className="gap-1">
                    <Link to="/inbox">Lire <ArrowRight className="h-3 w-3" /></Link>
                  </Button>
                }
              />
            ))}
          </SubGroup>
        )}
        {negatives.length > 0 && (
          <SubGroup label="🔴 Probable refus" tone="rose">
            {negatives.map((r) => (
              <Item
                key={r.id}
                prospect={r.prospects}
                meta={
                  <div className="flex items-start gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium shrink-0 mt-0.5">
                      {CHANNEL_LABEL[r.channel]?.icon} {CHANNEL_LABEL[r.channel]?.label || r.channel}
                    </span>
                    <span className="text-xs italic text-rose-700 dark:text-rose-300 line-clamp-1">"{r.content.slice(0, 140)}…"</span>
                  </div>
                }
                actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => markAsLost.mutate(r.prospect_id)} className="gap-1 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900 hover:bg-rose-50">
                      Marquer perdu
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/inbox">Voir <ChevronRight className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </>
                }
              />
            ))}
          </SubGroup>
        )}
      </Section>

      {/* ─── SECTION 3 : Relances planifiées du jour ─── */}
      <Section
        icon={<CalendarClock className="h-5 w-5" />}
        tone="sky"
        title="Relances planifiées"
        subtitle="À faire aujourd'hui (ou en retard)"
        count={dueFollowUps?.length || 0}
        empty="Aucune relance planifiée pour aujourd'hui."
      >
        {(dueFollowUps || []).map((f) => {
          const overdue = new Date(f.scheduled_at) < now();
          return (
            <Item
              key={f.id}
              prospect={f.prospects}
              meta={
                <span className={cn("text-xs", overdue ? "text-rose-600 font-semibold" : "text-muted-foreground")}>
                  {overdue ? "⚠️ En retard · " : "📅 "}{format(new Date(f.scheduled_at), "PPp", { locale: fr })}
                  {f.reason && ` · ${f.reason}`}
                </span>
              }
              actions={
                <Button size="sm" variant="outline" onClick={() => completeFollowUp.mutate(f.id)} className="gap-1">
                  <Check className="h-3.5 w-3.5" /> Terminer
                </Button>
              }
            />
          );
        })}
      </Section>

      {/* ─── SECTION 4 : En retard d'appel ─── */}
      <Section
        icon={<AlertTriangle className="h-5 w-5" />}
        tone="amber"
        title="Prospects en retard d'appel"
        subtitle="Jamais appelés depuis leur création > 5j, ou silence > 14j"
        count={lateProspects?.length || 0}
        empty="Tout le monde a été contacté récemment."
      >
        {(lateProspects || []).slice(0, 15).map((p) => (
          <Item
            key={p.id}
            prospect={p}
            meta={
              <span className="text-xs text-muted-foreground">
                {p.last_called_at
                  ? `Dernier appel ${formatDistanceToNow(new Date(p.last_called_at), { locale: fr, addSuffix: true })}`
                  : "Jamais appelé"}
              </span>
            }
            actions={p.phone && (
              <Button size="sm" variant="outline" asChild className="gap-1">
                <a href={`tel:${p.phone}`}><Phone className="h-3 w-3" /> Appeler</a>
              </Button>
            )}
          />
        ))}
      </Section>

      {/* ─── SECTION 5 : Intéressés sans suite ─── */}
      <Section
        icon={<Briefcase className="h-5 w-5" />}
        tone="violet"
        title="Intéressés sans suite > 5j"
        subtitle="Ils étaient chauds, ne les laisse pas refroidir"
        count={stuckInterested?.length || 0}
        empty="Aucun prospect intéressé sans suite récente."
      >
        {(stuckInterested || []).map((p) => (
          <Item
            key={p.id}
            prospect={p}
            meta={
              <span className="text-xs text-violet-700 dark:text-violet-300">
                Statut Intéressé · pas de maj depuis {formatDistanceToNow(new Date(p.updated_at), { locale: fr, addSuffix: false })}
              </span>
            }
            actions={p.phone && (
              <Button size="sm" variant="default" asChild className="gap-1 bg-violet-600 hover:bg-violet-700">
                <a href={`tel:${p.phone}`}><Phone className="h-3 w-3" /> Relancer</a>
              </Button>
            )}
          />
        ))}
      </Section>

      {/* ─── SECTION 7 : Prospects froids à réveiller ─── */}
      <Section
        icon={<Snowflake className="h-5 w-5" />}
        tone="cyan"
        title="Prospects froids à réveiller"
        subtitle="Aucune interaction depuis plus de 30 jours — un appel, un email, et ils repartent"
        count={coldProspects?.length || 0}
        empty="Aucun prospect froid — tu gardes le lien avec tout le monde 💪"
      >
        {(coldProspects || []).map((p) => (
          <Item
            key={p.id}
            prospect={p}
            meta={
              <span className="text-xs text-cyan-700 dark:text-cyan-300">
                ❄️ Sans contact depuis {formatDistanceToNow(new Date(p.last_contact_at), { locale: fr })}
              </span>
            }
            actions={
              <>
                {p.phone && (
                  <Button size="sm" variant="default" asChild className="gap-1 bg-cyan-600 hover:bg-cyan-700">
                    <a href={`tel:${p.phone}`}><Phone className="h-3 w-3" /> Appeler</a>
                  </Button>
                )}
                {p.email && !p.phone && (
                  <Button size="sm" variant="outline" asChild className="gap-1">
                    <a href={`mailto:${p.email}`}><Mail className="h-3 w-3" /> Email</a>
                  </Button>
                )}
              </>
            }
          />
        ))}
      </Section>

      {/* ─── SECTION 6 : Aperçus envoyés non ouverts ─── */}
      <Section
        icon={<EyeOff className="h-5 w-5" />}
        tone="slate"
        title="Aperçus envoyés non ouverts"
        subtitle="Le prospect n'a même pas cliqué — tente un appel direct ou un autre canal"
        count={ignoredPreviews?.length || 0}
        empty="Tous les aperçus envoyés ont été ouverts."
      >
        {(ignoredPreviews || []).map((i) => (
          <Item
            key={i.id}
            prospect={i.prospects}
            meta={
              <span className="text-xs text-muted-foreground">
                Envoyé il y a {formatDistanceToNow(new Date(i.generated_at), { locale: fr })} · 0 vue
              </span>
            }
            actions={i.prospects?.phone && (
              <Button size="sm" variant="outline" asChild className="gap-1">
                <a href={`tel:${i.prospects.phone}`}><Phone className="h-3 w-3" /> Appeler</a>
              </Button>
            )}
          />
        ))}
      </Section>

    </div>
  );
}

// ─── SOUS-COMPOSANTS ──────────────────────────────────────────────────

type Tone = "orange" | "emerald" | "sky" | "amber" | "violet" | "slate" | "cyan" | "rose";

const TONE_CLS: Record<Tone, { ring: string; pill: string; icon: string }> = {
  orange:  { ring: "border-orange-200 dark:border-orange-900/50", pill: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300", icon: "text-orange-500" },
  emerald: { ring: "border-emerald-200 dark:border-emerald-900/50", pill: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300", icon: "text-emerald-500" },
  sky:     { ring: "border-sky-200 dark:border-sky-900/50", pill: "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300", icon: "text-sky-500" },
  amber:   { ring: "border-amber-200 dark:border-amber-900/50", pill: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300", icon: "text-amber-500" },
  violet:  { ring: "border-violet-200 dark:border-violet-900/50", pill: "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300", icon: "text-violet-500" },
  slate:   { ring: "border-slate-200 dark:border-slate-800", pill: "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400", icon: "text-slate-500" },
  cyan:    { ring: "border-cyan-200 dark:border-cyan-900/50", pill: "bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300", icon: "text-cyan-500" },
  rose:    { ring: "border-rose-200 dark:border-rose-900/50", pill: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300", icon: "text-rose-500" },
};

function Section({
  icon, tone, title, subtitle, count, empty, children,
}: {
  icon: React.ReactNode;
  tone: Tone;
  title: string;
  subtitle: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  const cls = TONE_CLS[tone];
  if (count === 0) return null; // on cache les sections vides pour ne montrer QUE ce qui compte
  return (
    <Card className={cn("overflow-hidden", cls.ring)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className={cls.icon}>{icon}</span>
          {title}
          <Badge className={cn("ml-1 font-bold", cls.pill, "border-0")}>{count}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="p-0 divide-y">
        {count === 0 ? <p className="p-4 text-sm text-muted-foreground italic">{empty}</p> : children}
      </CardContent>
    </Card>
  );
}

function SubGroup({ label, tone, children }: { label: string; tone: Tone; children: React.ReactNode }) {
  const cls = TONE_CLS[tone];
  return (
    <div className={cn("py-2 px-4 border-l-2", cls.icon.replace("text-", "border-"))}>
      <div className={cn("text-[11px] font-semibold uppercase tracking-wider mb-1", cls.icon)}>{label}</div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function Item({ prospect, meta, actions }: ItemBase & { actions?: React.ReactNode }) {
  if (!prospect) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition">
      <div className="flex-1 min-w-0">
        <Link
          to="/prospects/$id"
          params={{ id: prospect.id }}
          className="font-medium hover:underline truncate inline-flex items-center gap-1.5"
        >
          {prospect.first_name} {prospect.last_name}
          {prospect.company && <span className="text-muted-foreground">· {prospect.company}</span>}
          <ExternalLink className="h-3 w-3 opacity-40" />
        </Link>
        {meta && <div className="mt-0.5">{meta}</div>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>
    </div>
  );
}
