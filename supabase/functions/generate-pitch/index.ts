/**
 * ─── Generate Pitch — Email cold ultra-personnalisé par prospect ───
 *
 * Pour un prospect donné, génère un email de prospection sur-mesure qui :
 *   1. Mentionne quelque chose de SPÉCIFIQUE sur l'entreprise (analyse de
 *      son site web actuel s'il en a un, ou pointe l'absence du site)
 *   2. Identifie une douleur concrète liée à l'offre Wyngo
 *   3. Pose la valeur Wyngo en réponse à cette douleur
 *   4. Soft CTA (suggestion d'échange de 15 min, pas de "ACHETEZ MAINTENANT")
 *
 * Le but est de passer d'un cold email générique (taux de réponse 1-3%) à
 * un cold email ULTRA-personnalisé (taux de réponse 8-15%).
 *
 * Body POST :
 *   { prospect_id: string }
 *
 * Réponse :
 *   { ok, subject, body, observations[], model }
 *
 * Sécurité : auth par JWT user (le prospect doit appartenir au user qui appelle).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5-20250929";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Récupère un extrait du site du prospect (titre, description, snippets) ───
async function fetchWebsiteSnapshot(url: string): Promise<{
  title: string | null;
  description: string | null;
  excerpt: string | null;
}> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "WyngoBot/1.0 (+https://wyngo.fr)" },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return { title: null, description: null, excerpt: null };
    const html = (await res.text()).slice(0, 30_000);

    const titleMatch = html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i);
    const descMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i) ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i);

    // Texte visible : on retire scripts/styles/balises et on prend 500 chars
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      title: titleMatch?.[1]?.trim() || null,
      description: descMatch?.[1]?.trim() || null,
      excerpt: text.slice(0, 800) || null,
    };
  } catch {
    return { title: null, description: null, excerpt: null };
  }
}

// ─── System prompt qui formate l'IA en copywriter Wyngo expert ───
function buildSystemPrompt(ctx: {
  agencyName: string;
  businessBrief?: string | null;
  targetClient?: string | null;
  valueProps?: string | null;
}): string {
  const hasContext = ctx.businessBrief || ctx.targetClient || ctx.valueProps;

  return `Tu es un copywriter B2B senior en agence française de conseil digital.
Ton seul métier est d'écrire des cold emails ULTRA-personnalisés qui obtiennent une réponse.

═══════════════════════════════════════════════════════════════════════
CONTEXTE — TON AGENCE
═══════════════════════════════════════════════════════════════════════
Nom : ${ctx.agencyName}
${hasContext ? `
${ctx.businessBrief ? `Brief activité :\n${ctx.businessBrief}\n` : ""}${ctx.targetClient ? `Client cible :\n${ctx.targetClient}\n` : ""}${ctx.valueProps ? `Propositions de valeur uniques :\n${ctx.valueProps}\n` : ""}` : "(Aucun contexte d'agence renseigné — utilise ton bon sens pour Wyngo, cabinet de création digitale pour TPE françaises.)"}
═══════════════════════════════════════════════════════════════════════
LES 7 RÈGLES OBLIGATOIRES D'UN COLD EMAIL EXCELLENT
═══════════════════════════════════════════════════════════════════════

1. **Personnalisation RÉELLE en 1ère phrase**
   ❌ "J'espère que vous allez bien."
   ✅ "J'ai vu sur le site de [Entreprise] que vous proposez [détail spécifique]…"

2. **PAS plus de 100 mots**. L'email se lit en 15 secondes max.

3. **Identifie une DOULEUR concrète** liée au statut du site web du prospect :
   • Si statut "no_website" : "vous êtes invisible sur Google → vos concurrents qui ont un site vous prennent vos clients"
   • Si statut "outdated" : "votre site n'est pas mobile-friendly alors que 65% de vos visiteurs sont sur smartphone"
   • Mentionne 1 seul angle, pas 3

4. **Apporte un proof point**
   "On a accompagné [N] [type d'entreprise similaire] qui ont [résultat chiffré]"

5. **CTA soft, pas commercial**
   ❌ "Souhaitez-vous que je vous envoie un devis ?"
   ✅ "Êtes-vous ouvert à 15 minutes d'échange la semaine prochaine pour en discuter ?"
   ou
   ✅ "Je peux vous envoyer une analyse rapide de votre situation si ça vous intéresse — gratuit, sans engagement."

6. **Ton humain, pas commercial**
   ❌ "Notre cabinet d'excellence reconnu propose des solutions innovantes…"
   ✅ "Bonjour M. Martin, je suis Hugo, j'ai créé Wyngo pour aider [profil] à…"

7. **Pas d'emoji, pas de superlatifs, pas de mots déclencheurs spam**
   Bannis : "GRATUIT", "URGENT", "OFFRE EXCLUSIVE", "PROFITEZ", "DÉCOUVREZ".

═══════════════════════════════════════════════════════════════════════
EXIGENCES DE FRANÇAIS NATIF
═══════════════════════════════════════════════════════════════════════

• Pas de calques anglais ("avoir un impact significatif", "à ce stade")
• Pas de langue administrative ("nous serions ravis", "veuillez trouver")
• Pas d'abus du participe présent ("souhaitant", "étant donné que")
• Phrases courtes (max 2 lignes)
• Conjugaisons vivantes, pas de subjonctif imparfait

═══════════════════════════════════════════════════════════════════════
SORTIE
═══════════════════════════════════════════════════════════════════════

Tu dois retourner un JSON avec EXACTEMENT ces champs :
- subject : objet de l'email (max 60 caractères, sans nom du destinataire)
- body : corps de l'email en texte brut, terminant par "Bien cordialement,\n[Prénom signataire]" (utilise {{expediteur}} pour le placeholder)
- observations : tableau des 3-5 observations clés que tu as utilisées pour personnaliser (pour debug)

Le corps doit utiliser ces placeholders :
- {{prenom}} → prénom du destinataire (à utiliser dans la salutation)
- {{expediteur}} → ton prénom à la fin
- {{agence}} → nom de l'agence (à utiliser au moins 1 fois)
- Tu peux référencer {{entreprise}}, {{poste}}, {{ville}} si pertinent

NE confonds JAMAIS expéditeur et destinataire. Le destinataire = le prospect (le dirigeant qu'on prospecte).
`;
}

// ─── User prompt = données spécifiques au prospect ───
function buildUserPrompt(p: {
  company: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  industry?: string | null;
  location?: string | null;
  website_status: string;
  website_score?: number | null;
  website_url?: string | null;
  website_signals?: string[] | null;
  website_title?: string | null;
  website_description?: string | null;
  website_excerpt?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`# PROSPECT À CONTACTER`);
  lines.push(`Entreprise : ${p.company}`);
  if (p.first_name || p.last_name) {
    lines.push(`Dirigeant : ${p.first_name || ""} ${p.last_name || ""}${p.title ? ` (${p.title})` : ""}`);
  }
  if (p.industry) lines.push(`Secteur d'activité : ${p.industry}`);
  if (p.location) lines.push(`Localisation : ${p.location}`);

  lines.push(``);
  lines.push(`# STATUT DU SITE WEB (analyse automatique)`);
  switch (p.website_status) {
    case "no_website":
      lines.push(`❌ AUCUN SITE WEB DÉTECTÉ. C'est notre cible PRIME — ce prospect est invisible sur Google.`);
      lines.push(`Angle email recommandé : la perte de visibilité face aux concurrents qui ont un site.`);
      break;
    case "outdated":
      lines.push(`⚠️ SITE PRÉSENT MAIS OBSOLÈTE (score ${p.website_score}/100).`);
      if (p.website_url) lines.push(`URL : ${p.website_url}`);
      if (p.website_signals?.length) {
        lines.push(`Problèmes détectés :`);
        for (const s of p.website_signals) {
          // Traduction des signaux techniques en langage clair
          if (s === "not_responsive" || s === "partial_viewport") lines.push(`  - Site PAS responsive (mauvaise expérience sur mobile)`);
          if (s === "http_only") lines.push(`  - Pas de HTTPS (Google pénalise + alerte de sécurité dans Chrome)`);
          if (s === "legacy_html_tags") lines.push(`  - Code HTML très ancien (balises <font>, <center>…)`);
          if (s === "table_layout") lines.push(`  - Mise en page en tableaux (technique des années 2000)`);
          if (s.startsWith("copyright_")) {
            const year = s.replace("copyright_", "");
            lines.push(`  - Copyright de ${year} → pas de mise à jour récente`);
          }
          if (s.startsWith("wp_") && s.endsWith("_outdated")) {
            lines.push(`  - Version WordPress obsolète (risque sécurité + bugs)`);
          }
          if (s.startsWith("lastmod_") && s.endsWith("y_ago")) {
            const years = s.match(/lastmod_(\d+)y_ago/)?.[1];
            lines.push(`  - Site pas mis à jour depuis ${years} ans`);
          }
          if (s === "parking_page") lines.push(`  - Page parking (domaine acheté mais pas de vrai site)`);
        }
      }
      lines.push(`Angle email recommandé : moderniser un site qui ne convertit pas / pénalise leur image.`);
      break;
    case "has_website":
      lines.push(`✅ SITE WEB MODERNE détecté (score ${p.website_score}/100). Cible plus difficile.`);
      lines.push(`Angle email recommandé : amélioration continue, SEO, conversion, automation — pas la refonte.`);
      break;
    default:
      lines.push(`❓ Statut du site inconnu.`);
  }

  if (p.website_title || p.website_description || p.website_excerpt) {
    lines.push(``);
    lines.push(`# CONTENU DU SITE (à utiliser pour personnaliser !)`);
    if (p.website_title) lines.push(`Titre page : ${p.website_title}`);
    if (p.website_description) lines.push(`Description meta : ${p.website_description}`);
    if (p.website_excerpt) lines.push(`Extrait page :\n"""\n${p.website_excerpt}\n"""`);
    lines.push(`→ Cherche dans le contenu ci-dessus 1 détail spécifique à mentionner en intro pour montrer que tu as VRAIMENT regardé.`);
  }

  lines.push(``);
  lines.push(`Génère maintenant l'email cold parfait pour ce prospect en respectant LES 7 RÈGLES.`);
  return lines.join("\n");
}

// ─── Provider Gemini (gratuit) ───
async function generateWithGemini(systemPrompt: string, userPrompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.5, // Un peu de créativité pour l'accroche, sans dériver
        maxOutputTokens: 4000,
        thinkingConfig: { thinkingBudget: 1500 },
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body: { type: "string" },
            observations: { type: "array", items: { type: "string" } },
          },
          required: ["subject", "body", "observations"],
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const completion = await res.json();
  const text = completion.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini : pas de texte dans la réponse");
  let parsed: { subject: string; body: string; observations: string[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini : JSON invalide → ${text.slice(0, 200)}`);
  }
  return { result: parsed, model: GEMINI_MODEL };
}

// ─── Provider Anthropic Claude (qualité top, payant) ───
async function generateWithAnthropic(systemPrompt: string, userPrompt: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      temperature: 0.5,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [
        {
          name: "send_pitch",
          description: "Retourne le pitch cold email personnalisé.",
          input_schema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
              observations: { type: "array", items: { type: "string" } },
            },
            required: ["subject", "body", "observations"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "send_pitch" },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const completion = await res.json();
  const toolUse = (completion.content || []).find((c: { type: string }) => c.type === "tool_use") as
    | { input: { subject: string; body: string; observations: string[] } }
    | undefined;
  if (!toolUse?.input) throw new Error("Anthropic : pas de tool_use dans la réponse");
  return { result: toolUse.input, model: ANTHROPIC_MODEL };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
      return json(
        {
          error: "Aucune clé IA configurée",
          hint: "Ajoute GEMINI_API_KEY (gratuit) ou ANTHROPIC_API_KEY dans Supabase Edge Functions Secrets.",
        },
        500,
      );
    }

    // Auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Non authentifié" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const prospectId = body?.prospect_id as string | undefined;
    if (!prospectId) return json({ error: "prospect_id requis" }, 400);

    // Charge le prospect (RLS : check côté DB qu'il appartient à l'user)
    const { data: prospect, error: pErr } = await userClient
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .maybeSingle();
    if (pErr || !prospect) {
      return json({ error: "Prospect introuvable ou non autorisé" }, 404);
    }

    // Charge le contexte agence (via admin, lecture publique mais on évite RLS)
    const { data: agency } = await admin
      .from("agency_settings")
      .select("name, business_brief, target_client, value_props")
      .eq("id", true)
      .maybeSingle();

    // Si le prospect a un site, on en extrait un snapshot pour personnaliser
    let websiteSnapshot: {
      title: string | null;
      description: string | null;
      excerpt: string | null;
    } = { title: null, description: null, excerpt: null };
    if ((prospect as { website?: string | null }).website) {
      websiteSnapshot = await fetchWebsiteSnapshot(
        (prospect as { website: string }).website,
      );
    }

    // Récupère les signaux du website_check stockés (s'ils sont dans le JSON-style)
    // Note : aujourd'hui on ne stocke pas les signaux. On reconstruit à partir
    // du statut + score uniquement. Au futur : ajouter un champ website_signals jsonb.
    const signals: string[] = [];
    const wsStatus = (prospect as { website_status?: string }).website_status || "unknown";
    const wsScore = (prospect as { website_score?: number | null }).website_score;
    if (wsStatus === "outdated" && wsScore !== null && wsScore !== undefined) {
      if (wsScore < 35) signals.push("not_responsive", "http_only");
    }

    const systemPrompt = buildSystemPrompt({
      agencyName: agency?.name || "Wyngo",
      businessBrief: agency?.business_brief,
      targetClient: agency?.target_client,
      valueProps: agency?.value_props,
    });

    const userPrompt = buildUserPrompt({
      company: prospect.company || prospect.last_name || "—",
      first_name: prospect.first_name,
      last_name: prospect.last_name,
      title: (prospect as { title?: string | null }).title,
      industry: (prospect as { industry?: string | null }).industry,
      location: (prospect as { location?: string | null }).location,
      website_status: wsStatus,
      website_score: wsScore,
      website_url: (prospect as { website?: string | null }).website,
      website_signals: signals,
      website_title: websiteSnapshot.title,
      website_description: websiteSnapshot.description,
      website_excerpt: websiteSnapshot.excerpt,
    });

    // ⚠️ Pitch / cold emails : on FORCE Gemini (cheap & largement suffisant
    //    pour les emails), on garde les crédits Anthropic pour l'Aperçu
    //    Instantané où la qualité du copy fait toute la différence.
    //    Anthropic n'est utilisé qu'en dernier recours si Gemini est down.
    let generated;
    if (GEMINI_API_KEY) {
      generated = await generateWithGemini(systemPrompt, userPrompt);
    } else if (ANTHROPIC_API_KEY) {
      generated = await generateWithAnthropic(systemPrompt, userPrompt);
    } else {
      throw new Error("Aucune clé IA configurée");
    }

    // Log léger (non-bloquant)
    void userId;

    return json({
      ok: true,
      subject: generated.result.subject,
      body: generated.result.body,
      observations: generated.result.observations || [],
      model: generated.model,
      website_snapshot_used: !!(websiteSnapshot.title || websiteSnapshot.excerpt),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-pitch]", msg);
    return json({ error: msg }, 500);
  }
});
