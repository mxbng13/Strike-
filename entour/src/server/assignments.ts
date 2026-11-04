import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  disputes,
  payments,
  referrals,
  reviews,
  serviceApplications,
  serviceAssignments,
  serviceOffers,
  services,
  userProfiles,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { formatWhen } from "@/lib/dates";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { formatEUR } from "@/lib/money";
import { publish } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import { promoteWaitlist } from "./applications";
import { ensureMissionConversation, systemMessage } from "./conversations";
import { notify } from "./notifications";
import { cancelOrRefund, capturePayment, paymentForAssignment } from "./payments";
import { addPoints, evaluateBadges, recomputeStats } from "./reputation";

async function loadAssignment(id: string) {
  const [row] = await db
    .select({ a: serviceAssignments, s: services })
    .from(serviceAssignments)
    .innerJoin(services, eq(services.id, serviceAssignments.serviceId))
    .where(eq(serviceAssignments.id, id));
  if (!row) throw notFound("Mission");
  return row;
}

async function convFor(a: typeof serviceAssignments.$inferSelect) {
  if (a.conversationId) return a.conversationId;
  const c = await ensureMissionConversation(db, a.serviceId, a.requesterId, a.providerId);
  await db.update(serviceAssignments).set({ conversationId: c.id }).where(eq(serviceAssignments.id, a.id));
  return c.id;
}

async function changed(a: typeof serviceAssignments.$inferSelect) {
  await publish([a.requesterId, a.providerId], { type: "assignment:updated", assignmentId: a.id, serviceId: a.serviceId });
}

/** Encadré « mission » affiché en tête de conversation. */
export async function missionContext(serviceId: string, viewerId: string, otherId: string | null) {
  const [s] = await db
    .select({ s: services, catName: categories.name, catIcon: categories.icon, catColor: categories.color })
    .from(services)
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .where(eq(services.id, serviceId));
  if (!s) return null;
  const providerId = s.s.requesterId === viewerId ? otherId : viewerId;
  const role: "requester" | "provider" = s.s.requesterId === viewerId ? "requester" : "provider";
  const [assignment] = providerId
    ? await db
        .select()
        .from(serviceAssignments)
        .where(and(eq(serviceAssignments.serviceId, serviceId), eq(serviceAssignments.providerId, providerId)))
        .orderBy(desc(serviceAssignments.createdAt))
        .limit(1)
    : [];
  const [application] = providerId
    ? await db.select().from(serviceApplications).where(and(eq(serviceApplications.serviceId, serviceId), eq(serviceApplications.applicantId, providerId)))
    : [];
  const offers = await db
    .select()
    .from(serviceOffers)
    .where(and(eq(serviceOffers.serviceId, serviceId), eq(serviceOffers.status, "pending"), providerId ? sql`(${serviceOffers.fromUserId} = ${providerId} or ${serviceOffers.fromUserId} = ${s.s.requesterId})` : sql`true`))
    .orderBy(desc(serviceOffers.createdAt));
  const relevantOffers = offers.filter((o) => (assignment ? o.assignmentId === assignment.id : o.applicationId === application?.id));
  const payment = assignment ? await paymentForAssignment(assignment.id) : null;
  const myReview = assignment ? (await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.assignmentId, assignment.id), eq(reviews.authorId, viewerId))))[0] : undefined;
  const [openDispute] = assignment ? await db.select().from(disputes).where(and(eq(disputes.assignmentId, assignment.id), inArray(disputes.status, ["open", "under_review"]))) : [];
  return {
    serviceId,
    title: s.s.title,
    category: { name: s.catName, icon: s.catIcon, color: s.catColor },
    serviceStatus: s.s.status,
    budgetCents: s.s.budgetCents,
    purchaseCents: assignment?.purchaseCents ?? s.s.purchaseCents ?? 0,
    purchaseNote: s.s.purchaseNote,
    pricingType: s.s.pricingType,
    startsAt: (assignment?.startsAt ?? s.s.startsAt)?.toISOString() ?? null,
    durationMinutes: s.s.durationMinutes,
    role,
    application: application ? { id: application.id, status: application.status, proposedPriceCents: application.proposedPriceCents } : null,
    assignment: assignment
      ? {
          id: assignment.id,
          status: assignment.status,
          agreedPriceCents: assignment.agreedPriceCents,
          lateMinutes: assignment.lateMinutes,
          providerDoneAt: assignment.providerDoneAt?.toISOString() ?? null,
          priceConfirmedByProvider: assignment.priceConfirmedByProvider,
          priceConfirmedByRequester: assignment.priceConfirmedByRequester,
        }
      : null,
    pendingOffers: relevantOffers.map((o) => ({
      id: o.id,
      kind: o.kind,
      amountCents: o.amountCents,
      proposedStartsAt: o.proposedStartsAt?.toISOString() ?? null,
      note: o.note,
      mine: o.fromUserId === viewerId,
      createdAt: o.createdAt.toISOString(),
    })),
    payment: payment ? { id: payment.id, status: payment.status, provider: payment.provider, amountCents: payment.amountCents, feeCents: payment.feeCents, purchaseCents: payment.purchaseCents } : null,
    claim: assignment ? await latestClaim(assignment.id) : null,
    reviewed: !!myReview,
    dispute: openDispute ? { id: openDispute.id, status: openDispute.status } : null,
  };
}

