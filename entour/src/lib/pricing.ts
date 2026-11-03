/** Suggestions de prix et estimation de durée (fonctions pures). */

export const HOURLY_CATEGORIES = new Set([
  "baby-sitting",
  "aide-devoirs",
  "cours-particuliers",
  "nettoyage-maison",
  "aide-personnes-agees",
  "repassage",
  "jardinage",
  "aide-demenagement",
  "aide-rangement",
  "assistance-evenement",
  "organisation-evenements",
  "aide-administrative",
  "aide-informatique",
  "nettoyage-apres-fete",
  "jardin-potager",
  "accompagnement-courses",
]);

export type PriceSuggestion = {
  lowCents: number;
  highCents: number;
  recommendedCents: number;
  basis: "history" | "reference";
  sampleSize: number;
  hourly: boolean;
};

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round50 = (c: number) => Math.max(100, Math.round(c / 50) * 50);

/**
 * @param history prix convenus (centimes) et durées de missions terminées de la même catégorie
 * Basé sur l'historique réel si au moins 5 missions comparables, sinon sur la fourchette de référence.
 */
export function suggestPrice(
  category: { slug: string; suggestedMinCents: number | null; suggestedMaxCents: number | null; suggestedDurationMinutes: number | null },
  durationMinutes: number | null,
  history: { priceCents: number; durationMinutes: number | null }[],
  urgency: "normal" | "high" | "urgent" = "normal",
): PriceSuggestion {
  const hourly = HOURLY_CATEGORIES.has(category.slug);
  const duration = durationMinutes ?? category.suggestedDurationMinutes ?? 60;
  const urgencyFactor = urgency === "urgent" ? 1.2 : urgency === "high" ? 1.1 : 1;

  if (history.length >= 5) {
    const normalized = history
      .map((h) => (hourly ? (h.priceCents / Math.max(15, h.durationMinutes ?? duration)) * duration : h.priceCents))
      .sort((a, b) => a - b);
    return {
      lowCents: round50(quantile(normalized, 0.25)),
      highCents: round50(quantile(normalized, 0.75) * urgencyFactor),
      recommendedCents: round50(quantile(normalized, 0.5) * urgencyFactor),
      basis: "history",
      sampleSize: history.length,
      hourly,
    };
  }
  const min = category.suggestedMinCents ?? 1000;
  const max = category.suggestedMaxCents ?? 3000;
  const factor = hourly ? duration / 60 : 1;
  return {
    lowCents: round50(min * factor),
    highCents: round50(max * factor * urgencyFactor),
    recommendedCents: round50(((min + max) / 2) * factor * urgencyFactor),
    basis: "reference",
    sampleSize: history.length,
    hourly,
  };
}

/** Frais de déplacement indicatifs : au-delà de 3 km, 0,40 €/km aller-retour, plafonnés à 15 €. */
export function travelFeeCents(distanceKm: number) {
  if (distanceKm <= 3) return 0;
  return Math.min(1500, Math.round((distanceKm - 3) * 2 * 40));
}
