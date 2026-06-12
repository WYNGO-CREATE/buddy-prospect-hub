/**
 * ─── CallDebrief — Débrief d'appel + analyse de CLOSING (texte/voix) ────
 *
 * Le commercial écrit ou PARLE 🎙️ son débrief. L'IA (debrief-analyze) voit
 * tout le contexte du prospect (historique, aperçu, site, offre) et rend
 * une analyse de closer pour FAIRE SIGNER :
 *   - température (proximité signature) · signaux d'achat
 *   - objections + LA riposte à donner (adossée à la méthode)
 *   - le frein n°1 · le move de closing · un message de relance prêt
 *   - coaching personnalisé
 *
 * 1 clic "Valider" → call_logs + statut + follow_up auto.
 */

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Wand2, Check, Mic, Square, Loader2, GraduationCap,
  TrendingUp, ShieldAlert, Target, MessageSquare, Copy, Flame,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DebriefKey = "interested" | "callback" | "no_answer" | "refused" | "note";

const OUTCOMES: Record<DebriefKey, { label: string; status: string | null; followUpDays: number | null; reason: string }> = {
  interested: { label: "🤝 Intéressé / RDV", status: "interesse",  followUpDays: 1,    reason: "Suite à appel intéressé — confirmer / envoyer infos" },
  callback:   { label: "🔁 À rappeler",      status: "a_relancer", followUpDays: 2,    reason: "Rappeler (demandé pendant l'appel)" },
  no_answer:  { label: "📵 Pas de réponse",  status: null,         followUpDays: 2,    reason: "Pas de réponse — réessayer" },
  refused:    { label: "❌ Pas intéressé",   status: "perdu",      followUpDays: null,  reason: "" },
  note:       { label: "📝 Simple note",     status: null,         followUpDays: null,  reason: "" },
};

type Objection = { objection: string; handled: boolean; rebuttal: string };
type AiSuggestion = {
  outcome: DebriefKey;
  summary: string;
  next_action: string;
  follow_up_days: number | null;
  temperature: number;
  buying_signals: string[];
  objections: Objection[];
  blocker: string;
  closing_move: string;
  suggested_message: string;
  coaching: string[];
  transcript?: string;
};

const copy = (text: string, label = "Copié") =>
  navigator.clipboard.writeText(text).then(() => toast.success(label)).catch(() => toast.error("Copie impossible"));