async function latestClaim(assignmentId: string) {
  const { purchaseClaims } = await import("@/db/schema");
  const [c] = await db.select().from(purchaseClaims).where(eq(purchaseClaims.assignmentId, assignmentId)).orderBy(desc(purchaseClaims.createdAt)).limit(1);
  return c ? { id: c.id, status: c.status, claimedCents: c.claimedCents, refundedCents: c.refundedCents, decisionNote: c.decisionNote, createdAt: c.createdAt.toISOString() } : null;
}

/* ───────────── Négociation : propositions de prix et d'horaire ───────────── */

export async function proposeChange(user: CurrentUser, conversationId: string, input: { kind: "price" | "schedule"; amountCents?: number; startsAt?: string; note?: string }) {
  const { getConversation } = await import("./conversations");
  const conv = await getConversation(user.id, conversationId);
  if (!conv.mission || !conv.other) throw badRequest("Cette conversation n'est pas liée à une mission");
  const m = conv.mission;
  if (m.assignment && ["completed", "cancelled"].includes(m.assignment.status)) throw badRequest("Mission terminée");
  if (!m.assignment && !m.application) throw badRequest("Aucune candidature en cours : candidatez d'abord ou attendez une candidature");
  if (input.kind === "price") {
    if (input.amountCents == null || input.amountCents < 0 || input.amountCents > 1_000_000) throw badRequest("Montant invalide");
    if (m.payment && ["authorized", "captured"].includes(m.payment.status)) throw badRequest("Le paiement est déjà sécurisé : le prix ne peut plus être modifié");
  }
  if (input.kind === "schedule") {
    if (!input.startsAt || Number.isNaN(Date.parse(input.startsAt))) throw badRequest("Date invalide");
    if (new Date(input.startsAt).getTime() < Date.now() - 5 * 60_000) throw badRequest("Cette date est déjà passée");
  }
  await db
    .update(serviceOffers)
    .set({ status: "superseded" })
    .where(
      and(
        eq(serviceOffers.serviceId, m.serviceId),
        eq(serviceOffers.kind, input.kind),
        eq(serviceOffers.status, "pending"),
        m.assignment ? eq(serviceOffers.assignmentId, m.assignment.id) : eq(serviceOffers.applicationId, m.application!.id),
      ),
    );
  const [offer] = await db
    .insert(serviceOffers)
    .values({
      serviceId: m.serviceId,
      applicationId: m.application?.id ?? null,
      assignmentId: m.assignment?.id ?? null,
      conversationId,
      fromUserId: user.id,
      kind: input.kind,
      amountCents: input.kind === "price" ? input.amountCents : null,
      proposedStartsAt: input.kind === "schedule" ? new Date(input.startsAt!) : null,
      note: input.note?.slice(0, 300) ?? null,
    })
    .returning();
  const text =
    input.kind === "price"
      ? `${user.firstName} propose un nouveau prix : ${formatEUR(input.amountCents!)}`
      : `${user.firstName} propose un nouvel horaire : ${formatWhen(input.startsAt!)}`;
  await systemMessage(conversationId, text + (input.note ? ` — « ${input.note.slice(0, 300)} »` : ""), { action: { type: `offer_${input.kind}`, offerId: offer.id, amountCents: input.amountCents, startsAt: input.startsAt, status: "pending" } }, user.id, "action");
  await notify({
    userId: conv.other.userId,
    type: input.kind === "price" ? "price_change" : "schedule_change",
    title: input.kind === "price" ? "Nouvelle proposition de prix" : "Demande de changement d'horaire",
    body: text,
    link: `/messages/${conversationId}`,
  });
  return offer;
}

