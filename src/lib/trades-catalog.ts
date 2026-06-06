/**
 * ─── Catalogue des métiers / corps de métier TPE françaises ──────────────
 *
 * Liste centralisée des secteurs d'activité que Wyngo cible. Utilisée :
 *   • Chasse aux prospects → dropdown des codes NAF (Pappers)
 *   • Détection sector → mapping NAF → thème visuel pour l'Aperçu
 *   • Prompt IA → contextualisation fine de l'activité dans la copy
 *
 * Chaque "trade" représente un métier concret avec :
 *   • naf       : code NAF principal (recherche Pappers)
 *   • label     : nom afichable utilisateur
 *   • category  : regroupement pour le dropdown (optgroup)
 *   • sector    : thème visuel parmi les 6 (palette/typo/vibe de l'Aperçu)
 */

export type VisualSector =
  | "boulangerie"
  | "restaurant"
  | "coiffure"
  | "commerce"
  | "artisan"
  | "service";

export type TradeCategory =
  | "Alimentation & bouche"
  | "Restauration & boissons"
  | "Beauté & bien-être"
  | "Commerce de détail"
  | "Artisanat & bâtiment"
  | "Auto & moto"
  | "Santé & soins"
  | "Sport & loisirs"
  | "Services aux particuliers"
  | "Services aux entreprises"
  | "Immobilier";

export type Trade = {
  id: string;
  label: string;
  naf: string;
  category: TradeCategory;
  sector: VisualSector;
};

