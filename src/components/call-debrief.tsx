/**
 * ─── CallDebrief — Débrief d'appel (texte OU voix) + IA + coaching ─────
 *
 * Sur la fiche prospect. Le commercial :
 *   - écrit sa note en vrac, OU
 *   - 🎙️ PARLE son débrief (mémo vocal) après avoir raccroché
 *
 * L'IA (debrief-analyze) :
 *   - transcrit (mode voix) + extrait le RÉSULTAT + résumé + prochaine action
 *   - propose un délai de relance (langage naturel : "lundi", "semaine pro"…)
 *   - COACHE le commercial, adossé à la philosophie de vente de l'agence
 *
 * 1 clic "Valider" → écrit call_logs, met à jour le statut, crée le follow_up.
 */

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Wand2, Check, Mic, Square, Loader2, GraduationCap } from "lucide-react";
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

type AiSuggestion = {
  outcome: DebriefKey;
  summary: string;
  next_action: string;
  follow_up_days: number | null;
  coaching: string[];
  transcript?: string;
};

export function CallDebrief({
  prospectId,
  prospect,
  onSaved,
}: {
  prospectId: string;
  prospect: { first_name?: string | null; company?: string | null; status?: string | null };
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);

  // ─── Enregistrement vocal ───────────────────────────────────────
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
        body: { audio_base64, mime_type: blob.type || "audio/webm", prospect },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Analyse impossible");
      return normalize(data);
    },
    onSuccess: (s) => {
      setSuggestion(s);
      if (s.transcript) setNote(s.transcript);
    },
    onError: (e: Error) => toast.error("IA vocale : " + e.message),
  });

  const analyzeText = useMutation({
    mutationFn: async (text: string): Promise<AiSuggestion> => {
      const { data, error } = await supabase.functions.invoke("debrief-analyze", {
        body: { note: text, prospect },
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
      mr.onstop = async () => {
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
      toast.error("Micro inaccessible — autorise l'accès au microphone dans le navigateur.");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  // ─── Enregistrement du débrief ──────────────────────────────────
  const save = useMutation({
    mutationFn: async ({ outcome, fromAi }: { outcome: DebriefKey; fromAi: boolean }) => {
      const cfg = OUTCOMES[outcome];
      const nowISO = new Date().toISOString();
      const days = fromAi && suggestion ? suggestion.follow_up_days : cfg.followUpDays;
      const reason = fromAi && suggestion?.next_action ? suggestion.next_action : (cfg.reason || note.trim().slice(0, 80));
      const summary = (fromAi && suggestion?.summary) ? suggestion.summary : note.trim();

      const { error: e1 } = await supabase.from("call_logs").insert({
        prospect_id: prospectId, owner_id: user!.id, called_at: nowISO,
        outcome, summary: summary || null,
      });
      if (e1) throw e1;
      if (cfg.status) {
        await supabase.from("prospects").update({ status: cfg.status, updated_at: nowISO }).eq("id", prospectId);
      }
      if (days != null) {
        await supabase.from("follow_ups").insert({
          prospect_id: prospectId, owner_id: user!.id,
          scheduled_at: new Date(Date.now() + days * 86_400_000).toISOString(),
          reason, completed: false,
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
      {/* Note + micro */}
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
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Transcription + analyse en cours…</p>
      )}

      {/* Bouton analyse texte */}
      {!recording && !analyzeAudio.isPending && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!note.trim() || busy} onClick={() => analyzeText.mutate(note)}
            className="gap-1.5 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-700 text-white">
            {analyzeText.isPending ? <Wand2 className="h-3.5 w-3.5 animate-pulse" /> : <Sparkles className="h-3.5 w-3.5" />}
            {analyzeText.isPending ? "Analyse…" : "Analyser le texte"}
          </Button>
          <span className="text-[11px] text-muted-foreground">l'IA extrait le résultat, la relance et te coache</span>
        </div>
      )}

      {/* Carte suggestion IA */}
      {suggestion && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider font-bold text-primary inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Analyse IA
            </p>
            <span className="text-xs font-semibold">{OUTCOMES[suggestion.outcome].label}</span>
          </div>
          {suggestion.summary && <p className="text-sm">{suggestion.summary}</p>}
          <div className="text-xs space-y-0.5 text-muted-foreground">
            <p>👉 <span className="font-medium text-foreground">Prochaine action :</span> {suggestion.next_action}</p>
            <p>📅 {suggestion.follow_up_days != null ? `Relance dans ${suggestion.follow_up_days} jour${suggestion.follow_up_days > 1 ? "s" : ""}` : "Pas de relance"}</p>
          </div>

          {/* Coaching */}
          {suggestion.coaching.length > 0 && (
            <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/50 p-2.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-violet-700 dark:text-violet-300 inline-flex items-center gap-1 mb-1">
                <GraduationCap className="h-3 w-3" /> Coaching
              </p>
              <ul className="space-y-1">
                {suggestion.coaching.map((c, i) => (
                  <li key={i} className="text-xs text-violet-900 dark:text-violet-200 flex gap-1.5">
                    <span className="text-violet-500">•</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 pt-0.5">
            <Button size="sm" disabled={save.isPending}
              onClick={() => save.mutate({ outcome: suggestion.outcome, fromAi: true })} className="gap-1.5">
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

function normalize(data: Record<string, unknown>): AiSuggestion {
  const valid: DebriefKey[] = ["interested", "callback", "no_answer", "refused", "note"];
  const outcome = valid.includes(data.outcome as DebriefKey) ? (data.outcome as DebriefKey) : "note";
  return {
    outcome,
    summary: (data.summary as string) || "",
    next_action: (data.next_action as string) || "",
    follow_up_days: (data.follow_up_days as number) ?? null,
    coaching: Array.isArray(data.coaching) ? (data.coaching as string[]) : [],
    transcript: (data.transcript as string) || undefined,
  };
}
