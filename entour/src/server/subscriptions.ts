import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { getGateway } from "@/lib/payments";
import { getSettings } from "@/lib/settings";

export async function currentSubscription(userId: string) {
  const [s] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
  return s ?? null;
}

/**
 * Souscription Plus / Pro.
 * - Mode simulation : l'abonnement est activé et marqué « simulation » (aucun prélèvement).
 * - Mode Stripe : à brancher sur Stripe Billing (Checkout en mode « subscription » + webhooks) ; non activé
 *   tant que les produits/prix Stripe ne sont pas créés (STRIPE_PRICE_PLUS / STRIPE_PRICE_PRO).
 */
export async function subscribe(user: CurrentUser, plan: "plus" | "pro") {
  const settings = await getSettings();
  const gateway = getGateway();
  if (await currentSubscription(user.id)) throw badRequest("Vous avez déjà un abonnement actif");
  if (gateway.name === "stripe") {
    throw badRequest("Les abonnements payants seront ouverts prochainement.");
  }
  const [s] = await db
    .insert(subscriptions)
    .values({ userId: user.id, plan, provider: "simulation", priceCents: settings.subscriptions[plan].priceCents, currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) })
    .returning();
  return s;
}

export async function cancelSubscription(userId: string) {
  const s = await currentSubscription(userId);
  if (!s) throw badRequest("Aucun abonnement actif");
  await db.update(subscriptions).set({ cancelAtPeriodEnd: true }).where(eq(subscriptions.id, s.id));
}