export async function respondToOffer(user: CurrentUser, offerId: string, accept: boolean) {
  const [o] = await db.select().from(serviceOffers).where(eq(serviceOffers.id, offerId));
  if (!o) throw notFound("Proposition");
  if (o.status !== "pending") throw conflict("Proposition déjà traitée");
  if (o.fromUserId === user.id) throw badRequest("Vous ne pouvez pas répondre à votre propre proposition");
  const [s] = await db.select().from(services).where(eq(services.id, o.serviceId));
  // Seules les deux parties concernées peuvent répondre
  let partyIds: string[] = [];
  if (o.assignmentId) {
    const [a] = await db.select().from(serviceAssignments).where(eq(serviceAssignments.id, o.assignmentId));
    partyIds = [a.requesterId, a.providerId];
  } else if (o.applicationId) {
    const [app] = await db.select().from(serviceApplications).where(eq(serviceApplications.id, o.applicationId));
    partyIds = [s.requesterId, app.applicantId];
  }
  if (!partyIds.includes(user.id)) throw forbidden();

  await db.transaction(async (tx) => {
    await tx.update(serviceOffers).set({ status: accept ? "accepted" : "rejected", respondedBy: user.id, respondedAt: new Date() }).where(eq(serviceOffers.id, offerId));
    if (!accept) return;
    if (o.assignmentId) {
      if (o.kind === "price") {
        const pay = (await tx.select().from(payments).where(eq(payments.assignmentId, o.assignmentId)))[0];
        if (pay && ["authorized", "captured"].includes(pay.status)) throw badRequest("Paiement déjà sécurisé");
        await tx.update(serviceAssignments).set({ agreedPriceCents: o.amountCents!, priceConfirmedByProvider: true, priceConfirmedByRequester: true }).where(eq(serviceAssignments.id, o.assignmentId));
        if (pay?.status === "requires_payment") await tx.update(payments).set({ status: "cancelled" }).where(eq(payments.id, pay.id));
      } else {
        await tx.update(serviceAssignments).set({ startsAt: o.proposedStartsAt }).where(eq(serviceAssignments.id, o.assignmentId));
      }
    } else if (o.applicationId) {
      if (o.kind === "price") await tx.update(serviceApplications).set({ proposedPriceCents: o.amountCents }).where(eq(serviceApplications.id, o.applicationId));
      else await tx.update(services).set({ startsAt: o.proposedStartsAt }).where(eq(services.id, o.serviceId));
    }
  });
  const what = o.kind === "price" ? `le prix de ${formatEUR(o.amountCents!)}` : `l'horaire du ${formatWhen(o.proposedStartsAt!)}`;
  if (o.conversationId)
    await systemMessage(o.conversationId, `${user.firstName} a ${accept ? "accepté" : "refusé"} ${what}.`, { action: { type: `offer_${accept ? "accepted" : "rejected"}`, offerId } });
  await notify({ userId: o.fromUserId, type: o.kind === "price" ? "price_change" : "schedule_change", title: accept ? "Proposition acceptée" : "Proposition refusée", body: `${user.firstName} a ${accept ? "accepté" : "refusé"} ${what}.`, link: o.conversationId ? `/messages/${o.conversationId}` : null });
  await publish(partyIds, { type: "service:updated", serviceId: o.serviceId });
}

