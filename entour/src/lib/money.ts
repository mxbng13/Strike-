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

/** Calcule la répartition d'un paiement. Tous les montants sont en centimes, arrondis à l'entier. */
export function computeFees(amountCents: number, fees: FeeSettings, commissionOverridePct?: number) {
  const pct = commissionOverridePct ?? fees.providerCommissionPct;
  const providerFee = amountCents === 0 ? 0 : Math.max(fees.minFeeCents, Math.round((amountCents * pct) / 100));
  const payerFee = Math.round((amountCents * fees.payerServiceFeePct) / 100) + (amountCents > 0 ? fees.payerServiceFeeFixedCents : 0);
  const platformFee = Math.min(amountCents + payerFee, providerFee + payerFee);
  return {
    amountCents,
    payerFeeCents: payerFee,
    totalChargedCents: amountCents + payerFee,
    platformFeeCents: platformFee,
    providerNetCents: amountCents + payerFee - platformFee,
  };
}