export function CallDebrief({
  prospectId,
  onSaved,
}: {
  prospectId: string;
  prospect?: unknown; // (conservé pour rétrocompat d'appel, non utilisé)
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);

  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  const analyzeAudio = useMutation({
    mutationFn: async (blob: Blob): Promise<AiSuggestion> => {
      const audio_base64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke("debrief-analyze", {
        body: { audio_base64, mime_type: blob.type || "audio/webm", prospect_id: prospectId },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Analyse impossible");
      return normalize(data);
    },
    onSuccess: (s) => { setSuggestion(s); if (s.transcript) setNote(s.transcript); },
    onError: (e: Error) => toast.error("IA vocale : " + e.message),
  });

  const analyzeText = useMutation({
    mutationFn: async (text: string): Promise<AiSuggestion> => {
      const { data, error } = await supabase.functions.invoke("debrief-analyze", {
        body: { note: text, prospect_id: prospectId },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Analyse impossible");
      return normalize(data);
    },
    onSuccess: (s) => setSuggestion(s),
    onError: (e: Error) => toast.error("IA : " + e.message),
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size > 0) analyzeAudio.mutate(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      timerRef.current = window.setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      toast.error("Micro inaccessible — autorise l'accès au microphone.");
    }
  }
  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  const save = useMutation({
    mutationFn: async ({ outcome, fromAi }: { outcome: DebriefKey; fromAi: boolean }) => {
      const cfg = OUTCOMES[outcome];
      const nowISO = new Date().toISOString();
      const days = fromAi && suggestion ? suggestion.follow_up_days : cfg.followUpDays;
      const reason = fromAi && suggestion?.closing_move ? suggestion.closing_move
        : fromAi && suggestion?.next_action ? suggestion.next_action
        : (cfg.reason || note.trim().slice(0, 80));
      const summary = (fromAi && suggestion?.summary) ? suggestion.summary : note.trim();
      const { error: e1 } = await supabase.from("call_logs").insert({
        prospect_id: prospectId, owner_id: user!.id, called_at: nowISO, outcome, summary: summary || null,
      });
      if (e1) throw e1;
      if (cfg.status) await supabase.from("prospects").update({ status: cfg.status as "interesse" | "a_relancer" | "perdu", updated_at: nowISO }).eq("id", prospectId);
      if (days != null) {
        await supabase.from("follow_ups").insert({
          prospect_id: prospectId, owner_id: user!.id,
          scheduled_at: new Date(Date.now() + days * 86_400_000).toISOString(),
          reason: reason.slice(0, 200), completed: false,
        });
      }
      return { outcome, days };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["calls", prospectId] });
      qc.invalidateQueries({ queryKey: ["events", prospectId] });
      qc.invalidateQueries({ queryKey: ["prospect", prospectId] });
      qc.invalidateQueries({ queryKey: ["followups", prospectId] });
      setNote(""); setSuggestion(null);
      toast.success(`Débrief enregistré — ${OUTCOMES[r.outcome].label}${r.days != null ? " · relance programmée" : ""}`);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = analyzeText.isPending || analyzeAudio.isPending || save.isPending;
  const mm = String(Math.floor(recSeconds / 60)).padStart(2, "0");
  const ss = String(recSeconds % 60).padStart(2, "0");

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); if (suggestion) setSuggestion(null); }}
          rows={3}
          placeholder="Écris ton débrief… ou clique le micro et PARLE-le après ton appel."
          className="resize-none pr-12"
          disabled={recording || analyzeAudio.isPending}
        />
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={analyzeAudio.isPending}
          className={cn(
            "absolute top-2 right-2 size-9 rounded-full flex items-center justify-center transition shadow-sm",
            recording ? "bg-rose-600 text-white animate-pulse" : "bg-primary text-primary-foreground hover:opacity-90",
          )}
          title={recording ? "Arrêter et analyser" : "Débrief vocal"}
        >
          {analyzeAudio.isPending ? <Loader2 className="size-4 animate-spin" /> : recording ? <Square className="size-4" /> : <Mic className="size-4" />}
        </button>
      </div>

      {recording && (
        <p className="text-xs text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-rose-600 animate-pulse" /> Enregistrement… {mm}:{ss} — reparle ton appel, clique ⏹ pour analyser
        </p>
      )}
      {analyzeAudio.isPending && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Transcription + analyse de closing en cours…</p>
      )}

      {!recording && !analyzeAudio.isPending && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!note.trim() || busy} onClick={() => analyzeText.mutate(note)}
            className="gap-1.5 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-700 text-white">
            {analyzeText.isPending ? <Wand2 className="h-3.5 w-3.5 animate-pulse" /> : <Sparkles className="h-3.5 w-3.5" />}
            {analyzeText.isPending ? "Analyse…" : "Analyser pour signer"}
          </Button>
          <span className="text-[11px] text-muted-foreground">l'IA analyse la situation et te dit comment closer</span>
        </div>
      )}

      {/* ─── Analyse de closing ─── */}
      {suggestion && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          {/* En-tête : résultat + température */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-primary inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Analyse de closing
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">{OUTCOMES[suggestion.outcome].label}</span>
              <TempBadge value={suggestion.temperature} />
            </div>
          </div>

          {/* Jauge température */}
          <div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full transition-all", tempColor(suggestion.temperature))} style={{ width: `${suggestion.temperature}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Proximité de la signature : {suggestion.temperature}/100</p>
          </div>

          {suggestion.summary && <p className="text-sm">{suggestion.summary}</p>}

          {/* Signaux d'achat */}
          {suggestion.buying_signals.length > 0 && (
            <Section icon={<TrendingUp className="h-3 w-3" />} title="Signaux d'achat" tone="emerald">
              <ul className="space-y-0.5">
                {suggestion.buying_signals.map((s, i) => (
                  <li key={i} className="text-xs text-emerald-900 dark:text-emerald-200 flex gap-1.5"><span className="text-emerald-500">✓</span>{s}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Objections + ripostes */}
          {suggestion.objections.length > 0 && (
            <Section icon={<ShieldAlert className="h-3 w-3" />} title="Objections & ripostes" tone="amber">
              <div className="space-y-2">
                {suggestion.objections.map((o, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      «&nbsp;{o.objection}&nbsp;»
                      <span className={cn("text-[9px] px-1 rounded", o.handled ? "bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200" : "bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200")}>
                        {o.handled ? "traitée" : "à traiter"}
                      </span>
                    </p>
                    <p className="text-muted-foreground mt-0.5 pl-2 border-l-2 border-amber-300 dark:border-amber-800">👉 {o.rebuttal}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Frein principal */}
          {suggestion.blocker && (
            <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 p-2.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-rose-700 dark:text-rose-300 mb-0.5">🚧 Le frein n°1</p>
              <p className="text-xs text-rose-900 dark:text-rose-200">{suggestion.blocker}</p>
            </div>
          )}

          {/* Move de closing — la pièce maîtresse */}
          {suggestion.closing_move && (
            <div className="rounded-md bg-primary/10 border border-primary/30 p-2.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-primary mb-0.5 inline-flex items-center gap-1"><Target className="h-3 w-3" /> Ton move pour signer</p>
              <p className="text-xs font-medium">{suggestion.closing_move}</p>
            </div>
          )}

          {/* Message de relance prêt */}
          {suggestion.suggested_message && (
            <div className="rounded-md bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-wider font-bold text-sky-700 dark:text-sky-300 inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Message de relance prêt</p>
                <button onClick={() => copy(suggestion.suggested_message, "Message copié")} className="text-[10px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1 hover:underline">
                  <Copy className="h-2.5 w-2.5" /> Copier
                </button>
              </div>
              <p className="text-xs italic text-sky-900 dark:text-sky-200">{suggestion.suggested_message}</p>
            </div>
          )}

          {/* Coaching */}
          {suggestion.coaching.length > 0 && (
            <Section icon={<GraduationCap className="h-3 w-3" />} title="Coaching" tone="violet">
              <ul className="space-y-1">
                {suggestion.coaching.map((c, i) => (
                  <li key={i} className="text-xs text-violet-900 dark:text-violet-200 flex gap-1.5"><span className="text-violet-500">•</span>{c}</li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex gap-2 pt-0.5">
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ outcome: suggestion.outcome, fromAi: true })} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Valider & enregistrer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSuggestion(null)} className="text-muted-foreground">Ignorer</Button>
          </div>
        </div>
      )}

      {/* Résultat manuel */}
      {!recording && (
        <>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(OUTCOMES) as DebriefKey[]).map((key) => (
              <Button key={key} size="sm" variant="outline" disabled={busy}
                onClick={() => save.mutate({ outcome: key, fromAi: false })} className="text-xs">
                {OUTCOMES[key].label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            💡 Sans IA : « Intéressé » → relance demain · « À rappeler »/« Pas de réponse » → 2 jours · « Pas intéressé » → perdu.
          </p>
        </>
      )}
    </div>
  );
}

function Section({ icon, title, tone, children }: { icon: React.ReactNode; title: string; tone: "emerald" | "amber" | "violet"; children: React.ReactNode }) {
  const cls = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300",
    violet: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/50 text-violet-700 dark:text-violet-300",
  }[tone];
  return (
    <div className={cn("rounded-md border p-2.5", cls)}>
      <p className="text-[10px] uppercase tracking-wider font-bold inline-flex items-center gap-1 mb-1">{icon} {title}</p>
      {children}
    </div>
  );
}

function tempColor(t: number): string {
  if (t >= 70) return "bg-gradient-to-r from-orange-500 to-rose-500";
  if (t >= 40) return "bg-gradient-to-r from-amber-400 to-orange-500";
  return "bg-gradient-to-r from-sky-400 to-blue-500";
}
function TempBadge({ value }: { value: number }) {
  const hot = value >= 70;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded",
      hot ? "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300"
          : value >= 40 ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
          : "bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300")}>
      <Flame className="h-2.5 w-2.5" /> {value}°
    </span>
  );
}

function normalize(data: Record<string, unknown>): AiSuggestion {
  const valid: DebriefKey[] = ["interested", "callback", "no_answer", "refused", "note"];
  const outcome = valid.includes(data.outcome as DebriefKey) ? (data.outcome as DebriefKey) : "note";
  const objections: Objection[] = Array.isArray(data.objections)
    ? (data.objections as Record<string, unknown>[]).map((o) => ({
        objection: String(o?.objection || ""), handled: !!o?.handled, rebuttal: String(o?.rebuttal || ""),
      })).filter((o) => o.objection)
    : [];
  return {
    outcome,
    summary: (data.summary as string) || "",
    next_action: (data.next_action as string) || "",
    follow_up_days: (data.follow_up_days as number) ?? null,
    temperature: typeof data.temperature === "number" ? data.temperature : 0,
    buying_signals: Array.isArray(data.buying_signals) ? (data.buying_signals as string[]) : [],
    objections,
    blocker: (data.blocker as string) || "",
    closing_move: (data.closing_move as string) || "",
    suggested_message: (data.suggested_message as string) || "",
    coaching: Array.isArray(data.coaching) ? (data.coaching as string[]) : [],
    transcript: (data.transcript as string) || undefined,
  };
}