/** « Confirmer le prix » : chaque partie valide explicitement le montant convenu. */
export async function confirmPrice(user: CurrentUser, assignmentId: string) {
  const { a } = await loadAssignment(assignmentId);
  if (user.id !== a.providerId && user.id !== a.requesterId) throw forbidden();
  const patch = user.id === a.providerId ? { priceConfirmedByProvider: true } : { priceConfirmedByRequester: true };
  await db.update(serviceAssignments).set(patch).where(eq(serviceAssignments.id, assignmentId));
  await systemMessage(await convFor(a), `${user.firstName} confirme le prix de ${formatEUR(a.agreedPriceCents)}.`, { action: { type: "price_confirmed", amountCents: a.agreedPriceCents } });
  await changed(a);
}

export async function confirmSchedule(user: CurrentUser, assignmentId: string) {
  const { a, s } = await loadAssignment(assignmentId);
  if (user.id !== a.providerId && user.id !== a.requesterId) throw forbidden();
  const when = a.startsAt ?? s.startsAt;
  await systemMessage(await convFor(a), `${user.firstName} confirme l'horaire : ${formatWhen(when)}.`, { action: { type: "schedule_confirmed" } });
}

/* ───────────── Déroulement ───────────── */

export async function reportLate(user: CurrentUser, assignmentId: string, minutes: number) {
  const { a, s } = await loadAssignment(assignmentId);
  if (user.id !== a.providerId && user.id !== a.requesterId) throw forbidden();
  if (!["confirmed", "in_progress"].includes(a.status)) throw badRequest("Mission non active");
  if (minutes < 1 || minutes > 240) throw badRequest("Retard invalide");
  if (user.id === a.providerId) await db.update(serviceAssignments).set({ lateMinutes: minutes }).where(eq(serviceAssignments.id, assignmentId));
  const other = user.id === a.providerId ? a.requesterId : a.providerId;
  await systemMessage(await convFor(a), `⏱ ${user.firstName} signale un retard d'environ ${minutes} min.`, { action: { type: "late", lateMinutes: minutes } });
  await notify({ userId: other, type: "mission_late", title: "Retard signalé", body: `${user.firstName} aura environ ${minutes} min de retard pour « ${s.title} ».`, link: `/messages/${a.conversationId}` });
  await changed(a);
}

/** Mission avec achats à avancer : rien ne commence tant que la tirelire n'est pas remplie. */
async function assertEscrowFilled(a: typeof serviceAssignments.$inferSelect) {
  if (!a.purchaseCents) return;
  const pay = await paymentForAssignment(a.id);
  if (!pay || !["authorized", "captured"].includes(pay.status))
    throw badRequest(`Le demandeur doit d'abord bloquer ${formatEUR(a.agreedPriceCents + a.purchaseCents)} dans la tirelire ENTOUR. N'avancez aucun achat avant.`);
}

export async function startMission(user: CurrentUser, assignmentId: string) {
  const { a, s } = await loadAssignment(assignmentId);
  if (user.id !== a.providerId) throw forbidden();
  await assertEscrowFilled(a);
  if (a.status !== "confirmed") throw badRequest("Mission déjà démarrée ou terminée");
  await db.update(serviceAssignments).set({ status: "in_progress", startedAt: new Date() }).where(eq(serviceAssignments.id, assignmentId));
  await db.update(services).set({ status: "in_progress" }).where(and(eq(services.id, s.id), inArray(services.status, ["open", "assigned"])));
  await systemMessage(await convFor(a), `▶ ${user.firstName} a démarré la mission.`);
  await changed(a);
}

export async function markDoneByProvider(user: CurrentUser, assignmentId: string) {
  const { a, s } = await loadAssignment(assignmentId);
  if (user.id !== a.providerId) throw forbidden();
  await assertEscrowFilled(a);
  if (!["confirmed", "in_progress"].includes(a.status)) throw badRequest("Mission non active");
  await db.update(serviceAssignments).set({ status: "provider_done", providerDoneAt: new Date(), startedAt: a.startedAt ?? new Date() }).where(eq(serviceAssignments.id, assignmentId));
  await systemMessage(await convFor(a), `✅ ${user.firstName} indique avoir terminé la mission. ${"Le demandeur doit confirmer la fin pour débloquer le paiement."}`, { action: { type: "provider_done" } });
  await notify({ userId: a.requesterId, type: "mission_done", title: "Mission terminée ?", body: `${user.firstName} indique avoir terminé « ${s.title} ». Confirmez pour clôturer.`, link: `/messages/${a.conversationId}`, email: true });
  await changed(a);
}

