/**
 * Parse une adresse française en texte libre vers des champs structurés
 * (rue / code postal / ville), nécessaires pour l'envoi postal.
 *
 * Gère les formats courants venant de Google Places / Pappers :
 *   "12 Rue des Lilas, 69002 Lyon, France"
 *   "12 rue des lilas 69002 Lyon"
 *   "Place du Marché, 33000 Bordeaux"
 */

export type ParsedAddress = {
  address_line: string;
  postal_code: string;
  city: string;
  ok: boolean; // true si on a au moins CP + ville exploitables
};

export function parseFrenchAddress(raw: string | null | undefined): ParsedAddress {
  const empty: ParsedAddress = { address_line: "", postal_code: "", city: "", ok: false };
  if (!raw) return empty;

  // Nettoyage : retire un suffixe "France" et normalise les espaces
  let s = raw.replace(/,?\s*France\s*$/i, "").replace(/\s+/g, " ").trim();
  if (!s) return empty;

  // Cherche le code postal (5 chiffres). Tout ce qui précède = rue,
  // ce qui suit (jusqu'à une virgule) = ville.
  const m = s.match(/^(.*?)[,\s]+(\d{5})\s+([^,]+?)(?:,.*)?$/);
  if (m) {
    return {
      address_line: m[1].replace(/[,\s]+$/, "").trim(),
      postal_code: m[2],
      city: m[3].replace(/[,\s]+$/, "").trim(),
      ok: true,
    };
  }

  // Fallback : juste un CP quelque part
  const cp = s.match(/\b(\d{5})\b/);
  if (cp) {
    const before = s.slice(0, cp.index).replace(/[,\s]+$/, "").trim();
    const after = s.slice((cp.index ?? 0) + 5).replace(/^[,\s]+/, "").split(",")[0].trim();
    return { address_line: before, postal_code: cp[1], city: after, ok: !!after };
  }

  // Aucun CP trouvé → on met tout dans address_line (incomplet)
  return { address_line: s, postal_code: "", city: "", ok: false };
}
