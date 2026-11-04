export function formatEUR(cents: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (cents == null) return "Sur devis";
  const euros = cents / 100;
  const whole = Number.isInteger(euros);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole || opts.compact ? 0 : 2,
    maximumFractionDigits: opts.compact && whole ? 0 : 2,
  }).format(euros);
}

export type FeeSettings = { providerCommissionPct: number; payerServiceFeePct: number; payerServiceFeeFixedCents: number; minFeeCents: number };

/** Taux de commission affiché partout (réglable dans l'administration). */
export const DEFAULT_COMMISSION_PCT = 5;

/**
 * Répartition d'un paiement (centimes, arrondis à l'entier).
 * - La commission ENTOUR porte UNIQUEMENT sur la rémunération du service (`serviceCents`).
 * - Les achats avancés par l'intervenant (`purchaseCents`, ex. le menu McDo) ne sont jamais commissionnés :
 *   ils lui sont reversés à l'euro près.
 * - Le demandeur bloque `totalChargedCents` = achats + rémunération (+ frais demandeur éventuels).
 */
export function computeFees(serviceCents: number, fees: FeeSettings, commissionOverridePct?: number, purchaseCents = 0) {
  const pct = commissionOverridePct ?? fees.providerCommissionPct;
  const commission = serviceCents === 0 ? 0 : Math.max(fees.minFeeCents, Math.round((serviceCents * pct) / 100));
  const providerFee = Math.min(serviceCents, commission);
  const payerFee = Math.round((serviceCents * fees.payerServiceFeePct) / 100) + (serviceCents > 0 ? fees.payerServiceFeeFixedCents : 0);
  const total = serviceCents + purchaseCents + payerFee;
  return {
    amountCents: serviceCents,
    serviceCents,
    purchaseCents,
    commissionPct: pct,
    payerFeeCents: payerFee,
    totalChargedCents: total,
    platformFeeCents: providerFee + payerFee,
    providerServiceNetCents: serviceCents - providerFee,
    providerNetCents: serviceCents - providerFee + purchaseCents,
  };
}
export type FeeBreakdown = ReturnType<typeof computeFees>;