export const TRADES: Trade[] = [
  // ─── Alimentation & bouche ───────────────────────────────────────────
  { id: "boulangerie", label: "Boulangerie - Pâtisserie", naf: "10.71B", category: "Alimentation & bouche", sector: "boulangerie" },
  { id: "patisserie", label: "Pâtisserie artisanale", naf: "10.71C", category: "Alimentation & bouche", sector: "boulangerie" },
  { id: "chocolaterie", label: "Chocolaterie - Confiserie", naf: "10.82Z", category: "Alimentation & bouche", sector: "boulangerie" },
  { id: "boucherie", label: "Boucherie - Charcuterie", naf: "47.22Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "poissonnerie", label: "Poissonnerie", naf: "47.23Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "caviste", label: "Caviste - Vins & spiritueux", naf: "47.25Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "epicerie", label: "Épicerie fine - Fromagerie", naf: "47.29Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "traiteur", label: "Traiteur événementiel", naf: "56.21Z", category: "Alimentation & bouche", sector: "restaurant" },
  { id: "primeur", label: "Primeur / Fruits & légumes", naf: "47.21Z", category: "Alimentation & bouche", sector: "commerce" },

  // ─── Restauration & boissons ─────────────────────────────────────────
  { id: "restaurant", label: "Restaurant traditionnel", naf: "56.10A", category: "Restauration & boissons", sector: "restaurant" },
  { id: "fastfood", label: "Restauration rapide", naf: "56.10C", category: "Restauration & boissons", sector: "restaurant" },
  { id: "pizzeria", label: "Pizzeria - Mobile food", naf: "56.10B", category: "Restauration & boissons", sector: "restaurant" },
  { id: "bar_cafe", label: "Bar - Café - Brasserie", naf: "56.30Z", category: "Restauration & boissons", sector: "restaurant" },
  { id: "salon_the", label: "Salon de thé", naf: "56.10C", category: "Restauration & boissons", sector: "restaurant" },

  // ─── Beauté & bien-être ──────────────────────────────────────────────
  { id: "coiffure", label: "Salon de coiffure", naf: "96.02A", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "barbier", label: "Barbier", naf: "96.02A", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "esthetique", label: "Institut de beauté", naf: "96.02B", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "onglerie", label: "Onglerie / Prothésiste ongulaire", naf: "96.02B", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "spa", label: "Spa - Bien-être", naf: "96.04Z", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "tatoueur", label: "Tatoueur - Perceur", naf: "96.09Z", category: "Beauté & bien-être", sector: "coiffure" },

  // ─── Commerce de détail ──────────────────────────────────────────────
  { id: "fleuriste", label: "Fleuriste", naf: "47.76Z", category: "Commerce de détail", sector: "commerce" },
  { id: "librairie", label: "Librairie - Papeterie", naf: "47.61Z", category: "Commerce de détail", sector: "commerce" },
  { id: "bijouterie", label: "Bijouterie - Horlogerie", naf: "47.77Z", category: "Commerce de détail", sector: "commerce" },
  { id: "opticien", label: "Opticien", naf: "47.78A", category: "Commerce de détail", sector: "commerce" },
  { id: "pharmacie", label: "Pharmacie", naf: "47.73Z", category: "Commerce de détail", sector: "service" },
  { id: "vetements", label: "Magasin de vêtements", naf: "47.71Z", category: "Commerce de détail", sector: "commerce" },
  { id: "chaussures", label: "Chaussures", naf: "47.72A", category: "Commerce de détail", sector: "commerce" },
  { id: "maroquinerie", label: "Maroquinerie", naf: "47.72B", category: "Commerce de détail", sector: "commerce" },
  { id: "decoration", label: "Décoration - Ameublement", naf: "47.59B", category: "Commerce de détail", sector: "commerce" },
  { id: "jouets", label: "Jeux et jouets", naf: "47.65Z", category: "Commerce de détail", sector: "commerce" },
  { id: "sport_articles", label: "Articles de sport", naf: "47.63Z", category: "Commerce de détail", sector: "commerce" },
  { id: "parfumerie", label: "Parfumerie - Cosmétiques", naf: "47.75Z", category: "Commerce de détail", sector: "commerce" },
  { id: "informatique", label: "Informatique - Réparation", naf: "47.41Z", category: "Commerce de détail", sector: "commerce" },
  { id: "telephonie", label: "Téléphonie - Multimédia", naf: "47.42Z", category: "Commerce de détail", sector: "commerce" },
  { id: "musique_instruments", label: "Instruments de musique", naf: "47.59A", category: "Commerce de détail", sector: "commerce" },
  { id: "antiquaire", label: "Antiquaire - Brocante", naf: "47.79Z", category: "Commerce de détail", sector: "commerce" },

  // ─── Artisanat & bâtiment ────────────────────────────────────────────
  { id: "plombier", label: "Plombier - Chauffagiste", naf: "43.22A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "electricien", label: "Électricien bâtiment", naf: "43.21A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "climatisation", label: "Climatisation", naf: "43.22B", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "menuisier", label: "Menuisier bois", naf: "43.32A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "carreleur", label: "Carreleur - Revêtements", naf: "43.33Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "peintre", label: "Peintre - Vitrerie", naf: "43.34Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "platrier", label: "Plâtrier", naf: "43.31Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "couvreur", label: "Couvreur - Charpentier", naf: "43.91A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "macon", label: "Maçon - Gros œuvre", naf: "43.99C", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "isolation", label: "Isolation", naf: "43.29A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "paysagiste", label: "Paysagiste - Jardinier", naf: "81.30Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "serrurier", label: "Serrurier - Métallerie", naf: "25.71Z", category: "Artisanat & bâtiment", sector: "artisan" },

  // ─── Auto & moto ─────────────────────────────────────────────────────
  { id: "garage", label: "Garage automobile", naf: "45.20A", category: "Auto & moto", sector: "artisan" },
  { id: "carrosserie", label: "Carrosserie - Peinture auto", naf: "45.20B", category: "Auto & moto", sector: "artisan" },
  { id: "pneus", label: "Centre de pneumatiques", naf: "45.20A", category: "Auto & moto", sector: "artisan" },
  { id: "moto", label: "Vente / réparation moto", naf: "45.40Z", category: "Auto & moto", sector: "artisan" },

  // ─── Santé & soins ───────────────────────────────────────────────────
  { id: "medecin", label: "Médecin généraliste", naf: "86.21Z", category: "Santé & soins", sector: "service" },
  { id: "dentiste", label: "Cabinet dentaire", naf: "86.23Z", category: "Santé & soins", sector: "service" },
  { id: "kine", label: "Kinésithérapie", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "osteo", label: "Ostéopathie", naf: "86.90E", category: "Santé & soins", sector: "service" },
  { id: "veterinaire", label: "Vétérinaire", naf: "75.00Z", category: "Santé & soins", sector: "service" },
  { id: "infirmiere", label: "Infirmière libérale", naf: "86.90D", category: "Santé & soins", sector: "service" },

  // ─── Sport & loisirs ─────────────────────────────────────────────────
  { id: "salle_sport", label: "Salle de sport - Fitness", naf: "93.13Z", category: "Sport & loisirs", sector: "service" },
  { id: "yoga_pilates", label: "Studio yoga / Pilates", naf: "85.51Z", category: "Sport & loisirs", sector: "service" },
  { id: "coach_sportif", label: "Coach sportif", naf: "85.51Z", category: "Sport & loisirs", sector: "service" },
  { id: "danse", label: "École de danse", naf: "85.52Z", category: "Sport & loisirs", sector: "service" },
  { id: "musique_ecole", label: "École de musique", naf: "85.52Z", category: "Sport & loisirs", sector: "service" },
  { id: "auto_ecole", label: "Auto-école", naf: "85.53Z", category: "Sport & loisirs", sector: "service" },

  // ─── Services aux particuliers ───────────────────────────────────────
  { id: "pressing", label: "Pressing - Blanchisserie", naf: "96.01A", category: "Services aux particuliers", sector: "service" },
  { id: "cordonnerie", label: "Cordonnerie - Clés", naf: "95.23Z", category: "Services aux particuliers", sector: "service" },
  { id: "petshop", label: "Animalerie - Toilettage", naf: "47.76Z", category: "Services aux particuliers", sector: "commerce" },
  { id: "photographe", label: "Photographe", naf: "74.20Z", category: "Services aux particuliers", sector: "service" },
  { id: "pompes_funebres", label: "Pompes funèbres", naf: "96.03Z", category: "Services aux particuliers", sector: "service" },

  // ─── Services aux entreprises ────────────────────────────────────────
  { id: "comptable", label: "Expertise comptable", naf: "69.20Z", category: "Services aux entreprises", sector: "service" },
  { id: "avocat", label: "Cabinet d'avocats", naf: "69.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "notaire", label: "Étude notariale", naf: "69.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "conseil", label: "Conseil aux entreprises", naf: "70.22Z", category: "Services aux entreprises", sector: "service" },
  { id: "architecte", label: "Architecte", naf: "71.11Z", category: "Services aux entreprises", sector: "service" },
  { id: "ingenierie", label: "Bureau d'études / Ingénierie", naf: "71.12B", category: "Services aux entreprises", sector: "service" },
  { id: "agence_com", label: "Agence de communication", naf: "73.11Z", category: "Services aux entreprises", sector: "service" },
  { id: "developpeur", label: "Développeur web - Agence digitale", naf: "62.01Z", category: "Services aux entreprises", sector: "service" },
  { id: "graphiste", label: "Graphiste - Designer", naf: "74.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "traducteur", label: "Traduction - Interprétation", naf: "74.30Z", category: "Services aux entreprises", sector: "service" },
  { id: "menage_pro", label: "Nettoyage professionnel", naf: "81.21Z", category: "Services aux entreprises", sector: "service" },

  // ─── Immobilier ──────────────────────────────────────────────────────
  { id: "immobilier_agence", label: "Agence immobilière", naf: "68.31Z", category: "Immobilier", sector: "service" },
  { id: "gestion_immo", label: "Administration de biens", naf: "68.32A", category: "Immobilier", sector: "service" },
  { id: "diagnostiqueur", label: "Diagnostiqueur immobilier", naf: "71.20B", category: "Immobilier", sector: "service" },
];

/** Toutes les catégories dans l'ordre canonique pour les optgroups. */
export const TRADE_CATEGORIES: TradeCategory[] = [
  "Alimentation & bouche",
  "Restauration & boissons",
  "Beauté & bien-être",
  "Commerce de détail",
  "Artisanat & bâtiment",
  "Auto & moto",
  "Santé & soins",
  "Sport & loisirs",
  "Services aux particuliers",
  "Services aux entreprises",
  "Immobilier",
];

/** Map secteur visuel → liste des trades qui l'utilisent. */
export const SECTOR_TO_TRADES: Record<VisualSector, Trade[]> = {
  boulangerie: TRADES.filter((t) => t.sector === "boulangerie"),
  restaurant: TRADES.filter((t) => t.sector === "restaurant"),
  coiffure: TRADES.filter((t) => t.sector === "coiffure"),
  commerce: TRADES.filter((t) => t.sector === "commerce"),
  artisan: TRADES.filter((t) => t.sector === "artisan"),
  service: TRADES.filter((t) => t.sector === "service"),
};

/** Trouve un trade par son code NAF (fuzzy : match préfixe). */
export function findTradeByNaf(naf: string | null | undefined): Trade | null {
  if (!naf) return null;
  const clean = naf.trim().toUpperCase().replace(/\s/g, "");
  const exact = TRADES.find((t) => t.naf.toUpperCase() === clean);
  if (exact) return exact;
  // Fallback préfixe (10.71 matchera 10.71B/C/D)
  const prefix = clean.slice(0, 5);
  return TRADES.find((t) => t.naf.toUpperCase().startsWith(prefix)) || null;
}
