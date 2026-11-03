import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { earningsSummary, payoutStatus, transactionsFor } from "@/server/payments";

export const GET = route(async () => {
  const user = await requireUser();
  const [summary, transactions, payout] = await Promise.all([earningsSummary(user.id), transactionsFor(user.id), payoutStatus(user.id)]);
  return { summary, transactions, payout };
});
