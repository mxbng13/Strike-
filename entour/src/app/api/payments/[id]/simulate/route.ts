import { requireActiveUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { confirmSimulatedPayment } from "@/server/payments";

/** Confirmation explicite d'un paiement SIMULÉ (environnement sans Stripe). Aucun argent réel. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireActiveUser();
  await confirmSimulatedPayment(user, id);
  return { ok: true, simulated: true };
});
