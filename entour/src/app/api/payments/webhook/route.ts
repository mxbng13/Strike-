import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, payoutAccounts } from "@/db/schema";
import { getStripeGateway } from "@/lib/payments";
import { markAuthorized } from "@/server/payments";

/** Webhook Stripe : la signature est vérifiée avec STRIPE_WEBHOOK_SECRET. */
export async function POST(req: NextRequest) {
  const stripe = getStripeGateway();
  if (!stripe) return NextResponse.json({ error: "Stripe non configuré" }, { status: 404 });
  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  let event;
  try {
    event = stripe.webhookEvent(body, sig);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const paymentId = s.metadata?.entour_payment_id;
      const intent = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      if (paymentId) await markAuthorized(paymentId, intent ?? null);
      break;
    }
    case "payment_intent.canceled": {
      const pi = event.data.object;
      await db.update(payments).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(payments.externalId, pi.id));
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      await db.update(payments).set({ status: "failed", failureReason: pi.last_payment_error?.message ?? "Paiement refusé" }).where(eq(payments.externalId, pi.id));
      break;
    }
    case "account.updated": {
      const a = event.data.object;
      await db.update(payoutAccounts).set({ chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled, updatedAt: new Date() }).where(eq(payoutAccounts.externalId, a.id));
      break;
    }
  }
  return NextResponse.json({ received: true });
}