/** Confirmation de fin par le demandeur : clôture, versement, réputation, récurrence. */
export async function confirmCompletion(user: CurrentUser, assignmentId: string) {
  const { a, s } = await loadAssignment(assignmentId);
  if (user.id !== a.requesterId) throw forbidden();
  if (!["confirmed", "in_progress", "provider_done"].includes(a.status)) throw badRequest("Cette mission ne peut pas être clôturée");
  const settings = await getSettings();
  const pay = await paymentForAssignment(a.id);
  if (pay && pay.status === "requires_payment") throw badRequest("Sécurisez d'abord le paiement, ou annulez-le, avant de clôturer.");
  if (a.purchaseCents && (!pay || pay.status !== "authorized")) throw badRequest("Remplissez d'abord la tirelire : l'intervenant doit être remboursé de ses achats.");

  const [updated] = await db
    .update(serviceAssignments)
    .set({ status: "completed", completedAt: new Date(), providerDoneAt: a.providerDoneAt ?? new Date() })
    .where(and(eq(serviceAssignments.id, assignmentId), inArray(serviceAssignments.status, ["confirmed", "in_progress", "provider_done"])))
    .returning();
  if (!updated) throw conflict("Mission déjà clôturée");

  const captured = await capturePayment(a.id);
  const remaining = await db
    .select({ id: serviceAssignments.id })
    .from(serviceAssignments)
    .where(and(eq(serviceAssignments.serviceId, s.id), inArray(serviceAssignments.status, ["confirmed", "in_progress", "provider_done", "disputed"])));
  const [{ active }] = await db
    .select({ active: sql<number>`count(*)::int` })
    .from(serviceAssignments)
    .where(and(eq(serviceAssignments.serviceId, s.id), sql`${serviceAssignments.status} <> 'cancelled'`));
  if (!remaining.length && active >= s.peopleNeeded) await db.update(services).set({ status: "completed", completedAt: new Date() }).where(eq(services.id, s.id));

  await systemMessage(
    await convFor(a),
    `🎉 Mission terminée et confirmée${captured ? ` — paiement de ${formatEUR(captured.amountCents - captured.feeCents)} versé à l'intervenant${captured.provider === "simulation" ? " (SIMULATION)" : ""}` : ""}. Pensez à laisser un avis !`,
    { action: { type: "completed" } },
  );
  await notify({ userId: a.providerId, type: "mission_completed", title: "Mission validée 🎉", body: `${user.firstName} a confirmé la fin de « ${s.title} ». Laissez-lui un avis !`, link: `/avis/${a.id}` });

  for (const uid of [a.providerId, a.requesterId]) {
    await recomputeStats(uid);
    await addPoints(uid, settings.loyalty.pointsPerMission, "mission", a.id);
    await evaluateBadges(uid);
  }
  await qualifyReferral(a.providerId, settings.referral.rewardPoints);
  await qualifyReferral(a.requesterId, settings.referral.rewardPoints);
  if (s.timingType === "recurring" && s.recurrence) await scheduleNextOccurrence(s.id);
  await changed(a);
}

async function qualifyReferral(userId: string, points: number) {
  const [r] = await db.select().from(referrals).where(and(eq(referrals.referredId, userId), eq(referrals.status, "pending")));
  if (!r) return;
  await db.update(referrals).set({ status: "rewarded", qualifiedAt: new Date() }).where(eq(referrals.id, r.id));
  await addPoints(r.referrerId, points, "referral", r.id);
  await addPoints(userId, Math.round(points / 2), "referral_welcome", r.id);
  await notify({ userId: r.referrerId, type: "referral", title: "Parrainage validé", body: `Votre filleul a réalisé sa première mission : +${points} points !`, link: "/parrainage" });
}

