// Modèles de mails internes (copier-coller, à personnaliser).
// Variables disponibles entre {{ accolades }}.

export type TemplateVar =
  | "company"
  | "contactName"
  | "projectUrl"
  | "callDate"
  | "deliveryDate"
  | "nextStep"
  | "daysRemaining";

export interface EmailTemplate {
  id: string;
  category: "post-call" | "no-answer" | "thanks" | "follow-up";
  title: string;
  description: string;
  subject: string;
  body: string;
  vars: TemplateVar[];
}

export const TEMPLATE_CATEGORIES: { id: EmailTemplate["category"]; label: string; color: string }[] = [
  { id: "post-call", label: "Après appel · intéressé", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  { id: "no-answer", label: "Sans réponse au tél.", color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  { id: "thanks", label: "Remerciement client", color: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  { id: "follow-up", label: "Suivi de projet", color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
];

export const VAR_LABELS: Record<TemplateVar, string> = {
  company: "Entreprise du prospect",
  contactName: "Nom du contact",
  projectUrl: "Lien du projet / aperçu",
  callDate: "Date de l'appel",
  deliveryDate: "Date de livraison prévue",
  nextStep: "Prochaine étape",
  daysRemaining: "Jours restants",
};

// URL publique stable du logo Wyngo — automatiquement inséré dans la version HTML des mails
export const WYNGO_LOGO_URL =
  "https://project--2ea09a11-8c70-4458-a32b-430a19c18823.lovable.app/wyngo-email-logo.png";

const SIGNATURE = `

Je vous prie d'agréer, {{contactName}}, l'expression de mes salutations distinguées.

--
{{senderName}}
{{agencyName}}
{{senderEmail}} | {{senderPhone}}
{{agencyWebsite}}`;

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // ------- POST CALL (intéressé)
  {
    id: "post-call-interested",
    category: "post-call",
    title: "Récap après appel — prospect intéressé",
    description: "À envoyer dans les heures qui suivent un échange positif. Cadre la suite et engage le prospect.",
    subject: "Suite à notre échange du {{callDate}} — {{company}}",
    vars: ["company", "contactName", "projectUrl", "callDate"],
    body: `Bonjour {{contactName}},

Je vous remercie pour notre échange du {{callDate}} et pour la confiance que vous nous accordez en partageant le contexte de {{company}}.

Afin de formaliser notre discussion, voici la synthèse des éléments retenus :

— Objectifs prioritaires : (à compléter)
— Contraintes et points de vigilance : (à compléter)
— Périmètre envisagé : (à compléter)

Vous trouverez ci-dessous un lien vers une présentation détaillée de notre approche et de réalisations comparables :
{{projectUrl}}

Comme convenu, je vous propose de planifier un second rendez-vous d'une trentaine de minutes afin de vous présenter une proposition d'accompagnement chiffrée et adaptée à vos enjeux. Pourriez-vous m'indiquer deux ou trois créneaux qui vous conviendraient sur les deux prochaines semaines ?

Je reste à votre entière disposition pour toute information complémentaire d'ici là.${SIGNATURE}`,
  },

  // ------- NO ANSWER
  {
    id: "no-answer",
    category: "no-answer",
    title: "Premier contact — sans réponse au téléphone",
    description: "À envoyer après une tentative d'appel restée sans réponse. Présente l'agence et ouvre un canal écrit.",
    subject: "Prise de contact — {{agencyName}} pour {{company}}",
    vars: ["company", "contactName", "projectUrl"],
    body: `Bonjour {{contactName}},

N'ayant pu vous joindre par téléphone, je me permets de revenir vers vous par écrit.

Je suis {{senderName}}, de l'agence {{agencyName}}. Nous accompagnons des structures comparables à {{company}} dans la conception et la refonte de leur présence en ligne — sites vitrine, sites de conversion, plateformes e-commerce ou solutions sur-mesure — avec une exigence constante de retour sur investissement mesurable.

Si je souhaitais m'entretenir avec vous, c'est parce que nous identifions plusieurs leviers susceptibles de servir vos objectifs. Vous trouverez ici un aperçu de notre méthodologie et de nos références :
{{projectUrl}}

Je vous propose un premier échange d'environ quinze minutes afin de comprendre votre projet et d'évaluer la pertinence d'une collaboration. N'hésitez pas à me communiquer un créneau qui vous arrange, ou à me rappeler directement.

Dans cette attente, je vous remercie par avance pour votre retour.${SIGNATURE}`,
  },

  // ------- THANKS — 4 formats
  {
    id: "thanks-vitrine",
    category: "thanks",
    title: "Confirmation de collaboration — Format Vitrine (990 €)",
    description: "Mail de confirmation officielle après signature d'un site Vitrine.",
    subject: "Confirmation de votre commande — Site Vitrine {{company}}",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Nous accusons réception de votre commande et vous remercions sincèrement pour la confiance accordée à {{agencyName}} pour le projet de {{company}}.

Pour rappel, votre prestation Site Vitrine comprend :

— Une identité visuelle sur-mesure (maquettes Figma soumises à validation)
— De 3 à 5 pages, intégralement responsives
— L'hébergement et le nom de domaine pour la première année
— Une optimisation SEO technique de base
— Un formulaire de contact relié à votre adresse professionnelle
— Notre garantie satisfaction sur 14 jours

Date de mise en ligne prévisionnelle : {{deliveryDate}} (délai contractuel de dix jours ouvrés).

Les prochaines étapes se déroulent comme suit :
1. Vous recevrez d'ici 24 heures un questionnaire de cadrage portant sur vos contenus, votre charte graphique et vos préférences visuelles.
2. Sur la base de vos réponses, nous vous transmettrons une première maquette sous cinq jours ouvrés.
3. Deux cycles d'allers-retours sont prévus avant la validation finale et la mise en production.

Pour toute question relative au projet, je demeure votre interlocuteur unique.${SIGNATURE}`,
  },
  {
    id: "thanks-conversion",
    category: "thanks",
    title: "Confirmation de collaboration — Format Conversion (2 490 €)",
    description: "Mail de confirmation officielle après signature d'un site Conversion.",
    subject: "Confirmation de votre commande — Site Conversion {{company}}",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Nous vous remercions pour votre confiance et avons le plaisir de confirmer le lancement du projet de {{company}} dans le cadre de notre prestation Conversion.

Pour rappel, votre prestation comprend :

— L'ensemble des éléments inclus dans notre formule Vitrine Premium
— La conception de pages stratégiques (services, cas clients, FAQ) pensées pour maximiser la conversion
— Un copywriting orienté performance, rédigé par notre équipe
— L'implémentation complète de Google Analytics 4 et du suivi d'événements
— L'optimisation des Core Web Vitals (objectif PageSpeed mobile supérieur à 95)
— Notre garantie de résultats : en l'absence d'amélioration mesurable, une refonte gratuite est engagée

Date de livraison prévisionnelle : {{deliveryDate}} (délai contractuel de trois semaines).

Les prochaines étapes se déroulent comme suit :
1. Un atelier stratégique de cadrage d'une heure trente, destiné à formaliser le tunnel de conversion, le positionnement éditorial et les indicateurs clés.
2. Je reviendrai vers vous sous 48 heures avec trois propositions de créneaux pour cet atelier.
3. À l'issue, nous vous adresserons un document de cadrage à valider avant ouverture du chantier de production.

Je reste à votre disposition pour toute précision complémentaire.${SIGNATURE}`,
  },
  {
    id: "thanks-ecommerce",
    category: "thanks",
    title: "Confirmation de collaboration — Format E-commerce (3 990 €)",
    description: "Mail de confirmation officielle après signature d'une boutique en ligne.",
    subject: "Confirmation de votre commande — Boutique E-commerce {{company}}",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Nous vous remercions pour la confiance accordée à {{agencyName}} et confirmons par la présente le démarrage de la boutique en ligne de {{company}}.

Pour rappel, votre prestation E-commerce comprend :

— Un catalogue produits illimité, structuré et optimisé pour le référencement
— L'intégration des moyens de paiement Stripe, Apple Pay et Google Pay
— La gestion complète des stocks, des modes de livraison et de la facturation
— L'envoi automatique des e-mails transactionnels (confirmation, expédition, suivi)
— Un tableau de bord des ventes mis à jour en temps réel
— Une session de formation à la prise en main de la plateforme

Date de mise en ligne prévisionnelle : {{deliveryDate}} (délai contractuel de quatre semaines).

Les prochaines étapes se déroulent comme suit :
1. Transmission d'un fichier modèle pour la constitution de votre catalogue (intitulés, descriptions, prix, visuels).
2. Configuration conjointe des modes de livraison, des taux de TVA et des conditions générales de vente.
3. Conception graphique, validation, intégration technique, recette puis formation à la prise en main.

Je demeure à votre disposition pour tout complément d'information.${SIGNATURE}`,
  },
  {
    id: "thanks-surmesure",
    category: "thanks",
    title: "Confirmation de collaboration — Format Sur-mesure (8 000 € et plus)",
    description: "Mail de confirmation officielle après signature d'une plateforme sur-mesure.",
    subject: "Confirmation de votre commande — Plateforme sur-mesure {{company}}",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Nous vous remercions très sincèrement pour la confiance accordée à {{agencyName}} et avons le plaisir de confirmer l'ouverture du projet sur-mesure de {{company}}.

Pour rappel, votre prestation comprend :

— Un atelier stratégique initial de deux heures, offert, dédié au cadrage de la vision et du périmètre
— L'élaboration de l'architecture technique et la rédaction des spécifications fonctionnelles
— Le développement back-end et front-end conçu spécifiquement pour vos besoins
— Les intégrations avec vos outils tiers (CRM, ERP, API métiers)
— Trois mois de maintenance évolutive incluse à compter de la mise en production

Première livraison prévisionnelle : {{deliveryDate}} (délai indicatif de six semaines, planning détaillé communiqué à l'issue de l'atelier).

Les prochaines étapes se déroulent comme suit :
1. Atelier stratégique de cadrage : vous recevrez sous 24 heures trois propositions de créneaux.
2. Rédaction des spécifications fonctionnelles et techniques sous une semaine après l'atelier.
3. Validation conjointe du document, puis ouverture du premier sprint de développement.

Vous bénéficierez d'un point d'avancement hebdomadaire ainsi que d'un espace de suivi dédié, accessible à l'ensemble de vos interlocuteurs.

Je reste votre point de contact privilégié tout au long du projet.${SIGNATURE}`,
  },

  // ------- FOLLOW-UP — 4 formats
  {
    id: "followup-vitrine",
    category: "follow-up",
    title: "Suivi de projet — Format Vitrine",
    description: "Point d'avancement hebdomadaire en cours de projet Vitrine.",
    subject: "Point d'avancement — Site Vitrine {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Veuillez trouver ci-dessous le point d'avancement hebdomadaire du site de {{company}}.

Éléments livrés :
— (à compléter — exemple : maquette de la page d'accueil validée, configuration du nom de domaine)

Travaux en cours cette semaine :
— (à compléter — exemple : intégration des pages secondaires, préparation des formulaires)

Prochaine étape : {{nextStep}}

Mise en ligne prévue dans {{daysRemaining}} jours. Le projet respecte à ce jour le calendrier contractuel.

Vos éventuels retours sur les éléments en cours seraient appréciés d'ici la fin de la semaine afin de préserver le planning.

Je reste à votre disposition pour tout complément.${SIGNATURE}`,
  },
  {
    id: "followup-conversion",
    category: "follow-up",
    title: "Suivi de projet — Format Conversion",
    description: "Point d'avancement hebdomadaire pour un projet Conversion.",
    subject: "Point d'avancement — Site Conversion {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Veuillez trouver ci-dessous le point d'avancement hebdomadaire du projet de {{company}}.

Éléments validés :
— (à compléter — exemple : architecture du site, copywriting des pages stratégiques)

Travaux en cours cette semaine :
— (à compléter — exemple : intégration, mise en place du tracking analytics, optimisations performance)

Indicateurs cibles à la mise en production :
— Score PageSpeed mobile supérieur à 95
— Tunnel de conversion mesurable de bout en bout

Prochaine étape : {{nextStep}}
Livraison prévue dans {{daysRemaining}} jours.

Vos retours sur (à compléter) sont attendus avant la fin de la semaine afin de respecter le calendrier.

Je reste à votre disposition pour toute clarification.${SIGNATURE}`,
  },
  {
    id: "followup-ecommerce",
    category: "follow-up",
    title: "Suivi de projet — Format E-commerce",
    description: "Point d'avancement hebdomadaire pour une boutique en ligne.",
    subject: "Point d'avancement — Boutique {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Veuillez trouver ci-dessous le point d'avancement hebdomadaire de la boutique de {{company}}.

Éléments en place :
— (à compléter — exemple : catalogue importé, paiement Stripe opérationnel)

Travaux en cours :
— (à compléter — exemple : configuration des transporteurs, e-mails transactionnels, tableau de bord)

Points à tester conjointement :
— (à compléter — exemple : tunnel d'achat complet, encaissement réel en environnement de pré-production)

Prochaine étape : {{nextStep}}
Mise en ligne prévue dans {{daysRemaining}} jours.

Je vous invite à parcourir la boutique depuis le lien d'aperçu communiqué et à me transmettre vos observations.

Je reste à votre disposition pour tout échange complémentaire.${SIGNATURE}`,
  },
  {
    id: "followup-surmesure",
    category: "follow-up",
    title: "Suivi de projet — Format Sur-mesure",
    description: "Compte-rendu de sprint pour une plateforme sur-mesure.",
    subject: "Compte-rendu de sprint — Projet {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Veuillez trouver ci-dessous le compte-rendu du sprint en cours sur le projet de {{company}}.

Éléments livrés durant ce sprint :
— (à compléter — exemple : module d'authentification, schéma de base de données, première version de l'API)

Travaux engagés sur le sprint suivant :
— (à compléter — exemple : intégration CRM, tableau de bord administrateur)

Points d'attention et décisions à arbitrer :
— (à compléter)

Prochain jalon : {{nextStep}}
Charge restante estimée : {{daysRemaining}} jours avant la prochaine démonstration.

Conformément à notre cadre de collaboration, je vous propose une démonstration de trente minutes à l'issue du sprint afin de valider conjointement les évolutions. Pourriez-vous m'indiquer vos disponibilités ?

Je reste à votre disposition pour tout point intermédiaire.${SIGNATURE}`,
  },
];

export interface SignatureContext {
  senderName: string;
  senderEmail: string;
  senderPhone: string;
  agencyName: string;
  agencyWebsite: string;
}

export function renderTemplate(
  text: string,
  vars: Record<string, string>,
  signature: SignatureContext,
): string {
  const all: Record<string, string> = {
    ...signature,
    ...vars,
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = all[key];
    return v && v.length > 0 ? v : `{{${key}}}`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Rend le corps du mail en HTML riche avec le logo Wyngo inséré automatiquement
 * en bas de la signature. Quand on colle ça dans Gmail / Outlook / Apple Mail,
 * le logo s'affiche réellement comme une image.
 */
export function renderTemplateHtml(
  text: string,
  vars: Record<string, string>,
  signature: SignatureContext,
): string {
  const rendered = renderTemplate(text, vars, signature);
  const html = escapeHtml(rendered).replace(/\n/g, "<br>");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.55;color:#111;">
${html}
<br><br>
<img src="${WYNGO_LOGO_URL}" alt="Wyngo" width="120" height="120" style="display:block;border-radius:12px;margin-top:8px;" />
</div>`;
}
