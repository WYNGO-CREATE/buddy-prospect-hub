/**
 * ─── Pappers Search — Recherche TPE françaises ───
 *
 * Pont vers l'API Pappers (https://api.pappers.fr/v2). La clé API vit en
 * secret Supabase (PAPPERS_API_KEY) — jamais exposée au front.
 *
 * Actions supportées (champ `action` du body) :
 *   • "test"      → vérifie que la clé est valide
 *   • "search"    → recherche d'entreprises par activité, ville, effectif…
 *   • "enrich"    → détail d'une entreprise par SIREN (dirigeants, etc.)
 *
 * La réponse "search" est normalisée pour l'UI :
 *   {
 *     entreprises: [
 *       { siret, siren, nom, code_naf, libelle_naf, ville, code_postal,
 *         tranche_effectif, site_web?, dirigeant_principal?, ... }
 *     ],
 *     pagination: { page, par_page, total }
 *   }
 *
 * Doc API : https://www.pappers.fr/api/documentation
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PAPPERS_API_KEY = Deno.env.get("PAPPERS_API_KEY");
const PAPPERS_BASE = "https://api.pappers.fr/v2";

async function callPappers(path: string, params: Record<string, string | number | undefined>) {
  if (!PAPPERS_API_KEY) {
    throw new Error(
      "PAPPERS_API_KEY non configurée dans Supabase Edge Functions Secrets. " +
        "Ajoute-la depuis https://supabase.com/dashboard → ton projet → Edge Functions → Secrets.",
    );
  }

  const url = new URL(`${PAPPERS_BASE}${path}`);
  url.searchParams.set("api_token", PAPPERS_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      (data as { message?: string; error?: string })?.message ||
      (data as { message?: string; error?: string })?.error ||
      `Pappers ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as Record<string, unknown>;
}

// ─── Actions ───

async function actionTest() {
  // L'endpoint "recherche" avec un paramètre minimal sert de health-check
  const data = await callPappers("/recherche", { q: "test", par_page: 1 });
  const total = (data as { total?: number })?.total;
  return { ok: true, pappers_total_sample: total };
}

type PappersEntreprise = {
  siren: string;
  siege?: {
    siret?: string;
    ville?: string;
    code_postal?: string;
    adresse_ligne_1?: string;
  };
  nom_entreprise?: string;
  denomination?: string;
  code_naf?: string;
  libelle_code_naf?: string;
  effectif?: string;
  tranche_effectif?: string;
  site_web?: string;
  email?: string;
  telephone?: string;
  date_creation_formate?: string;
  dirigeants?: Array<{
    nom?: string;
    prenom?: string;
    qualite?: string;
  }>;
  domaine_email?: string;
};

async function actionSearch(params: {
  code_naf?: string;
  ville?: string;
  code_postal?: string;
  tranche_effectif?: string; // "0", "1", "2", "3" (codes Pappers)
  q?: string;
  page?: number;
  par_page?: number;
  with_site_web?: boolean | null; // true = uniquement avec site, false = uniquement sans, null/undef = tous
}) {
  const apiParams: Record<string, string | number | undefined> = {
    code_naf: params.code_naf,
    code_postal: params.code_postal,
    q: params.q,
    page: params.page ?? 1,
    par_page: Math.min(params.par_page ?? 20, 100),
    precision: "exacte",
    bases: "entreprises", // (vs "documents" ou "publications")
  };
  if (params.ville) apiParams["ville"] = params.ville;
  if (params.tranche_effectif) apiParams["tranche_effectif"] = params.tranche_effectif;

  const data = await callPappers("/recherche", apiParams);
  const resultats = (data?.resultats as PappersEntreprise[]) || [];

  const allMapped = resultats.map((r) => {
    const principal = r.dirigeants?.[0];
    return {
      siren: r.siren,
      siret: r.siege?.siret || null,
      nom: r.nom_entreprise || r.denomination || "Sans nom",
      code_naf: r.code_naf || null,
      libelle_naf: r.libelle_code_naf || null,
      ville: r.siege?.ville || null,
      code_postal: r.siege?.code_postal || null,
      adresse: r.siege?.adresse_ligne_1 || null,
      tranche_effectif: r.tranche_effectif || r.effectif || null,
      site_web: r.site_web || null,
      email: r.email || null,
      telephone: r.telephone || null,
      date_creation: r.date_creation_formate || null,
      dirigeant_principal: principal
        ? {
            prenom: principal.prenom || "",
            nom: principal.nom || "",
            qualite: principal.qualite || "",
          }
        : null,
    };
  });

  // ═══ Filtrage défensif côté serveur (Pappers peut hallucinosor) ═══
  // Même si l'API Pappers est censée filtrer, on REJETTE les résultats
  // dont le siege ne matche PAS la ville/CP demandés. Le commercial doit
  // pouvoir cibler une zone géographique de façon 100% fiable.
  function normalizeCity(s: string | null | undefined): string {
    if (!s) return "";
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }
  const requestedVille = normalizeCity(params.ville);
  const requestedCp = (params.code_postal || "").trim();

  const filtered = allMapped.filter((e) => {
    if (requestedVille) {
      const eVille = normalizeCity(e.ville);
      if (!eVille || !eVille.includes(requestedVille)) return false;
    }
    if (requestedCp) {
      const eCp = (e.code_postal || "").trim();
      // Le CP de l'entreprise doit COMMENCER par le CP demandé
      // (31000 demandé → 31000 OK, 31100 KO ; 75 demandé → 75001 OK)
      if (!eCp || !eCp.startsWith(requestedCp)) return false;
    }
    return true;
  });

  const rejected = allMapped.length - filtered.length;

  return {
    ok: true,
    entreprises: filtered,
    pagination: {
      page: (data?.page as number) || params.page || 1,
      par_page: (data?.par_page as number) || params.par_page || 20,
      total: (data?.total as number) || filtered.length,
    },
    // Diagnostic pour debug — visible dans le toast côté UI si rejets
    rejected_out_of_zone: rejected,
  };
}

async function actionEnrich(params: { siren: string }) {
  if (!params.siren) throw new Error("siren requis");
  const data = await callPappers("/entreprise", { siren: params.siren });
  return { ok: true, entreprise: data };
}

// ─── Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    if (!action) return json({ error: "Champ `action` requis" }, 400);

    switch (action) {
      case "test":
        return json(await actionTest());
      case "search":
        return json(await actionSearch(body.params || {}));
      case "enrich":
        return json(await actionEnrich(body.params || {}));
      default:
        return json({ error: `Action inconnue : ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pappers-search]", msg);
    return json({ error: msg }, 500);
  }
});
