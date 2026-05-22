/**
 * ─── Workflow Tick ───
 *
 * Worker exécuté toutes les 5 minutes (via pg_cron) qui :
 *  1. Récupère tous les workflow_runs `running` dont `next_run_at <= now()`
 *  2. Pour chaque run : exécute l'étape courante (envoi email, création note/tâche)
 *  3. Schedule la prochaine étape OU marque le run `completed`
 *
 * Sécurité : appelé via header `x-cron-secret` (CRON_SECRET)
 *   OU appelé manuellement par un user authentifié (debug / "Lancer maintenant")
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  buildEmailHtml,
  buildEmailText,
  buildRawMultipartEmail,
  type EmailSignatureData,
} from "../_shared/email-html.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Render variables {{prenom}} {{entreprise}} … ───
function renderTemplate(
  tpl: string,
  ctx: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    email?: string | null;
    sender_name?: string | null;
    sender_email?: string | null;
    agency_name?: string | null;
  },
): string {
  const map: Record<string, string> = {
    prenom: ctx.first_name || "",
    nom: ctx.last_name || "",
    entreprise: ctx.company || "",
    email: ctx.email || "",
    expediteur: ctx.sender_name || "",
    email_expediteur: ctx.sender_email || "",
    agence: ctx.agency_name || "",
    // Aliases anglais
    first_name: ctx.first_name || "",
    last_name: ctx.last_name || "",
    company: ctx.company || "",
    sender: ctx.sender_name || "",
  };
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => map[key] ?? `{{${key}}}`);
}

// ─── Refresh Gmail access token si besoin ───
async function getFreshAccessToken(account: any): Promise<string> {
  if (new Date(account.expires_at).getTime() - Date.now() > 60_000) {
    return account.access_token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: account.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Refresh token failed: ${await res.text()}`);
  const j = await res.json();
  await admin
    .from("gmail_accounts")
    .update({
      access_token: j.access_token,
      expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
    })
    .eq("id", account.id);
  return j.access_token;
}

// (builder de mail importé depuis _shared/email-html.ts)

// ─── Exécution d'une étape pour un run donné ───
async function executeStep(run: any, step: any, prospect: any, ownerProfile: any): Promise<{ ok: boolean; detail: string }> {
  const ctx = {
    first_name: prospect.first_name,
    last_name: prospect.last_name,
    company: prospect.company,
    email: prospect.email,
    sender_name: ownerProfile?.full_name,
    sender_email: ownerProfile?.email,
    agency_name: ownerProfile?.agency_name,
  };

  // ─── EMAIL ───
  if (step.kind === "email") {
    if (!prospect.email) return { ok: false, detail: "Prospect sans email" };

    // Récupère subject + body depuis template OU override
    let subject = step.subject || "";
    let body = step.body || "";
    if (step.template_id) {
      const { data: tpl } = await admin
        .from("email_templates")
        .select("subject, body")
        .eq("id", step.template_id)
        .maybeSingle();
      if (!tpl) return { ok: false, detail: "Template introuvable" };
      subject = tpl.subject;
      body = tpl.body;
    }
    subject = renderTemplate(subject, ctx);
    body = renderTemplate(body, ctx);

    // Récupère compte Gmail du owner
    const { data: account } = await admin
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", run.owner_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!account) return { ok: false, detail: "Aucun compte Gmail connecté pour ce user" };

    const accessToken = await getFreshAccessToken(account);

    // ─── Signature à partir profile + agency ───
    const [{ data: profile }, { data: agency }] = await Promise.all([
      admin.from("profiles").select("full_name, email, phone").eq("id", run.owner_id).maybeSingle(),
      admin.from("agency_settings").select("name, website_url, logo_url").eq("id", true).maybeSingle(),
    ]);
    const sigData: EmailSignatureData = {
      senderName:    profile?.full_name,
      senderEmail:   profile?.email || account.email,
      senderPhone:   profile?.phone,
      agencyName:    agency?.name || "Wyngo",
      agencyWebsite: agency?.website_url,
      agencyLogoUrl: agency?.logo_url,
    };
    const htmlBody = buildEmailHtml(body, sigData);
    const textBody = buildEmailText(body, sigData);
    const raw = buildRawMultipartEmail({
      from: account.email,
      to: prospect.email,
      subject,
      textBody,
      htmlBody,
    });

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    );
    if (!sendRes.ok) {
      return { ok: false, detail: `Gmail send failed: ${await sendRes.text()}` };
    }
    const sent = await sendRes.json();

    // Log dans messages
    await admin.from("messages").insert({
      prospect_id: prospect.id,
      owner_id: run.owner_id,
      channel: "email",
      direction: "outbound",
      subject,
      content: body,
      external_id: sent.id,
      thread_id: sent.threadId,
      from_email: account.email,
      to_email: prospect.email,
      source: "workflow",
      is_read: true,
    });
    return { ok: true, detail: `Email envoyé à ${prospect.email}` };
  }

  // ─── LINKEDIN TASK ou NOTE : crée une note dans l'inbox ───
  if (step.kind === "linkedin_task" || step.kind === "note") {
    const content = renderTemplate(step.body || "", ctx) || (step.kind === "linkedin_task"
      ? `Tâche workflow : envoyer un message LinkedIn à ${prospect.first_name}`
      : `Rappel workflow pour ${prospect.first_name}`);
    await admin.from("messages").insert({
      prospect_id: prospect.id,
      owner_id: run.owner_id,
      channel: step.kind === "linkedin_task" ? "linkedin" : "note",
      direction: "outbound",
      subject: step.subject ? renderTemplate(step.subject, ctx) : null,
      content,
      source: "workflow",
      is_read: false,
    });
    return { ok: true, detail: `${step.kind === "linkedin_task" ? "Tâche LinkedIn" : "Note"} créée` };
  }

  // ─── WAIT ───
  if (step.kind === "wait") {
    return { ok: true, detail: "Attente écoulée" };
  }

  return { ok: false, detail: `Kind inconnu: ${step.kind}` };
}

// ─── Avance un run d'une étape ───
async function advanceRun(run: any): Promise<{ ranSteps: number; finalStatus: string }> {
  // Récupère prospect + owner profile
  const [{ data: prospect }, { data: ownerProfile }] = await Promise.all([
    admin.from("prospects").select("*").eq("id", run.prospect_id).maybeSingle(),
    admin.from("profiles").select("full_name, email").eq("id", run.owner_id).maybeSingle(),
  ]);
  if (!prospect) {
    await admin.from("workflow_runs")
      .update({ status: "errored", last_error: "Prospect introuvable", completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return { ranSteps: 0, finalStatus: "errored" };
  }

  // Récupère toutes les steps du workflow
  const { data: steps } = await admin
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", run.workflow_id)
    .order("position", { ascending: true });
  if (!steps || steps.length === 0) {
    await admin.from("workflow_runs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return { ranSteps: 0, finalStatus: "completed" };
  }

  // Trouve l'index de l'étape courante
  let idx = run.current_step_id
    ? steps.findIndex((s: any) => s.id === run.current_step_id)
    : 0;
  if (idx < 0) idx = 0;

  // Exécute l'étape courante
  const currentStep = steps[idx];
  const result = await executeStep(run, currentStep, prospect, ownerProfile);
  await admin.from("workflow_run_events").insert({
    run_id: run.id,
    step_id: currentStep.id,
    status: result.ok ? "executed" : "error",
    detail: result.detail,
  });

  if (!result.ok) {
    await admin.from("workflow_runs")
      .update({ status: "errored", last_error: result.detail })
      .eq("id", run.id);
    return { ranSteps: 0, finalStatus: "errored" };
  }

  // Passe à l'étape suivante OU complete
  const nextIdx = idx + 1;
  if (nextIdx >= steps.length) {
    await admin.from("workflow_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_step_id: null,
        next_run_at: null,
      })
      .eq("id", run.id);
    return { ranSteps: 1, finalStatus: "completed" };
  }

  const nextStep = steps[nextIdx];
  const delayMs = Math.max(0, Number(nextStep.delay_days) * 86_400_000);
  const nextRunAt = new Date(Date.now() + delayMs).toISOString();
  await admin.from("workflow_runs")
    .update({
      current_step_id: nextStep.id,
      next_run_at: nextRunAt,
      last_error: null,
    })
    .eq("id", run.id);

  return { ranSteps: 1, finalStatus: "running" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Auth : cron secret OU user authentifié
    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = CRON_SECRET && cronSecret === CRON_SECRET;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Non autorisé" }, 401);
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);
    }

    // Optionnel : un body { run_id } pour avancer un run précis (debug / "Avancer maintenant")
    let specificRunId: string | undefined;
    try {
      const body = await req.json();
      specificRunId = body?.run_id;
    } catch { /* pas de body */ }

    let runsQuery = admin
      .from("workflow_runs")
      .select("*")
      .eq("status", "running")
      .lte("next_run_at", new Date().toISOString())
      .limit(50);
    if (specificRunId) {
      runsQuery = admin.from("workflow_runs").select("*").eq("id", specificRunId).limit(1);
    }
    const { data: dueRuns, error: runsErr } = await runsQuery;
    if (runsErr) return json({ error: runsErr.message }, 500);

    const results: any[] = [];
    for (const run of dueRuns || []) {
      try {
        const r = await advanceRun(run);
        results.push({ run_id: run.id, ...r });
      } catch (e) {
        await admin.from("workflow_runs")
          .update({ status: "errored", last_error: String(e) })
          .eq("id", run.id);
        results.push({ run_id: run.id, error: String(e) });
      }
    }

    return json({ processed: results.length, results });
  } catch (e) {
    console.error("[workflow-tick] uncaught", e);
    return json({ error: String(e) }, 500);
  }
});
