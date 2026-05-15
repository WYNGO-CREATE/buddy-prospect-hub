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

Bien cordialement,

{{senderName}}
{{agencyName}}
{{senderEmail}} · {{senderPhone}}
{{agencyWebsite}}`;

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // ------- POST CALL (intéressé)
  {
    id: "post-call-interested",
    category: "post-call",
    title: "Récap après appel — prospect intéressé",
    description: "À envoyer juste après un appel positif. Récapitule l'échange et pousse vers la conversion.",
    subject: "Suite à notre échange — {{agencyName}} × {{company}}",
    vars: ["company", "contactName", "projectUrl", "callDate"],
    body: `Bonjour {{contactName}},

Merci pour le temps que vous m'avez accordé {{callDate}}. J'ai été ravi d'échanger avec vous au sujet de {{company}} et de mieux comprendre vos enjeux.

Pour récapituler ce que nous avons évoqué :
• Vos objectifs : (à compléter)
• Les points de friction actuels : (à compléter)
• Ce que nous pouvons mettre en place : (à compléter)

Vous pouvez retrouver un aperçu de notre approche et quelques cas concrets ici :
👉 {{projectUrl}}

La prochaine étape la plus simple serait de fixer un second rendez-vous de 30 minutes pour vous présenter une proposition personnalisée, sans engagement. Êtes-vous disponible cette semaine ou la suivante ?