/** Mission récurrente : crée automatiquement la prochaine occurrence avec le même intervenant pressenti. */
export async function scheduleNextOccurrence(serviceId: string) {
  const [s] = await db.select().from(services).where(eq(services.id, serviceId));
  if (!s?.recurrence || !s.startsAt) return null;
  const next = new Date(s.startsAt);
  const step = s.recurrence.interval || 1;
  if (s.recurrence.freq === "daily") next.setDate(next.getDate() + step);
  if (s.recurrence.freq === "weekly") next.setDate(next.getDate() + 7 * step);
  if (s.recurrence.freq === "monthly") next.setMonth(next.getMonth() + step);
  while (next.getTime() < Date.now()) {
    if (s.recurrence.freq === "daily") next.setDate(next.getDate() + step);
    else if (s.recurrence.freq === "weekly") next.setDate(next.getDate() + 7 * step);
    else next.setMonth(next.getMonth() + step);
  }
  if (s.recurrence.until && next > new Date(s.recurrence.until)) return null;
  const [exists] = await db.select({ id: services.id }).from(services).where(and(eq(services.parentServiceId, s.id), eq(services.startsAt, next)));
  if (exists) return null;
  const { id: _id, createdAt: _c, updatedAt: _u, completedAt: _co, cancelledAt: _ca, viewsCount: _v, inviteCode: _i, ...rest } = s;
  const [n] = await db
    .insert(services)
    .values({ ...rest, status: "open", startsAt: next, parentServiceId: s.id, expiresAt: new Date(next.getTime() + 2 * 3600_000), boostedUntil: null, cancelReason: null })
    .returning();
  // Proposition prioritaire à l'intervenant précédent
  const [prev] = await db.select().from(serviceAssignments).where(and(eq(serviceAssignments.serviceId, s.id), eq(serviceAssignments.status, "completed"))).limit(1);
  if (prev)
    await notify({ userId: prev.providerId, type: "new_mission", title: "Prochaine occurrence disponible", body: `« ${s.title} » revient le ${formatWhen(next)}. Vous êtes prioritaire !`, link: `/missions/${n.id}` });
  await notify({ userId: s.requesterId, type: "system", title: "Prochaine occurrence publiée", body: `« ${s.title} » est republiée pour le ${formatWhen(next)}.`, link: `/missions/${n.id}` });
  return n;
}

export async function cancelAssignment(user: CurrentUser, assignmentId: string, reason: string) {
  const { a, s } = await loadAssignment(assignmentId);
  if (user.id !== a.providerId && user.id !== a.requesterId && !user.adminRole) throw forbidden();
  if (!["confirmed", "in_progress", "provider_done"].includes(a.status)) throw badRequest("Cette mission ne peut plus être annulée");
  if (!reason.trim()) throw badRequest("Indiquez un motif d'annulation");
  await db.update(serviceAssignments).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: user.id, cancelReason: reason.slice(0, 500) }).where(eq(serviceAssignments.id, assignmentId));
  const money = await cancelOrRefund(a.id);
  // La demande redevient ouverte si elle n'était pas annulée par le demandeur
  if (s.status !== "cancelled" && (!s.startsAt || s.startsAt > new Date())) {
    await db.update(services).set({ status: "open", updatedAt: new Date() }).where(and(eq(services.id, s.id), inArray(services.status, ["assigned", "in_progress"])));
    await promoteWaitlist(s.id);
  }
  const other = user.id === a.providerId ? a.requesterId : a.providerId;
  await systemMessage(
    await convFor(a),
    `❌ Mission annulée par ${user.firstName}. Motif : ${reason.slice(0, 300)}${money?.action === "released" ? " — l'autorisation de paiement a été levée." : money?.action === "refunded" ? ` — ${formatEUR(money.amount)} remboursés.` : ""}`,
    { action: { type: "cancelled" } },
  );
  await notify({ userId: other, type: "mission_cancelled", title: "Mission annulée", body: `${user.firstName} a annulé « ${s.title} ». Motif : ${reason.slice(0, 140)}`, link: `/missions/${s.id}`, email: true });
  await recomputeStats(user.id);
  await changed(a);
}

