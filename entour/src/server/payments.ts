import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payments, payoutAccounts, serviceAssignments, services, subscriptions, transactions, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { computeFees, formatEUR } from "@/lib/money";
import { getGateway, getStripeGateway } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { systemMessage } from "./conversations";
import { notify } from "./notifications";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

async function commissionFor(userId: string): Promise<number | undefined> {
  const settings = await getSettings();
  const [sub] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
  if (!sub || sub.currentPeriodEnd < new Date()) return undefined;
  return settings.subscriptions[sub.plan]?.commissionPct;
}

export async function paymentForAssignment(assignmentId: string) {
  const [p] = await db.select().from(payments).where(eq(payments.assignmentId, assignmentId));
  return p ?? null;
}

/** Le demandeur lance le paiement sécurisé (autorisation) d'une mission confirmée. */
export async function startPayment(user: CurrentUser, assignmentId: string) {
  const [a] = await db.select().from(serviceAssignments).where(eq(serviceAssignments.id, assignmentId));
  if (!a) throw notFound("Mission");
  if (a.requesterId !== user.id) throw forbidden();
  if (!["confirmed", "in_progress", "provider_done"].includes(a.status)) throw badRequest("Cette mission ne peut pas être payée");
  const gateway = getGateway();
  const existing = await paymentForAssignment(assignmentId);
  if (existing && ["authorized", "captured"].includes(existing.status)) throw badRequest("Le paiement est déjà sécurisé");

  const settings = await getSettings();
  const fees = computeFees(a.agreedPriceCents, settings.fees, await commissionFor(a.providerId));
  let destination: string | null = null;
  if (gateway.name === "stripe") {
    const [acct] = await db.select().from(payoutAccounts).where(and(eq(payoutAccounts.userId, a.providerId), eq(payoutAccounts.provider, "stripe")));
    if (!acct?.chargesEnabled) throw badRequest("L'intervenant doit d'abord activer la réception des paiements. Il a été prévenu.");
    destination = acct.externalId;
  }
  const [svc] = await db.select({ title: services.title }).from(services).where(eq(services.id, a.serviceId));

  const values = {
    assignmentId,
    payerId: a.requesterId,
    payeeId: a.providerId,
    provider: gateway.name,
    amountCents: fees.totalChargedCents,
    feeCents: fees.platformFeeCents,
    payerFeeCents: fees.payerFeeCents,
    status: "requires_payment" as const,
    createdAt: new Date(),
  };
  const [payment] = existing
    ? await db.update(payments).set({ ...values, externalId: null, clientSecret: null, failureReason: null }).where(eq(payments.id, existing.id)).returning()
    : await db.insert(payments).values(values).returning();

  const res = await gateway.startAuthorization({
    paymentId: payment.id,
    amountCents: fees.totalChargedCents,
    applicationFeeCents: fees.platformFeeCents,
    destinationAccount: destination,
    description: `ENTOUR · ${svc?.title ?? "Mission"}`,
    payerEmail: user.email,
    successUrl: `${appUrl()}/paiement/retour?payment=${payment.id}&status=success`,
    cancelUrl: `${appUrl()}/paiement/retour?payment=${payment.id}&status=cancel`,
  });
  await db.update(payments).set({ externalId: res.externalId }).where(eq(payments.id, payment.id));
  return { paymentId: payment.id, provider: gateway.name, redirectUrl: res.redirectUrl, fees };
}

/** Simulation uniquement : le payeur confirme explicitement l'autorisation fictive. */
export async function confirmSimulatedPayment(user: CurrentUser, paymentId: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p || p.payerId !== user.id) throw notFound("Paiement");
  if (p.provider !== "simulation") throw badRequest("Ce paiement n'est pas une simulation");
  if (p.status !== "requires_payment") throw badRequest("Paiement déjà traité");
  await markAuthorized(p.id, p.externalId);
}