Je reste évidemment à votre disposition d'ici là pour toute question.${SIGNATURE}`,
  },

  // ------- NO ANSWER
  {
    id: "no-answer",
    category: "no-answer",
    title: "Premier contact — sans réponse au téléphone",
    description: "Quand le prospect n'a pas décroché. Présente le projet et invite à reprendre contact.",
    subject: "{{agencyName}} — un message rapide pour {{company}}",
    vars: ["company", "contactName", "projectUrl"],
    body: `Bonjour {{contactName}},

Je me permets de vous écrire après avoir tenté de vous joindre par téléphone.

Je suis {{senderName}}, de {{agencyName}}. Nous accompagnons des entreprises comme {{company}} dans la création de leur site et de leur présence en ligne — site vitrine, site qui convertit, e-commerce ou plateforme sur-mesure — avec une obsession : que chaque euro investi génère du retour mesurable.

Si je vous appelais, c'est parce que je pense sincèrement qu'on peut vous aider à (à compléter selon le contexte). Je vous laisse jeter un œil à notre approche ici :
👉 {{projectUrl}}

Le plus simple serait d'échanger 15 minutes par téléphone pour comprendre votre projet et voir si nous sommes les bons interlocuteurs. Vous pouvez répondre à ce mail avec un créneau qui vous arrange, ou me rappeler directement.

Au plaisir d'échanger.${SIGNATURE}`,
  },

  // ------- THANKS — 4 formats
  {
    id: "thanks-vitrine",
    category: "thanks",
    title: "Bienvenue client — Format Vitrine (990€)",
    description: "Mail de remerciement pour un client qui vient de signer un site Vitrine.",
    subject: "Bienvenue chez {{agencyName}}, {{contactName}} 🎉",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Un immense merci pour votre confiance — toute l'équipe de {{agencyName}} est ravie de démarrer ce projet avec {{company}}.

Voici ce que nous allons mettre en place pour vous (Format Vitrine) :
• Un design sur-mesure (Figma + maquettes validées avec vous)
• 3 à 5 pages, 100% responsive
• L'hébergement et le nom de domaine pour 1 an
• Une optimisation SEO de base pour exister sur Google
• Un formulaire de contact intelligent
• Notre garantie satisfaction 14 jours

📅 Mise en ligne prévue : {{deliveryDate}} (sous 10 jours).

Prochaine étape : je vais vous envoyer dans la foulée un court questionnaire pour cadrer vos contenus, votre charte et vos préférences visuelles. Plus vos retours seront précis, plus la première maquette tapera juste.

Si vous avez la moindre question d'ici là, répondez simplement à ce mail.

À très vite !${SIGNATURE}`,
  },
  {
    id: "thanks-conversion",
    category: "thanks",
    title: "Bienvenue client — Format Conversion (2 490€)",
    description: "Mail de remerciement pour un client qui vient de signer un site Conversion.",
    subject: "Bienvenue chez {{agencyName}}, {{contactName}} 🎉",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Un grand merci pour votre confiance ! Toute l'équipe de {{agencyName}} est très enthousiaste à l'idée d'attaquer le projet de {{company}}.

Vous avez choisi notre Format Conversion, et concrètement voici ce qu'on va construire ensemble :
• Tout ce qui est inclus dans Vitrine Premium
• Des pages stratégiques (services, cas clients, FAQ) pensées pour convertir
• Du copywriting orienté action (chaque mot a une fonction)
• La mise en place de Google Analytics + tracking d'évènements
• Des Core Web Vitals optimisés (objectif PageSpeed 95+)
• Notre garantie ROI : si les résultats ne sont pas au rendez-vous, on refait gratuitement

📅 Livraison prévue : {{deliveryDate}} (sous 3 semaines).

Prochaine étape : un atelier stratégique de cadrage pour définir précisément le tunnel de conversion, le ton, et les KPI à suivre. Je reviens vers vous dans les 48h pour caler une date.

Hâte de démarrer !${SIGNATURE}`,
  },
  {
    id: "thanks-ecommerce",
    category: "thanks",
    title: "Bienvenue client — Format E-commerce (3 990€)",
    description: "Mail de remerciement pour un client qui vient de signer une boutique en ligne.",
    subject: "Bienvenue chez {{agencyName}}, {{contactName}} 🎉",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Merci pour votre confiance — c'est un vrai plaisir de lancer la boutique de {{company}} avec vous.

Voici ce qu'inclut votre Format E-commerce :
• Un catalogue produits illimité
• Le paiement Stripe / Apple Pay / Google Pay
• La gestion complète des stocks, livraisons et factures
• Les emails transactionnels automatiques (commande, expédition, etc.)
• Un tableau de bord ventes en temps réel
• Une formation incluse à la prise en main

📅 Mise en ligne prévue : {{deliveryDate}} (sous 4 semaines). Vous pourrez encaisser dès la première semaine de mise en ligne.

Prochaines étapes :
1. Je vous transmets un fichier type pour récupérer votre catalogue (titres, descriptions, prix, photos).
2. On configure ensemble vos modes de livraison et vos taux de TVA.
3. Maquette → validation → développement → formation.

Si vous avez la moindre question sur l'une de ces étapes, je suis à votre disposition.

À très vite !${SIGNATURE}`,
  },
  {
    id: "thanks-surmesure",
    category: "thanks",
    title: "Bienvenue client — Format Sur-mesure (8 000€+)",
    description: "Mail de remerciement pour un client signé sur une plateforme sur-mesure.",
    subject: "Bienvenue chez {{agencyName}}, {{contactName}} 🎉",
    vars: ["company", "contactName", "deliveryDate"],
    body: `Bonjour {{contactName}},

Merci infiniment pour votre confiance. Les projets sur-mesure sont ceux qui nous animent le plus, et celui de {{company}} ne fait pas exception.

Voici ce que comprend votre prestation :
• Un atelier stratégique de 2h offert pour cadrer la vision
• L'architecture technique et les spécifications dédiées
• Le développement back-end sur mesure
• Les intégrations API tierces nécessaires (CRM, ERP, etc.)
• 3 mois de maintenance évolutive incluse après mise en ligne

📅 Première livraison prévue : {{deliveryDate}} (6 semaines minimum, planning détaillé à venir).

Prochaines étapes :
1. Atelier stratégique de 2h pour aligner vision, périmètre et priorités (je vous propose 3 créneaux dans les jours qui viennent).
2. Rédaction des spécifications fonctionnelles et techniques (sous 1 semaine après l'atelier).
3. Validation conjointe → démarrage du développement.

Vous aurez un point d'avancement hebdomadaire et un accès à un espace de suivi dédié.

Au plaisir de construire ce projet avec vous.${SIGNATURE}`,
  },

  // ------- FOLLOW-UP — 4 formats
  {
    id: "followup-vitrine",
    category: "follow-up",
    title: "Suivi projet — Format Vitrine",
    description: "Point d'avancement à envoyer en cours de projet Vitrine. Personnaliser l'avancement.",
    subject: "Avancement de votre site — {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Petit point sur l'avancement du site de {{company}} :

✅ Ce qui est fait :
• (à compléter — ex : maquette page d'accueil validée, choix du domaine)

🔧 Ce sur quoi nous travaillons cette semaine :
• (à compléter — ex : intégration des pages secondaires)

⏭️ Prochaine étape : {{nextStep}}

📅 Mise en ligne prévue dans {{daysRemaining}} jours, nous sommes dans les délais.

Si vous avez des retours, des contenus à ajuster ou des questions, c'est le bon moment pour me les envoyer.

Bonne journée,${SIGNATURE}`,
  },
  {
    id: "followup-conversion",
    category: "follow-up",
    title: "Suivi projet — Format Conversion",
    description: "Point d'avancement pour un projet Conversion. Insister sur les choix stratégiques.",
    subject: "Avancement de votre site — {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Voici où nous en sommes sur le projet de {{company}} :

✅ Validé :
• (à compléter — ex : architecture, copywriting des pages clés)

🔧 En cours cette semaine :
• (à compléter — ex : intégration, tracking analytics, optimisation perf)

📊 Indicateurs visés à la mise en ligne :
• PageSpeed mobile > 95
• Tunnel de conversion mesuré bout en bout

⏭️ Prochaine étape : {{nextStep}}
📅 Livraison prévue dans {{daysRemaining}} jours.

Vos retours sur (à compléter) seraient les bienvenus avant la fin de la semaine pour rester dans le timing.

À très vite,${SIGNATURE}`,
  },
  {
    id: "followup-ecommerce",
    category: "follow-up",
    title: "Suivi projet — Format E-commerce",
    description: "Point d'avancement pour une boutique en ligne. Insister sur catalogue, paiement, logistique.",
    subject: "Avancement de votre boutique — {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Point hebdomadaire sur la boutique de {{company}} :

✅ Ce qui est en place :
• (à compléter — ex : catalogue importé, paiement Stripe configuré)

🔧 En cours :
• (à compléter — ex : configuration des transporteurs, emails transactionnels, tableau de bord)

🧪 À tester ensemble :
• (à compléter — ex : tunnel d'achat de bout en bout, encaissement réel)

⏭️ Prochaine étape : {{nextStep}}
📅 Mise en ligne prévue dans {{daysRemaining}} jours.

N'hésitez pas à passer la boutique en mode test depuis le lien d'aperçu et à me remonter le moindre détail.

Bonne journée,${SIGNATURE}`,
  },
  {
    id: "followup-surmesure",
    category: "follow-up",
    title: "Suivi projet — Format Sur-mesure",
    description: "Point d'avancement pour une plateforme sur-mesure. Plus structuré, par sprint.",
    subject: "Sprint en cours — projet {{company}}",
    vars: ["company", "contactName", "nextStep", "daysRemaining"],
    body: `Bonjour {{contactName}},

Voici le compte-rendu hebdomadaire du projet de {{company}}.

✅ Livré durant ce sprint :
• (à compléter — ex : module d'authentification, schéma BDD, API publique)

🔧 Sprint en cours :
• (à compléter — ex : intégration CRM, dashboard administrateur)

⚠️ Points d'attention / décisions à prendre :
• (à compléter)

⏭️ Prochain jalon : {{nextStep}}
📅 Restant estimé : {{daysRemaining}} jours avant la prochaine démonstration.

Comme convenu, je vous propose une démo de 30 minutes en fin de sprint pour valider ensemble les évolutions. Dites-moi votre disponibilité.

Bien à vous,${SIGNATURE}`,
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