export async function openDispute(user: CurrentUser, assignmentId: string, input: { reason: string; description: string }) {
  const { a, s } = await loadAssignment(assignmentId);
  if (user.id !== a.providerId && user.id !== a.requesterId) throw forbidden();
  if (!["confirmed", "in_progress", "provider_done", "completed"].includes(a.status)) throw badRequest("Impossible d'ouvrir un litige sur cette mission");
  if (a.status === "completed" && a.completedAt && Date.now() - a.completedAt.getTime() > 14 * 86400_000) throw badRequest("Le délai d'ouverture d'un litige (14 jours) est dépassé");
  const pay = await paymentForAssignment(a.id);
  const [d] = await db
    .insert(disputes)
    .values({ assignmentId, paymentId: pay?.id ?? null, openedBy: user.id, reason: input.reason.slice(0, 120), description: input.description.slice(0, 3000) })
    .onConflictDoNothing()
    .returning();
  if (!d) throw conflict("Un litige est déjà en cours pour cette mission");
  if (a.status !== "completed") await db.update(serviceAssignments).set({ status: "disputed" }).where(eq(serviceAssignments.id, assignmentId));
  const other = user.id === a.providerId ? a.requesterId : a.providerId;
  await systemMessage(await convFor(a), `⚠️ ${user.firstName} a ouvert un litige. L'équipe ENTOUR va examiner la situation ; le paiement est gelé en attendant.`, { action: { type: "dispute" } });
  await notify({ userId: other, type: "dispute", title: "Litige ouvert", body: `Un litige a été ouvert sur « ${s.title} ». Notre équipe vous contactera.`, link: `/missions/${s.id}`, email: true });
  await changed(a);
  return d;
}

/** Missions de l'utilisateur côté intervenant et côté demandeur (calendrier, historique). */
export async function myAssignments(userId: string) {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select a.id, a.status, a.agreed_price_cents, coalesce(a.starts_at, s.starts_at) as starts_at, a.conversation_id, a.completed_at, a.created_at,
      s.id as service_id, s.title, s.duration_minutes, s.area_label, c.name as category_name, c.icon as category_icon, c.color as category_color,
      case when a.provider_id = ${userId} then 'provider' else 'requester' end as role,
      po.first_name as other_name, po.avatar_url as other_avatar, po.user_id as other_id,
      exists (select 1 from reviews r where r.assignment_id = a.id and r.author_id = ${userId}) as reviewed,
      p.status as payment_status, p.provider as payment_provider
    from service_assignments a
    join services s on s.id = a.service_id
    join categories c on c.id = s.category_id
    join user_profiles po on po.user_id = case when a.provider_id = ${userId} then a.requester_id else a.provider_id end
    left join payments p on p.assignment_id = a.id
    where a.provider_id = ${userId} or a.requester_id = ${userId}
    order by coalesce(a.starts_at, s.starts_at, a.created_at) desc
    limit 300`);
  return rows.map((r) => ({
    id: String(r.id),
    status: String(r.status),
    agreedPriceCents: Number(r.agreed_price_cents),
    startsAt: r.starts_at ? new Date(r.starts_at as string).toISOString() : null,
    conversationId: (r.conversation_id as string) ?? null,
    completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null,
    serviceId: String(r.service_id),
    title: String(r.title),
    durationMinutes: r.duration_minutes == null ? null : Number(r.duration_minutes),
    areaLabel: String(r.area_label),
    category: { name: String(r.category_name), icon: String(r.category_icon), color: String(r.category_color) },
    role: r.role as "provider" | "requester",
    other: { id: String(r.other_id), firstName: String(r.other_name), avatarUrl: (r.other_avatar as string) ?? null },
    reviewed: !!r.reviewed,
    paymentStatus: (r.payment_status as string) ?? null,
    paymentProvider: (r.payment_provider as string) ?? null,
  }));
}
export type MyAssignment = Awaited<ReturnType<typeof myAssignments>>[number];

export async function workedWith(userId: string) {
  return db.execute<Record<string, unknown>>(sql`
    select o.user_id as id, o.first_name, o.avatar_url, o.rating_avg, o.rating_count, count(*)::int as missions, max(a.completed_at) as last_at
    from service_assignments a
    join user_profiles o on o.user_id = case when a.provider_id = ${userId} then a.requester_id else a.provider_id end
    where (a.provider_id = ${userId} or a.requester_id = ${userId}) and a.status = 'completed'
    group by o.user_id, o.first_name, o.avatar_url, o.rating_avg, o.rating_count
    order by last_at desc limit 100`);
}

export async function profileExists(userId: string) {
  const [p] = await db.select({ id: userProfiles.userId }).from(userProfiles).where(eq(userProfiles.userId, userId));
  return !!p;
}