export async function markAuthorized(paymentId: string, externalId: string | null) {
  const [p] = await db
    .update(payments)
    .set({ status: "authorized", authorizedAt: new Date(), externalId: externalId ?? undefined })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "requires_payment")))
    .returning();
  if (!p) return;
  const [a] = await db.select().from(serviceAssignments).where(eq(serviceAssignments.id, p.assignmentId));
  if (a?.conversationId)
    await systemMessage(a.conversationId, `Paiement sécurisé${p.provider === "simulation" ? " (SIMULATION — aucun argent réel)" : ""} : ${formatEUR(p.amountCents)}. Il sera versé après confirmation de fin de mission.`, {
      action: { type: "payment_authorized", amountCents: p.amountCents },
    });
  await notify({ userId: p.payeeId, type: "payment", title: "Paiement sécurisé", body: `Le paiement de ${formatEUR(p.amountCents - p.feeCents)} (net) est sécurisé.`, link: a?.conversationId ? `/messages/${a.conversationId}` : "/revenus" });
}

/** Capture à la fin de mission : écritures comptables pour l'historique des revenus et dépenses. */
export async function capturePayment(assignmentId: string) {
  const p = await paymentForAssignment(assignmentId);
  if (!p || p.status !== "authorized") return null;
  const gateway = getGateway();
  if (p.provider === "stripe" && p.externalId) await gateway.capture(p.externalId);
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "captured", capturedAt: new Date() }).where(eq(payments.id, p.id));
    await tx.insert(transactions).values([
      { paymentId: p.id, userId: p.payerId, type: "charge", amountCents: -p.amountCents, label: "Paiement de mission", provider: p.provider },
      { paymentId: p.id, userId: p.payeeId, type: "earning", amountCents: p.amountCents - p.feeCents, label: "Revenu de mission (net de commission)", provider: p.provider },
      { paymentId: p.id, userId: null, type: "platform_fee", amountCents: p.feeCents, label: "Commission ENTOUR", provider: p.provider },
    ]);
  });
  return p;
}

/** Annulation : levée de l'autorisation, ou remboursement si déjà capturé. */
export async function cancelOrRefund(assignmentId: string, refundCents?: number) {
  const p = await paymentForAssignment(assignmentId);
  if (!p) return null;
  const gateway = getGateway();
  if (p.status === "requires_payment" || p.status === "authorized") {
    if (p.provider === "stripe" && p.externalId) await gateway.cancel(p.externalId).catch((e) => console.error("[payments] cancel", e));
    await db.update(payments).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(payments.id, p.id));
    return { action: "released" as const };
  }
  if (p.status === "captured" || p.status === "partially_refunded") {
    const amount = Math.min(refundCents ?? p.amountCents - p.refundedCents, p.amountCents - p.refundedCents);
    if (amount <= 0) return null;
    if (p.provider === "stripe" && p.externalId) await gateway.refund(p.externalId, amount);
    const total = p.refundedCents + amount;
    // Part de commission remboursée au prorata
    const feeShare = Math.round((p.feeCents * amount) / p.amountCents);
    await db.transaction(async (tx) => {
      await tx.update(payments).set({ refundedCents: total, status: total >= p.amountCents ? "refunded" : "partially_refunded" }).where(eq(payments.id, p.id));
      await tx.insert(transactions).values([
        { paymentId: p.id, userId: p.payerId, type: "refund", amountCents: amount, label: "Remboursement", provider: p.provider },
        { paymentId: p.id, userId: p.payeeId, type: "refund_reversal", amountCents: -(amount - feeShare), label: "Reprise suite à remboursement", provider: p.provider },
        { paymentId: p.id, userId: null, type: "platform_fee", amountCents: -feeShare, label: "Commission remboursée", provider: p.provider },
      ]);
    });
    return { action: "refunded" as const, amount };
  }
  return null;
}

