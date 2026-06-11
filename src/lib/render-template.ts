/**
 * Rendu des variables {{prenom}} / {{nom}} / {{entreprise}} / etc.
 * Utilisé par /templates, le Composer inbox et l'éditeur de workflows.
 *
 * IMPORTANT : doit rester en SYNC avec le renderer côté edge function `workflow-tick`.
 */

export type RenderContext = {
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  title?: string | null;
  location?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
  sender_phone?: string | null;
  agency_name?: string | null;
  agency_website?: string | null;
};

/** "Contact" est le placeholder posé par la chasse quand le dirigeant est
 *  inconnu — on ne veut JAMAIS l'afficher comme un vrai prénom. */
function cleanName(v?: string | null): string {
  const s = (v || "").trim();
  if (!s || s.toLowerCase() === "contact") return "";
  return s;
}

const ALIASES: Record<string, (c: RenderContext) => string> = {
  // FR — Prospect
  prenom: (c) => cleanName(c.first_name),
  nom: (c) => c.last_name || "",
  entreprise: (c) => c.company || "",
  email: (c) => c.email || "",
  telephone: (c) => c.phone || "",
  tel: (c) => c.phone || "",
  site: (c) => c.website || "",
  site_web: (c) => c.website || "",
  poste: (c) => c.title || "",
  fonction: (c) => c.title || "",
  ville: (c) => c.location || "",
  localisation: (c) => c.location || "",
  // FR — Expéditeur / agence
  expediteur: (c) => c.sender_name || "",
  email_expediteur: (c) => c.sender_email || "",
  telephone_expediteur: (c) => c.sender_phone || "",
  agence: (c) => c.agency_name || "",
  site_agence: (c) => c.agency_website || "",
  // EN aliases (rétrocompat + commodité)
  first_name: (c) => cleanName(c.first_name),
  last_name: (c) => c.last_name || "",
  company: (c) => c.company || "",
  phone: (c) => c.phone || "",
  website: (c) => c.website || "",
  title: (c) => c.title || "",
  location: (c) => c.location || "",
  sender: (c) => c.sender_name || "",
};

export function renderTemplate(template: string, ctx: RenderContext): string {
  let out = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const fn = ALIASES[key];
    return fn ? fn(ctx) : `{{${key}}}`;
  });
  // Nettoyage des formules de politesse quand le prénom était vide :
  //   "Bonjour ," → "Bonjour,"  ·  "c'est  ," → "c'est,"
  out = out.replace(/\b(Bonjour|Bonsoir|Salut|Coucou|Cher|Chère)\s+,/gi, "$1,");
  // Espaces doubles laissés par une variable vide
  out = out.replace(/[^\S\n]{2,}/g, " ");
  return out;
}

export const AVAILABLE_VARS: Array<{ key: string; label: string }> = [
  // Prospect
  { key: "prenom", label: "Prénom du prospect" },
  { key: "nom", label: "Nom du prospect" },
  { key: "entreprise", label: "Entreprise du prospect" },
  { key: "email", label: "Email du prospect" },
  { key: "telephone", label: "Téléphone du prospect" },
  { key: "site", label: "Site du prospect" },
  { key: "poste", label: "Poste du prospect (Gérant, PDG…)" },
  { key: "ville", label: "Ville / localisation" },
  // Expéditeur
  { key: "expediteur", label: "Votre nom (signature)" },
  { key: "telephone_expediteur", label: "Votre téléphone" },
  { key: "agence", label: "Nom de votre agence" },
  { key: "site_agence", label: "Site de votre agence" },
];
