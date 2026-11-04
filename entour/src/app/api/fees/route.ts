import { route } from "@/lib/http";
import { getSettings } from "@/lib/settings";

/** Taux de commission public (affiché à chaque étape). */
export const GET = route(async () => {
  const s = await getSettings();
  return { commissionPct: s.fees.providerCommissionPct, payerServiceFeePct: s.fees.payerServiceFeePct };
});