export async function transactionsFor(userId: string) {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select t.id, t.type, t.amount_cents, t.label, t.provider, t.created_at, s.title as service_title, s.id as service_id
    from transactions t join payments p on p.id = t.payment_id
    join service_assignments a on a.id = p.assignment_id join services s on s.id = a.service_id
    where t.user_id = ${userId} order by t.created_at desc limit 500`);
  return rows.map((r) => ({
    id: String(r.id),
    type: String(r.type),
    amountCents: Number(r.amount_cents),
    label: String(r.label),
    provider: String(r.provider),
    createdAt: new Date(r.created_at as string).toISOString(),
    serviceTitle: String(r.service_title),
    serviceId: String(r.service_id),
  }));
}

export async function earningsSummary(userId: string) {
  const r = await db.execute<Record<string, unknown>>(sql`
    select
      coalesce(sum(amount_cents) filter (where type in ('earning','refund_reversal')), 0)::int as earned,
      coalesce(sum(amount_cents) filter (where type in ('earning','refund_reversal') and created_at > date_trunc('month', now())), 0)::int as earned_month,
      coalesce(-sum(amount_cents) filter (where type in ('charge','refund')), 0)::int as spent,
      coalesce(sum(amount_cents) filter (where type in ('earning','refund_reversal') and created_at > date_trunc('year', now())), 0)::int as earned_year,
      count(*) filter (where type = 'earning' and created_at > date_trunc('year', now()))::int as earning_tx_year,
      bool_or(provider = 'simulation') as has_simulation
    from transactions where user_id = ${userId}`);
  const months = await db.execute<{ month: string; earned: number; spent: number }>(sql`
    select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
      coalesce(sum(amount_cents) filter (where type in ('earning','refund_reversal')), 0)::int as earned,
      coalesce(-sum(amount_cents) filter (where type in ('charge','refund')), 0)::int as spent
    from transactions where user_id = ${userId} and created_at > now() - interval '12 months'
    group by 1 order by 1`);
  const pending = await db.execute<{ n: number }>(sql`
    select coalesce(sum(amount_cents - fee_cents), 0)::int as n from payments where payee_id = ${userId} and status = 'authorized'`);
  const row = r[0] ?? {};
  return {
    earnedCents: Number(row.earned ?? 0),
    earnedMonthCents: Number(row.earned_month ?? 0),
    earnedYearCents: Number(row.earned_year ?? 0),
    earningTransactionsYear: Number(row.earning_tx_year ?? 0),
    spentCents: Number(row.spent ?? 0),
    pendingCents: Number(pending[0]?.n ?? 0),
    hasSimulation: !!row.has_simulation,
    months: months.map((m) => ({ month: m.month, earned: Number(m.earned), spent: Number(m.spent) })),
  };
}

export async function payoutStatus(userId: string) {
  const gateway = getGateway();
  const [acct] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, userId));
  return { provider: gateway.name, isLive: gateway.isLive, account: acct ?? null };
}

export async function setupPayoutAccount(user: CurrentUser) {
  const gateway = getGateway();
  const [existing] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, user.id));
  const returnUrl = `${appUrl()}/revenus?onboarding=1`;
  if (existing && existing.provider === gateway.name) {
    if (gateway.name === "stripe") {
      const st = await gateway.payoutAccountStatus(existing.externalId);
      await db.update(payoutAccounts).set({ ...st, updatedAt: new Date() }).where(eq(payoutAccounts.userId, user.id));
      if (!st.chargesEnabled) {
        const stripe = getStripeGateway();
        if (stripe) {
          const res = await gateway.createPayoutAccount(user, returnUrl);
          return { onboardingUrl: res.onboardingUrl };
        }
      }
    }
    return { onboardingUrl: null };
  }
  const res = await gateway.createPayoutAccount(user, returnUrl);
  const st = gateway.name === "simulation" ? { chargesEnabled: true, payoutsEnabled: true } : { chargesEnabled: false, payoutsEnabled: false };
  await db
    .insert(payoutAccounts)
    .values({ userId: user.id, provider: gateway.name, externalId: res.externalId, ...st })
    .onConflictDoUpdate({ target: payoutAccounts.userId, set: { provider: gateway.name, externalId: res.externalId, ...st, updatedAt: new Date() } });
  return { onboardingUrl: res.onboardingUrl };
}

export async function paymentsAdminList(limit = 100) {
  return db
    .select({ p: payments, payer: users.email })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.payerId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}
