/**
 * Détection automatique (règles explicables) : annonces suspectes, incohérences de prix,
 * tentatives de paiement hors plateforme et arnaques connues dans les messages.
 * Les annonces au-delà du seuil sont mises en attente de validation humaine, jamais supprimées automatiquement.
 */

export type ListingInput = {
  title: string;
  description: string;
  budgetCents: number | null;
  pricingType: "fixed" | "negotiable" | "offer";
  durationMinutes: number | null;
  category: { slug: string; suggestedMinCents: number | null; suggestedMaxCents: number | null; suggestedDurationMinutes: number | null; sensitivity: string };
  bannedWords: string[];
  accountAgeHours: number;
  recentListingsCount: number;
};

export type Finding = { code: string; severity: "info" | "warning" | "risk"; message: string; weight: number };

const SCAM_PATTERNS: [RegExp, string][] = [
  [/western\s*union|moneygram|mandat\s*cash/i, "Mode de paiement fréquemment utilisé dans les arnaques"],
  [/\b(pcs|transcash|neosurf|paysafecard|carte\s+(cadeau|prépayée|de recharge))\b/i, "Demande de coupons ou cartes prépayées"],
  [/\b(crypto|bitcoin|usdt)\b/i, "Paiement en cryptomonnaie"],
  [/(avance|acompte).{0,30}(avant|d'abord)/i, "Demande de paiement d'avance"],
  [/(rib|iban).{0,40}(envoi|envoyer|donne)/i, "Demande de coordonnées bancaires"],
  [/(code|sms).{0,30}(reçu|recevoir).{0,30}(donne|envoie|transmet)/i, "Demande de code de vérification"],
];

const OFF_PLATFORM: [RegExp, string][] = [
  [/(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4}/, "Numéro de téléphone"],
  [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, "Adresse e-mail"],
  [/\b(paypal|lydia|wero|paylib|virement)\b/i, "Paiement hors plateforme"],
  [/https?:\/\/|www\./i, "Lien externe"],
];

export function analyzeListing(input: ListingInput): { riskScore: number; findings: Finding[] } {
  const findings: Finding[] = [];
  const text = `${input.title}\n${input.description}`;
  const lower = text.toLowerCase();

  for (const w of input.bannedWords) {
    if (w && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(lower)) {
      findings.push({ code: "banned_word", severity: "risk", message: `Terme interdit : « ${w} »`, weight: 60 });
    }
  }
  for (const [re, msg] of SCAM_PATTERNS) if (re.test(text)) findings.push({ code: "scam_pattern", severity: "risk", message: msg, weight: 35 });
  for (const [re, msg] of OFF_PLATFORM)
    if (re.test(text))
      findings.push({ code: "off_platform", severity: "warning", message: `${msg} dans l'annonce : les coordonnées s'échangent dans la messagerie après acceptation`, weight: 12 });

  if (input.title.trim().length < 6) findings.push({ code: "short_title", severity: "info", message: "Titre très court", weight: 3 });
  if (input.description.trim().length < 20) findings.push({ code: "short_description", severity: "info", message: "Description peu détaillée : les annonces précises reçoivent plus de réponses", weight: 3 });
  const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length > 20 && letters === letters.toUpperCase()) findings.push({ code: "all_caps", severity: "info", message: "Évitez d'écrire tout en majuscules", weight: 3 });

  // Cohérence prix / catégorie / durée
  const { suggestedMinCents: min, suggestedMaxCents: max, suggestedDurationMinutes: refDur } = input.category;
  if (input.budgetCents != null && input.pricingType !== "offer" && min && max) {
    const duration = input.durationMinutes ?? refDur ?? 60;
    const hourly = ["baby-sitting", "aide-devoirs", "cours-particuliers", "nettoyage-maison", "aide-personnes-agees", "repassage", "jardinage", "aide-demenagement", "aide-rangement", "assistance-evenement", "organisation-evenements", "aide-administrative", "aide-informatique", "nettoyage-apres-fete", "jardin-potager", "accompagnement-courses"].includes(input.category.slug);
    const expectedLow = hourly ? (min * duration) / 60 : min;
    const expectedHigh = hourly ? (max * duration) / 60 : max;
    if (input.budgetCents < expectedLow * 0.5) {
      findings.push({ code: "budget_low", severity: "warning", message: `Budget nettement inférieur aux repères habituels (≈ ${Math.round(expectedLow / 100)}–${Math.round(expectedHigh / 100)} €) : peu de personnes risquent de répondre`, weight: 2 });
    } else if (input.budgetCents > expectedHigh * 6 && input.budgetCents > 20000) {
      findings.push({ code: "budget_anomaly", severity: "risk", message: "Montant anormalement élevé pour ce type de service", weight: 25 });
    }
    if (hourly && input.budgetCents > 0) {
      const perHour = input.budgetCents / (duration / 60);
      if (perHour < 400) findings.push({ code: "below_hourly", severity: "warning", message: "La rémunération horaire semble très faible", weight: 2 });
    }
  }
  if (refDur && input.durationMinutes && input.durationMinutes > refDur * 8) {
    findings.push({ code: "duration_incoherent", severity: "info", message: "Durée inhabituelle pour cette catégorie : vérifiez-la", weight: 2 });
  }

  // Signaux de compte
  if (input.accountAgeHours < 1 && input.recentListingsCount >= 3) findings.push({ code: "burst_new_account", severity: "risk", message: "Nombreuses annonces depuis un compte très récent", weight: 30 });
  else if (input.recentListingsCount >= 8) findings.push({ code: "burst", severity: "warning", message: "Volume d'annonces inhabituel", weight: 15 });

  const riskScore = Math.min(100, findings.reduce((s, f) => s + f.weight, 0));
  return { riskScore, findings };
}

/** Analyse un message de conversation : renvoie un avertissement à afficher, sans bloquer l'échange. */
export function analyzeMessage(body: string): { warning: string | null; scam: boolean } {
  for (const [re] of SCAM_PATTERNS) if (re.test(body)) return { scam: true, warning: "Attention : ce message ressemble à une tentative d'arnaque. Ne payez jamais en dehors d'ENTOUR et ne communiquez jamais de code reçu par SMS." };
  if (/\b(paypal|lydia|wero|virement|espèces|cash)\b/i.test(body))
    return { scam: false, warning: "Les paiements effectués en dehors d'ENTOUR ne sont ni protégés ni couverts en cas de litige." };
  return { warning: null, scam: false };
}
