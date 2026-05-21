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
  sender_name?: string | null;
  sender_email?: string | null;
  agency_name?: string | null;
};

const ALIASES: Record<string, (c: RenderContext) => string> = {
  // FR
  prenom: (c) => c.first_name || "",
  nom: (c) => c.last_name || "",
  entreprise: (c) => c.company || "",
  email: (c) => c.email || "",
  expediteur: (c) => c.sender_name || "",
  email_expediteur: (c) => c.sender_email || "",
  agence: (c) => c.agency_name || "",
  // EN aliases
  first_name: (c) => c.first_name || "",
  last_name: (c) => c.last_name || "",
  company: (c) => c.company || "",
  sender: (c) => c.sender_name || "",
};

export function renderTemplate(template: string, ctx: RenderContext): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const fn = ALIASES[key];
    return fn ? fn(ctx) : `{{${key}}}`;
  });
}

export const AVAILABLE_VARS: Array<{ key: string; label: string }> = [
  { key: "prenom", label: "Prénom du prospect" },
  { key: "nom", label: "Nom du prospect" },
  { key: "entreprise", label: "Entreprise du prospect" },
  { key: "email", label: "Email du prospect" },
  { key: "expediteur", label: "Votre nom (signature)" },
  { key: "agence", label: "Nom de votre agence" },
];
