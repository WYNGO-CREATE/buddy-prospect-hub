/**
 * ─── Apollo.io Proxy ───
 *
 * Edge function unique qui sert de pont sécurisé entre le CRM et l'API Apollo.io.
 * La clé API Apollo n'est JAMAIS exposée au front : elle vit dans le secret
 * Supabase `APOLLO_API_KEY` et n'est injectée que côté serveur ici.
 *
 * Actions supportées (champ `action` du body) :
 *   • "test"          → vérifie que la clé est valide (GET /v1/auth/health)
 *   • "search_people" → recherche de personnes
 *   • "enrich_person" → enrichit un contact par email ou linkedin_url
 *
 * Documentation Apollo : https://docs.apollo.io/reference
 */

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

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY");
const APOLLO_BASE = "https://api.apollo.io";

async function callApollo(path: string, method: "GET" | "POST", body?: unknown) {
  if (!APOLLO_API_KEY) {
    throw new Error("APOLLO_API_KEY non configurée dans les secrets Supabase. Ajoute-la via Dashboard → Edge Functions → Secrets.");
  }
  const url = `${APOLLO_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": APOLLO_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `Apollo ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

// ─── Actions ───

async function actionTest() {
  // Endpoint léger qui vérifie juste que la clé est valide
  const data = await callApollo("/v1/auth/health", "GET");
  return { ok: true, apollo: data };
}

async function actionSearchPeople(params: {
  q_keywords?: string;
  person_titles?: string[];
  person_seniorities?: string[];
  organization_locations?: string[];
  organization_industry_tag_ids?: string[];
  organization_num_employees_ranges?: string[];
  q_organization_domains?: string;
  page?: number;
  per_page?: number;
}) {
  // POST /v1/mixed_people/search
  const body: Record<string, unknown> = {
    page: params.page ?? 1,
    per_page: Math.min(params.per_page ?? 25, 100),
  };
  if (params.q_keywords) body.q_keywords = params.q_keywords;
  if (params.person_titles?.length) body.person_titles = params.person_titles;
  if (params.person_seniorities?.length) body.person_seniorities = params.person_seniorities;
  if (params.organization_locations?.length) body.organization_locations = params.organization_locations;
  if (params.organization_num_employees_ranges?.length)
    body.organization_num_employees_ranges = params.organization_num_employees_ranges;
  if (params.q_organization_domains) body.q_organization_domains = params.q_organization_domains;

  const data = await callApollo("/v1/mixed_people/search", "POST", body);

  // Normalise la sortie pour le front
  const people = (data.people || data.contacts || []).map((p: any) => ({
    apollo_id: p.id,
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    name: p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
    title: p.title ?? null,
    email: p.email ?? null,
    email_status: p.email_status ?? null,
    phone: p.phone_numbers?.[0]?.sanitized_number ?? null,
    linkedin_url: p.linkedin_url ?? null,
    photo_url: p.photo_url ?? null,
    seniority: p.seniority ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    country: p.country ?? null,
    organization: p.organization
      ? {
          id: p.organization.id ?? null,
          name: p.organization.name ?? null,
          website: p.organization.website_url ?? null,
          domain: p.organization.primary_domain ?? null,
          industry: p.organization.industry ?? null,
          size: p.organization.estimated_num_employees
            ? String(p.organization.estimated_num_employees)
            : null,
          location: [p.organization.city, p.organization.country].filter(Boolean).join(", ") || null,
        }
      : null,
  }));

  return {
    ok: true,
    people,
    pagination: {
      page: data.pagination?.page ?? params.page ?? 1,
      per_page: data.pagination?.per_page ?? params.per_page ?? 25,
      total_entries: data.pagination?.total_entries ?? people.length,
      total_pages: data.pagination?.total_pages ?? 1,
    },
  };
}

async function actionEnrichPerson(params: {
  email?: string;
  linkedin_url?: string;
  first_name?: string;
  last_name?: string;
  domain?: string;
}) {
  // POST /v1/people/match — révèle l'email/téléphone si l'identification est suffisante
  const body: Record<string, unknown> = { reveal_personal_emails: true };
  if (params.email) body.email = params.email;
  if (params.linkedin_url) body.linkedin_url = params.linkedin_url;
  if (params.first_name) body.first_name = params.first_name;
  if (params.last_name) body.last_name = params.last_name;
  if (params.domain) body.domain = params.domain;

  const data = await callApollo("/v1/people/match", "POST", body);
  const p = data.person ?? data.matched_person ?? data;
  if (!p) return { ok: false, error: "Aucun match Apollo trouvé pour ce contact." };

  return {
    ok: true,
    person: {
      apollo_id: p.id ?? null,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      title: p.title ?? null,
      email: p.email ?? null,
      personal_emails: p.personal_emails ?? [],
      phone: p.phone_numbers?.[0]?.sanitized_number ?? null,
      linkedin_url: p.linkedin_url ?? null,
      photo_url: p.photo_url ?? null,
      seniority: p.seniority ?? null,
      city: p.city ?? null,
      country: p.country ?? null,
      organization: p.organization
        ? {
            name: p.organization.name ?? null,
            website: p.organization.website_url ?? null,
            domain: p.organization.primary_domain ?? null,
            industry: p.organization.industry ?? null,
            size: p.organization.estimated_num_employees
              ? String(p.organization.estimated_num_employees)
              : null,
          }
        : null,
    },
  };
}

// ─── Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (!action) return json({ error: "Champ `action` requis." }, 400);

    switch (action) {
      case "test":
        return json(await actionTest());
      case "search_people":
        return json(await actionSearchPeople(body.params ?? {}));
      case "enrich_person":
        return json(await actionEnrichPerson(body.params ?? {}));
      default:
        return json({ error: `Action inconnue : ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[apollo-proxy] erreur:", msg);
    return json({ error: msg }, 500);
  }
});
