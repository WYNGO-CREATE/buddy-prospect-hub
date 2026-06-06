/**
 * ─── Catalogue des corps de métier TPE françaises ────────────────────────
 *
 * Liste exhaustive (~160 trades) des secteurs d'activité que Wyngo cible.
 * Utilisée pour :
 *   • Chasse aux prospects → dropdown des codes NAF (Pappers)
 *   • Détection sector → mapping NAF → thème visuel pour l'Aperçu
 *   • Prompt IA → contextualisation fine de l'activité dans la copy
 *
 * Chaque "trade" :
 *   • id       : identifiant interne stable
 *   • label    : nom afichable utilisateur
 *   • naf      : code NAF INSEE pour Pappers
 *   • category : regroupement pour le dropdown (optgroup)
 *   • sector   : un des 6 thèmes visuels pour l'Aperçu Instantané
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
  | "Mode & textile"
  | "Artisanat & bâtiment"
  | "Artisanat d'art"
  | "Auto & moto"
  | "Santé & soins"
  | "Sport & loisirs"
  | "Tourisme & hébergement"
  | "Services aux particuliers"
  | "Services aux entreprises"
  | "Numérique & tech"
  | "Immobilier"
  | "Agriculture & production"
  | "Animaux";

export type Trade = {
  id: string;
  label: string;
  naf: string;
  category: TradeCategory;
  sector: VisualSector;
};

export const TRADES: Trade[] = [
  // ════════════════════════════════════════════════════════════════════
  // ALIMENTATION & BOUCHE
  // ════════════════════════════════════════════════════════════════════
  { id: "boulangerie", label: "Boulangerie - Pâtisserie", naf: "10.71B", category: "Alimentation & bouche", sector: "boulangerie" },
  { id: "patisserie", label: "Pâtisserie artisanale", naf: "10.71C", category: "Alimentation & bouche", sector: "boulangerie" },
  { id: "chocolaterie", label: "Chocolaterie - Confiserie", naf: "10.82Z", category: "Alimentation & bouche", sector: "boulangerie" },
  { id: "glacier", label: "Glacier - Fabricant de glaces", naf: "10.52Z", category: "Alimentation & bouche", sector: "boulangerie" },
  { id: "torrefacteur", label: "Torréfacteur - Café artisanal", naf: "10.83Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "boucherie", label: "Boucherie - Charcuterie", naf: "47.22Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "poissonnerie", label: "Poissonnerie", naf: "47.23Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "fromagerie", label: "Fromagerie - Crémerie", naf: "47.29Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "caviste", label: "Caviste - Vins & spiritueux", naf: "47.25Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "epicerie", label: "Épicerie fine", naf: "47.29Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "epicerie_bio", label: "Magasin bio / vrac", naf: "47.21Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "traiteur", label: "Traiteur événementiel", naf: "56.21Z", category: "Alimentation & bouche", sector: "restaurant" },
  { id: "primeur", label: "Primeur / Fruits & légumes", naf: "47.21Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "brasserie_artisanale", label: "Brasserie artisanale (bière)", naf: "11.05Z", category: "Alimentation & bouche", sector: "restaurant" },
  { id: "distillerie", label: "Distillerie artisanale", naf: "11.01Z", category: "Alimentation & bouche", sector: "commerce" },
  { id: "conserverie", label: "Conserverie artisanale", naf: "10.39B", category: "Alimentation & bouche", sector: "commerce" },
  { id: "huilerie", label: "Huilerie artisanale", naf: "10.41B", category: "Alimentation & bouche", sector: "commerce" },
  { id: "tabac_presse", label: "Tabac - Presse - Loto", naf: "47.26Z", category: "Alimentation & bouche", sector: "commerce" },

  // ════════════════════════════════════════════════════════════════════
  // RESTAURATION & BOISSONS
  // ════════════════════════════════════════════════════════════════════
  { id: "restaurant", label: "Restaurant traditionnel", naf: "56.10A", category: "Restauration & boissons", sector: "restaurant" },
  { id: "restaurant_gastro", label: "Restaurant gastronomique", naf: "56.10A", category: "Restauration & boissons", sector: "restaurant" },
  { id: "fastfood", label: "Restauration rapide", naf: "56.10C", category: "Restauration & boissons", sector: "restaurant" },
  { id: "pizzeria", label: "Pizzeria", naf: "56.10B", category: "Restauration & boissons", sector: "restaurant" },
  { id: "creperie", label: "Crêperie", naf: "56.10C", category: "Restauration & boissons", sector: "restaurant" },
  { id: "food_truck", label: "Food truck - Cuisine mobile", naf: "56.10C", category: "Restauration & boissons", sector: "restaurant" },
  { id: "sandwicherie", label: "Sandwicherie - Snacking", naf: "56.10C", category: "Restauration & boissons", sector: "restaurant" },
  { id: "bar_cafe", label: "Bar - Café - Brasserie", naf: "56.30Z", category: "Restauration & boissons", sector: "restaurant" },
  { id: "salon_the", label: "Salon de thé - Coffee shop", naf: "56.30Z", category: "Restauration & boissons", sector: "restaurant" },
  { id: "bar_vin", label: "Bar à vin", naf: "56.30Z", category: "Restauration & boissons", sector: "restaurant" },
  { id: "bar_cocktails", label: "Bar à cocktails - Speakeasy", naf: "56.30Z", category: "Restauration & boissons", sector: "restaurant" },
  { id: "pub", label: "Pub - Brasserie irlandaise", naf: "56.30Z", category: "Restauration & boissons", sector: "restaurant" },
  { id: "club_discotheque", label: "Discothèque - Club", naf: "56.30Z", category: "Restauration & boissons", sector: "restaurant" },
  { id: "kebab_oriental", label: "Kebab - Cuisine orientale", naf: "56.10C", category: "Restauration & boissons", sector: "restaurant" },
  { id: "sushi", label: "Restaurant japonais - Sushi", naf: "56.10A", category: "Restauration & boissons", sector: "restaurant" },

  // ════════════════════════════════════════════════════════════════════
  // BEAUTÉ & BIEN-ÊTRE
  // ════════════════════════════════════════════════════════════════════
  { id: "coiffure", label: "Salon de coiffure", naf: "96.02A", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "barbier", label: "Barbier - Barbershop", naf: "96.02A", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "esthetique", label: "Institut de beauté", naf: "96.02B", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "onglerie", label: "Onglerie - Prothésiste ongulaire", naf: "96.02B", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "spa", label: "Spa - Centre bien-être", naf: "96.04Z", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "hammam", label: "Hammam - Sauna", naf: "96.04Z", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "massage", label: "Centre de massages", naf: "96.04Z", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "bronzage", label: "Centre de bronzage - UV", naf: "96.04Z", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "epilation_laser", label: "Centre d'épilation laser", naf: "96.02B", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "maquilleur", label: "Maquilleur professionnel", naf: "96.02B", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "maquillage_permanent", label: "Maquillage permanent / Dermographie", naf: "96.02B", category: "Beauté & bien-être", sector: "coiffure" },
  { id: "tatoueur", label: "Tatoueur - Perceur", naf: "96.09Z", category: "Beauté & bien-être", sector: "coiffure" },

  // ════════════════════════════════════════════════════════════════════
  // COMMERCE DE DÉTAIL
  // ════════════════════════════════════════════════════════════════════
  { id: "fleuriste", label: "Fleuriste", naf: "47.76Z", category: "Commerce de détail", sector: "commerce" },
  { id: "librairie", label: "Librairie - Papeterie", naf: "47.61Z", category: "Commerce de détail", sector: "commerce" },
  { id: "bijouterie", label: "Bijouterie - Horlogerie", naf: "47.77Z", category: "Commerce de détail", sector: "commerce" },
  { id: "opticien", label: "Opticien", naf: "47.78A", category: "Commerce de détail", sector: "commerce" },
  { id: "pharmacie", label: "Pharmacie", naf: "47.73Z", category: "Commerce de détail", sector: "service" },
  { id: "decoration", label: "Décoration - Ameublement", naf: "47.59B", category: "Commerce de détail", sector: "commerce" },
  { id: "meubles", label: "Magasin de meubles", naf: "47.59A", category: "Commerce de détail", sector: "commerce" },
  { id: "cuisiniste", label: "Cuisiniste - Vente de cuisines", naf: "47.59A", category: "Commerce de détail", sector: "commerce" },
  { id: "salle_bain_equipement", label: "Salle de bain - Équipement", naf: "47.52B", category: "Commerce de détail", sector: "commerce" },
  { id: "poeles_cheminees", label: "Poêles & cheminées", naf: "47.52B", category: "Commerce de détail", sector: "commerce" },
  { id: "luminaires", label: "Magasin de luminaires", naf: "47.59B", category: "Commerce de détail", sector: "commerce" },
  { id: "jouets", label: "Jeux & jouets", naf: "47.65Z", category: "Commerce de détail", sector: "commerce" },
  { id: "sport_articles", label: "Articles de sport", naf: "47.64Z", category: "Commerce de détail", sector: "commerce" },
  { id: "magasin_cycles", label: "Magasin de cycles - Vélos", naf: "47.64Z", category: "Commerce de détail", sector: "commerce" },
  { id: "magasin_peche", label: "Magasin de pêche", naf: "47.64Z", category: "Commerce de détail", sector: "commerce" },
  { id: "magasin_chasse", label: "Armurerie - Magasin de chasse", naf: "47.78C", category: "Commerce de détail", sector: "commerce" },
  { id: "parfumerie", label: "Parfumerie - Cosmétiques", naf: "47.75Z", category: "Commerce de détail", sector: "commerce" },
  { id: "informatique", label: "Informatique - Réparation", naf: "47.41Z", category: "Commerce de détail", sector: "commerce" },
  { id: "telephonie", label: "Téléphonie - Multimédia", naf: "47.42Z", category: "Commerce de détail", sector: "commerce" },
  { id: "electromenager", label: "Électroménager", naf: "47.54Z", category: "Commerce de détail", sector: "commerce" },
  { id: "musique_instruments", label: "Instruments de musique", naf: "47.59A", category: "Commerce de détail", sector: "commerce" },
  { id: "antiquaire", label: "Antiquaire - Brocante", naf: "47.79Z", category: "Commerce de détail", sector: "commerce" },
  { id: "friperie", label: "Friperie - Dépôt-vente", naf: "47.79Z", category: "Commerce de détail", sector: "commerce" },
  { id: "concession_auto", label: "Concession automobile", naf: "45.11Z", category: "Commerce de détail", sector: "commerce" },
  { id: "magasin_velo_elec", label: "Magasin de vélos électriques", naf: "47.64Z", category: "Commerce de détail", sector: "commerce" },

  // ════════════════════════════════════════════════════════════════════
  // MODE & TEXTILE
  // ════════════════════════════════════════════════════════════════════
  { id: "vetements", label: "Magasin de vêtements", naf: "47.71Z", category: "Mode & textile", sector: "commerce" },
  { id: "chaussures", label: "Magasin de chaussures", naf: "47.72A", category: "Mode & textile", sector: "commerce" },
  { id: "maroquinerie", label: "Maroquinerie", naf: "47.72B", category: "Mode & textile", sector: "commerce" },
  { id: "lingerie", label: "Lingerie - Sous-vêtements", naf: "47.71Z", category: "Mode & textile", sector: "commerce" },
  { id: "styliste", label: "Créateur de mode - Styliste", naf: "14.13Z", category: "Mode & textile", sector: "commerce" },
  { id: "atelier_couture", label: "Atelier de couture sur mesure", naf: "14.13Z", category: "Mode & textile", sector: "artisan" },
  { id: "tissus", label: "Magasin de tissus - Mercerie", naf: "47.51Z", category: "Mode & textile", sector: "commerce" },

  // ════════════════════════════════════════════════════════════════════
  // ARTISANAT & BÂTIMENT
  // ════════════════════════════════════════════════════════════════════
  { id: "plombier", label: "Plombier - Chauffagiste", naf: "43.22A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "electricien", label: "Électricien bâtiment", naf: "43.21A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "climatisation", label: "Climatisation - Pompe à chaleur", naf: "43.22B", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "menuisier", label: "Menuisier bois", naf: "43.32A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "menuisier_alu", label: "Menuisier alu / PVC", naf: "43.32B", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "carreleur", label: "Carreleur - Revêtements", naf: "43.33Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "peintre", label: "Peintre - Décorateur", naf: "43.34Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "vitrier", label: "Vitrier - Miroitier", naf: "43.34Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "platrier", label: "Plâtrier - Plaquiste", naf: "43.31Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "couvreur", label: "Couvreur - Charpentier", naf: "43.91A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "zinguerie", label: "Zinguerie - Étanchéité toit", naf: "43.91B", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "macon", label: "Maçon - Gros œuvre", naf: "43.99C", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "isolation", label: "Isolation - ITE / ITI", naf: "43.29A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "facade_ravalement", label: "Façadier - Ravalement", naf: "43.99B", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "paysagiste", label: "Paysagiste - Jardinier", naf: "81.30Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "elagueur", label: "Élagueur - Cordiste", naf: "81.30Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "serrurier", label: "Serrurier - Métallerie", naf: "25.71Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "storiste", label: "Storiste - Stores - Volets", naf: "43.34Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "constructeur_maisons", label: "Constructeur de maisons", naf: "41.20A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "piscines", label: "Constructeur de piscines", naf: "43.99B", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "amenagement_combles", label: "Aménagement combles - Extension", naf: "43.32A", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "terrassement", label: "Terrassement - VRD", naf: "43.12B", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "demolition", label: "Démolition", naf: "43.11Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "desinsectisation", label: "Désinsectisation - Nuisibles", naf: "81.29Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "ramoneur", label: "Ramoneur - Fumisterie", naf: "81.22Z", category: "Artisanat & bâtiment", sector: "artisan" },
  { id: "energies_renouvelables", label: "Énergies renouvelables - Solaire", naf: "43.22B", category: "Artisanat & bâtiment", sector: "artisan" },

  // ════════════════════════════════════════════════════════════════════
  // ARTISANAT D'ART
  // ════════════════════════════════════════════════════════════════════
  { id: "horloger", label: "Horloger - Réparation", naf: "95.25Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "luthier", label: "Luthier - Réparation d'instruments", naf: "32.20Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "ebeniste", label: "Ébéniste", naf: "31.09A", category: "Artisanat d'art", sector: "artisan" },
  { id: "tapissier", label: "Tapissier d'ameublement", naf: "13.92Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "ferronnier_art", label: "Ferronnier d'art", naf: "25.99B", category: "Artisanat d'art", sector: "artisan" },
  { id: "vitrailliste", label: "Vitrailliste - Maître verrier", naf: "23.19Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "ceramiste_potier", label: "Céramiste - Potier", naf: "23.41Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "marbrier", label: "Marbrier - Sculpteur sur pierre", naf: "23.70Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "forgeron", label: "Forgeron - Coutelier", naf: "25.50A", category: "Artisanat d'art", sector: "artisan" },
  { id: "bijoutier_createur", label: "Bijoutier-créateur", naf: "32.12Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "restaurateur_oeuvres", label: "Restaurateur d'œuvres d'art", naf: "90.03B", category: "Artisanat d'art", sector: "artisan" },
  { id: "relieur", label: "Relieur - Doreur", naf: "18.14Z", category: "Artisanat d'art", sector: "artisan" },
  { id: "encadreur", label: "Encadreur d'art", naf: "47.78B", category: "Artisanat d'art", sector: "commerce" },

  // ════════════════════════════════════════════════════════════════════
  // AUTO & MOTO
  // ════════════════════════════════════════════════════════════════════
  { id: "garage", label: "Garage automobile", naf: "45.20A", category: "Auto & moto", sector: "artisan" },
  { id: "carrosserie", label: "Carrosserie - Peinture auto", naf: "45.20B", category: "Auto & moto", sector: "artisan" },
  { id: "pneus", label: "Centre pneumatiques", naf: "45.20A", category: "Auto & moto", sector: "artisan" },
  { id: "lavage_auto", label: "Lavage auto - Detailing", naf: "45.20A", category: "Auto & moto", sector: "artisan" },
  { id: "moto_garage", label: "Vente / Réparation moto", naf: "45.40Z", category: "Auto & moto", sector: "artisan" },
  { id: "depannage_remorquage", label: "Dépannage - Remorquage", naf: "52.21Z", category: "Auto & moto", sector: "artisan" },
  { id: "voitures_occasion", label: "Vente voitures d'occasion", naf: "45.11Z", category: "Auto & moto", sector: "commerce" },
  { id: "location_voitures", label: "Location de voitures", naf: "77.11A", category: "Auto & moto", sector: "service" },
  { id: "vitrage_auto", label: "Vitrage auto - Pare-brise", naf: "45.20A", category: "Auto & moto", sector: "artisan" },
  { id: "controle_technique", label: "Contrôle technique", naf: "71.20A", category: "Auto & moto", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // SANTÉ & SOINS
  // ════════════════════════════════════════════════════════════════════
  { id: "medecin", label: "Médecin généraliste", naf: "86.21Z", category: "Santé & soins", sector: "service" },
  { id: "pediatre", label: "Pédiatre", naf: "86.22A", category: "Santé & soins", sector: "service" },
  { id: "dentiste", label: "Cabinet dentaire", naf: "86.23Z", category: "Santé & soins", sector: "service" },
  { id: "orthodontiste", label: "Orthodontiste", naf: "86.23Z", category: "Santé & soins", sector: "service" },
  { id: "kine", label: "Kinésithérapeute", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "osteo", label: "Ostéopathe", naf: "86.90E", category: "Santé & soins", sector: "service" },
  { id: "podologue", label: "Podologue - Pédicure", naf: "86.90C", category: "Santé & soins", sector: "service" },
  { id: "veterinaire", label: "Vétérinaire", naf: "75.00Z", category: "Santé & soins", sector: "service" },
  { id: "infirmiere", label: "Infirmier(ère) libéral(e)", naf: "86.90D", category: "Santé & soins", sector: "service" },
  { id: "sage_femme", label: "Sage-femme libérale", naf: "86.90D", category: "Santé & soins", sector: "service" },
  { id: "audioprothesiste", label: "Audioprothésiste", naf: "47.74Z", category: "Santé & soins", sector: "service" },
  { id: "dieteticien", label: "Diététicien - Nutritionniste", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "psychologue", label: "Psychologue libéral", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "psychomotricien", label: "Psychomotricien", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "ergotherapeute", label: "Ergothérapeute", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "orthophoniste", label: "Orthophoniste", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "sophrologue", label: "Sophrologue", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "naturopathe", label: "Naturopathe", naf: "86.90F", category: "Santé & soins", sector: "service" },
  { id: "hypnotherapeute", label: "Hypnothérapeute", naf: "86.90F", category: "Santé & soins", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // SPORT & LOISIRS
  // ════════════════════════════════════════════════════════════════════
  { id: "salle_sport", label: "Salle de sport - Fitness", naf: "93.13Z", category: "Sport & loisirs", sector: "service" },
  { id: "crossfit", label: "Box CrossFit", naf: "93.13Z", category: "Sport & loisirs", sector: "service" },
  { id: "yoga_pilates", label: "Studio yoga / Pilates", naf: "85.51Z", category: "Sport & loisirs", sector: "service" },
  { id: "coach_sportif", label: "Coach sportif personnel", naf: "85.51Z", category: "Sport & loisirs", sector: "service" },
  { id: "boxe_arts_martiaux", label: "Boxe - Arts martiaux", naf: "93.13Z", category: "Sport & loisirs", sector: "service" },
  { id: "escalade_salle", label: "Salle d'escalade", naf: "93.13Z", category: "Sport & loisirs", sector: "service" },
  { id: "tennis_club", label: "Club de tennis", naf: "93.12Z", category: "Sport & loisirs", sector: "service" },
  { id: "golf_club", label: "Club / Practice de golf", naf: "93.12Z", category: "Sport & loisirs", sector: "service" },
  { id: "equitation", label: "Centre équestre - Manège", naf: "93.19Z", category: "Sport & loisirs", sector: "service" },
  { id: "danse", label: "École de danse", naf: "85.52Z", category: "Sport & loisirs", sector: "service" },
  { id: "musique_ecole", label: "École de musique", naf: "85.52Z", category: "Sport & loisirs", sector: "service" },
  { id: "ecole_natation", label: "École de natation", naf: "85.51Z", category: "Sport & loisirs", sector: "service" },
  { id: "ecole_ski", label: "École de ski - Moniteur", naf: "85.51Z", category: "Sport & loisirs", sector: "service" },
  { id: "auto_ecole", label: "Auto-école", naf: "85.53Z", category: "Sport & loisirs", sector: "service" },
  { id: "bowling", label: "Bowling", naf: "93.29Z", category: "Sport & loisirs", sector: "service" },
  { id: "laser_game", label: "Laser game - Quasar", naf: "93.29Z", category: "Sport & loisirs", sector: "service" },
  { id: "escape_game", label: "Escape game", naf: "93.29Z", category: "Sport & loisirs", sector: "service" },
  { id: "karting", label: "Karting", naf: "93.29Z", category: "Sport & loisirs", sector: "service" },
  { id: "paintball", label: "Paintball - Airsoft", naf: "93.29Z", category: "Sport & loisirs", sector: "service" },
  { id: "cinema_local", label: "Cinéma indépendant", naf: "59.14Z", category: "Sport & loisirs", sector: "service" },
  { id: "theatre_salle", label: "Théâtre - Salle de spectacle", naf: "90.04Z", category: "Sport & loisirs", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // TOURISME & HÉBERGEMENT
  // ════════════════════════════════════════════════════════════════════
  { id: "hotel", label: "Hôtel", naf: "55.10Z", category: "Tourisme & hébergement", sector: "restaurant" },
  { id: "hotel_charme", label: "Hôtel de charme - Boutique-hôtel", naf: "55.10Z", category: "Tourisme & hébergement", sector: "restaurant" },
  { id: "chambres_hotes", label: "Chambres d'hôtes", naf: "55.20Z", category: "Tourisme & hébergement", sector: "restaurant" },
  { id: "gite", label: "Gîte rural", naf: "55.20Z", category: "Tourisme & hébergement", sector: "restaurant" },
  { id: "camping", label: "Camping - Glamping", naf: "55.30Z", category: "Tourisme & hébergement", sector: "restaurant" },
  { id: "meubles_tourisme", label: "Location meublés tourisme", naf: "55.20Z", category: "Tourisme & hébergement", sector: "service" },
  { id: "agence_voyage", label: "Agence de voyage", naf: "79.11Z", category: "Tourisme & hébergement", sector: "service" },
  { id: "tour_operator", label: "Tour-opérateur", naf: "79.12Z", category: "Tourisme & hébergement", sector: "service" },
  { id: "guide_touristique", label: "Guide touristique - Excursion", naf: "79.90Z", category: "Tourisme & hébergement", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // SERVICES AUX PARTICULIERS
  // ════════════════════════════════════════════════════════════════════
  { id: "pressing", label: "Pressing - Blanchisserie", naf: "96.01A", category: "Services aux particuliers", sector: "service" },
  { id: "cordonnerie", label: "Cordonnerie - Clés - Imprimerie minute", naf: "95.23Z", category: "Services aux particuliers", sector: "service" },
  { id: "couturière", label: "Retouches - Couturière", naf: "95.29Z", category: "Services aux particuliers", sector: "service" },
  { id: "photographe", label: "Photographe (portrait, mariage)", naf: "74.20Z", category: "Services aux particuliers", sector: "service" },
  { id: "pompes_funebres", label: "Pompes funèbres", naf: "96.03Z", category: "Services aux particuliers", sector: "service" },
  { id: "aide_domicile", label: "Aide à domicile - Auxiliaire de vie", naf: "88.10A", category: "Services aux particuliers", sector: "service" },
  { id: "garde_enfants", label: "Garde d'enfants - Crèche privée", naf: "88.91A", category: "Services aux particuliers", sector: "service" },
  { id: "soutien_scolaire", label: "Soutien scolaire - Cours particuliers", naf: "85.60Z", category: "Services aux particuliers", sector: "service" },
  { id: "coach_vie", label: "Coach de vie - Life coach", naf: "85.59B", category: "Services aux particuliers", sector: "service" },
  { id: "mediateur_familial", label: "Médiateur familial", naf: "88.99B", category: "Services aux particuliers", sector: "service" },
  { id: "voyance", label: "Voyance - Astrologie", naf: "96.09Z", category: "Services aux particuliers", sector: "service" },
  { id: "wedding_planner", label: "Wedding planner", naf: "74.90B", category: "Services aux particuliers", sector: "service" },
  { id: "evenementiel_particulier", label: "Organisation événements particuliers", naf: "82.30Z", category: "Services aux particuliers", sector: "service" },
  { id: "demenageur", label: "Déménageur", naf: "49.42Z", category: "Services aux particuliers", sector: "service" },
  { id: "garde_meubles", label: "Garde-meubles - Stockage", naf: "52.10B", category: "Services aux particuliers", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // SERVICES AUX ENTREPRISES
  // ════════════════════════════════════════════════════════════════════
  { id: "comptable", label: "Expertise comptable", naf: "69.20Z", category: "Services aux entreprises", sector: "service" },
  { id: "avocat", label: "Cabinet d'avocats", naf: "69.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "notaire", label: "Étude notariale", naf: "69.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "huissier", label: "Huissier de justice", naf: "69.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "commissaire_comptes", label: "Commissaire aux comptes", naf: "69.20Z", category: "Services aux entreprises", sector: "service" },
  { id: "conseil", label: "Conseil aux entreprises", naf: "70.22Z", category: "Services aux entreprises", sector: "service" },
  { id: "coach_business", label: "Coach business / professionnel", naf: "70.22Z", category: "Services aux entreprises", sector: "service" },
  { id: "consultant_strategie", label: "Consultant stratégie", naf: "70.22Z", category: "Services aux entreprises", sector: "service" },
  { id: "architecte", label: "Architecte DPLG", naf: "71.11Z", category: "Services aux entreprises", sector: "service" },
  { id: "architecte_interieur", label: "Architecte d'intérieur", naf: "71.11Z", category: "Services aux entreprises", sector: "service" },
  { id: "decorateur", label: "Décorateur d'intérieur - Home stager", naf: "74.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "ingenierie", label: "Bureau d'études - Ingénierie", naf: "71.12B", category: "Services aux entreprises", sector: "service" },
  { id: "diagnostic_thermique", label: "Diagnostic thermique - DPE", naf: "71.20B", category: "Services aux entreprises", sector: "service" },
  { id: "geometre", label: "Géomètre-expert", naf: "71.12A", category: "Services aux entreprises", sector: "service" },
  { id: "agence_com", label: "Agence de communication", naf: "73.11Z", category: "Services aux entreprises", sector: "service" },
  { id: "graphiste", label: "Graphiste - Designer", naf: "74.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "traducteur", label: "Traducteur - Interprète", naf: "74.30Z", category: "Services aux entreprises", sector: "service" },
  { id: "imprimerie", label: "Imprimerie - Reprographie", naf: "18.12Z", category: "Services aux entreprises", sector: "service" },
  { id: "videaste_pro", label: "Vidéaste - Films d'entreprise", naf: "59.11C", category: "Services aux entreprises", sector: "service" },
  { id: "drone_pilote", label: "Pilote de drone professionnel", naf: "74.90B", category: "Services aux entreprises", sector: "service" },
  { id: "menage_pro", label: "Nettoyage professionnel", naf: "81.21Z", category: "Services aux entreprises", sector: "service" },
  { id: "securite_privee", label: "Sécurité privée - Gardiennage", naf: "80.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "telesurveillance", label: "Télésurveillance - Alarme", naf: "80.20Z", category: "Services aux entreprises", sector: "service" },
  { id: "rh_recrutement", label: "Cabinet RH - Recrutement", naf: "78.10Z", category: "Services aux entreprises", sector: "service" },
  { id: "interim", label: "Agence d'intérim", naf: "78.20Z", category: "Services aux entreprises", sector: "service" },
  { id: "formation_pro", label: "Organisme de formation professionnelle", naf: "85.59A", category: "Services aux entreprises", sector: "service" },
  { id: "courtier_assurance", label: "Courtier en assurance", naf: "66.22Z", category: "Services aux entreprises", sector: "service" },
  { id: "courtier_credit", label: "Courtier en crédit / Mortgage", naf: "66.19A", category: "Services aux entreprises", sector: "service" },
  { id: "conseil_patrimoine", label: "Conseiller en gestion de patrimoine", naf: "66.22Z", category: "Services aux entreprises", sector: "service" },
  { id: "logistique", label: "Logistique - Transport", naf: "52.29B", category: "Services aux entreprises", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // NUMÉRIQUE & TECH
  // ════════════════════════════════════════════════════════════════════
  { id: "developpeur_web", label: "Développeur web - Agence digitale", naf: "62.01Z", category: "Numérique & tech", sector: "service" },
  { id: "agence_seo", label: "Agence SEO / SEA", naf: "73.11Z", category: "Numérique & tech", sector: "service" },
  { id: "community_manager", label: "Community manager freelance", naf: "73.11Z", category: "Numérique & tech", sector: "service" },
  { id: "redacteur_web", label: "Rédacteur web - Copywriter", naf: "90.03B", category: "Numérique & tech", sector: "service" },
  { id: "ux_ui_designer", label: "UX / UI designer", naf: "74.10Z", category: "Numérique & tech", sector: "service" },
  { id: "motion_designer", label: "Motion designer - Animation 2D/3D", naf: "59.12Z", category: "Numérique & tech", sector: "service" },
  { id: "hebergeur_sysadmin", label: "Hébergement web - Infogérance", naf: "63.11Z", category: "Numérique & tech", sector: "service" },
  { id: "cybersecurite", label: "Consultant cybersécurité", naf: "62.02A", category: "Numérique & tech", sector: "service" },
  { id: "dpo_rgpd", label: "DPO - Conseil RGPD", naf: "62.02A", category: "Numérique & tech", sector: "service" },
  { id: "studio_jeux_video", label: "Studio de jeux vidéo", naf: "58.21Z", category: "Numérique & tech", sector: "service" },
  { id: "modeleur_3d", label: "Modeleur 3D - Animation 3D", naf: "74.10Z", category: "Numérique & tech", sector: "service" },
  { id: "influenceur_createur", label: "Créateur de contenu / Influenceur", naf: "73.11Z", category: "Numérique & tech", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // IMMOBILIER
  // ════════════════════════════════════════════════════════════════════
  { id: "immobilier_agence", label: "Agence immobilière", naf: "68.31Z", category: "Immobilier", sector: "service" },
  { id: "mandataire_immo", label: "Mandataire immobilier", naf: "68.31Z", category: "Immobilier", sector: "service" },
  { id: "gestion_immo", label: "Administration de biens", naf: "68.32A", category: "Immobilier", sector: "service" },
  { id: "diagnostiqueur", label: "Diagnostiqueur immobilier", naf: "71.20B", category: "Immobilier", sector: "service" },
  { id: "promoteur", label: "Promoteur immobilier", naf: "41.10A", category: "Immobilier", sector: "service" },
  { id: "marchand_biens", label: "Marchand de biens", naf: "68.10Z", category: "Immobilier", sector: "service" },
  { id: "lotisseur", label: "Lotisseur - Aménageur foncier", naf: "41.10B", category: "Immobilier", sector: "service" },
  { id: "home_staging", label: "Home staging - Mise en valeur", naf: "74.10Z", category: "Immobilier", sector: "service" },
  { id: "photographe_immobilier", label: "Photographe immobilier", naf: "74.20Z", category: "Immobilier", sector: "service" },

  // ════════════════════════════════════════════════════════════════════
  // AGRICULTURE & PRODUCTION
  // ════════════════════════════════════════════════════════════════════
  { id: "maraicher", label: "Maraîcher - AMAP", naf: "01.13Z", category: "Agriculture & production", sector: "commerce" },
  { id: "viticulteur", label: "Viticulteur - Vigneron", naf: "01.21Z", category: "Agriculture & production", sector: "commerce" },
  { id: "apiculteur", label: "Apiculteur - Miel artisanal", naf: "01.49Z", category: "Agriculture & production", sector: "commerce" },
  { id: "producteur_fromager", label: "Producteur fromager fermier", naf: "10.51A", category: "Agriculture & production", sector: "commerce" },
  { id: "eleveur", label: "Éleveur - Vente directe", naf: "01.41Z", category: "Agriculture & production", sector: "commerce" },
  { id: "pepinieriste", label: "Pépiniériste - Plantes", naf: "01.30Z", category: "Agriculture & production", sector: "commerce" },
  { id: "horticulteur", label: "Horticulteur", naf: "01.19Z", category: "Agriculture & production", sector: "commerce" },

  // ════════════════════════════════════════════════════════════════════
  // ANIMAUX
  // ════════════════════════════════════════════════════════════════════
  { id: "animalerie", label: "Animalerie", naf: "47.76Z", category: "Animaux", sector: "commerce" },
  { id: "toiletteur", label: "Toiletteur canin / félin", naf: "96.09Z", category: "Animaux", sector: "service" },
  { id: "pension_animaux", label: "Pension pour animaux", naf: "96.09Z", category: "Animaux", sector: "service" },
  { id: "educateur_canin", label: "Éducateur canin - Dresseur", naf: "96.09Z", category: "Animaux", sector: "service" },
  { id: "comportementaliste_animal", label: "Comportementaliste animal", naf: "96.09Z", category: "Animaux", sector: "service" },
  { id: "pet_sitter", label: "Pet-sitter - Visites à domicile", naf: "96.09Z", category: "Animaux", sector: "service" },
];

/** Toutes les catégories dans l'ordre canonique pour les optgroups. */
export const TRADE_CATEGORIES: TradeCategory[] = [
  "Alimentation & bouche",
  "Restauration & boissons",
  "Beauté & bien-être",
  "Commerce de détail",
  "Mode & textile",
  "Artisanat & bâtiment",
  "Artisanat d'art",
  "Auto & moto",
  "Santé & soins",
  "Sport & loisirs",
  "Tourisme & hébergement",
  "Services aux particuliers",
  "Services aux entreprises",
  "Numérique & tech",
  "Immobilier",
  "Agriculture & production",
  "Animaux",
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
