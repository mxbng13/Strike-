/**
 * « Client injoignable » : l'intervenant a avancé des achats (ex. la commande au restaurant) et le demandeur
 * ne répond plus. Il envoie la preuve d'achat ; ENTOUR l'analyse puis un membre de l'équipe décide.
 * En cas d'accord, ENTOUR ne verse que le prix des achats (sans commission ni rémunération) ;
 * le reste de la tirelire est rendu au demandeur.
 */
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, purchaseClaims, serviceAssignments, services, uploads, userProfiles, users } from "@/db/schema";
import { logAdmin } from "@/lib/audit";
import type { AdminRole, CurrentUser } from "@/lib/auth";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { formatEUR } from "@/lib/money";
import { analyzeReceipt } from "@/lib/receipt";
import { getSettings } from "@/lib/settings";
import { getObject } from "@/lib/storage";
import { systemMessage } from "./conversations";
import { notify } from "./notifications";
import { captureForPurchaseRefund, paymentForAssignment } from "./payments";
import { recomputeStats } from "./reputation";

export async function createPurchaseClaim(user: CurrentUser, assignmentId: string, input: { receiptKey: string; claimedCents: number; note: string }) {
  const [a] = await db.select().from(serviceAssignments).where(eq(serviceAssignments.id, assignmentId));
  if (!a) throw notFound("Mission");
  if (a.providerId !== user.id) throw forbidden("Seul l'intervenant peut signaler un client injoignable");
  if (!a.purchaseCents) throw badRequest("Cette mission ne comporte pas d'achats à avancer");
  if (!["confirmed", "in_progress", "provider_done"].includes(a.status)) throw badRequest("Cette mission n'est plus en cours");
  const pay = await paymentForAssignment(a.id);
  if (!pay || pay.status !== "authorized") throw badRequest("La tirelire n'a pas été remplie : aucun achat n'aurait dû être avancé");
  if (input.claimedCents <= 0 || input.claimedCents > a.purchaseCents)
    throw badRequest(`Le montant ne peut pas dépasser les achats prévus (${formatEUR(a.purchaseCents)})`);

  // Le demandeur doit être réellement silencieux depuis un certain temps
  const settings = await getSettings();
  const [last] = await db
    .select({ at: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, a.conversationId!), eq(messages.senderId, a.requesterId)))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const silentSince = last?.at ?? a.createdAt;
  const minutes = (Date.now() - silentSince.getTime()) / 60_000;
  if (minutes < settings.purchaseClaims.minSilenceMinutes)
    throw badRequest(`Le demandeur a écrit il y a moins de ${Math.ceil(settings.purchaseClaims.minSilenceMinutes / 60)} h. Relancez-le dans la conversation avant de signaler.`);

  // La preuve doit être un fichier envoyé par l'intervenant dans la conversation de la mission
  const [file] = await db.select().from(uploads).where(and(eq(uploads.storageKey, input.receiptKey), eq(uploads.ownerId, user.id)));
  if (!file || file.conversationId !== a.conversationId) throw badRequest("Preuve d'achat invalide");
  if (!/^image\/|^application\/pdf$/.test(file.mimeType)) throw badRequest("Envoyez une photo ou un PDF du ticket");

  const [s] = await db.select({ title: services.title, note: services.purchaseNote }).from(services).where(eq(services.id, a.serviceId));
  const buf = await getObject(file.storageKey);
  const analysis = buf ? await analyzeReceipt(buf, file.mimeType, input.claimedCents, `${s?.title ?? ""} — ${s?.note ?? ""}`) : { source: "none" as const, notes: "Fichier introuvable" };

  const [claim] = await db
    .insert(purchaseClaims)
    .values({ assignmentId, providerId: user.id, receiptKey: file.storageKey, claimedCents: input.claimedCents, note: input.note.slice(0, 1000), previousStatus: a.status, analysis })
    .onConflictDoNothing()
    .returning();
  if (!claim) throw conflict("Un signalement est déjà en cours d'examen pour cette mission");
  await db.update(serviceAssignments).set({ status: "disputed" }).where(eq(serviceAssignments.id, assignmentId));

  await systemMessage(
    a.conversationId!,
    `⚠️ ${user.firstName} signale ne plus avoir de réponse après avoir avancé ${formatEUR(input.claimedCents)} d'achats et a transmis la preuve d'achat à ENTOUR. L'équipe va l'examiner ; si le signalement est justifié, seul le prix des achats sera versé à ${user.firstName}. Répondez dans la conversation pour donner votre version.`,
    { action: { type: "purchase_claim" } },
  );
  await notify({ userId: a.requesterId, type: "dispute", title: "Votre intervenant n'arrive plus à vous joindre", body: `Il a avancé ${formatEUR(input.claimedCents)} d'achats pour vous. Répondez-lui rapidement.`, link: `/messages/${a.conversationId}`, email: true });
  return claim;
}

export async function listPurchaseClaims(status: "pending" | "all" = "pending") {
  return db.execute<Record<string, unknown>>(sql`
    select c.*, s.title as service_title, s.id as service_id, s.purchase_note, a.purchase_cents, a.agreed_price_cents, a.conversation_id, a.requester_id,
      pp.first_name as provider_name, rp.first_name as requester_name, p.amount_cents as escrow_cents, p.provider as payment_provider, p.status as payment_status,
      (select max(m.created_at) from messages m where m.conversation_id = a.conversation_id and m.sender_id = a.requester_id) as requester_last_message
    from purchase_claims c
    join service_assignments a on a.id = c.assignment_id
    join services s on s.id = a.service_id
    join user_profiles pp on pp.user_id = c.provider_id
    join user_profiles rp on rp.user_id = a.requester_id
    left join payments p on p.assignment_id = a.id
    ${status === "pending" ? sql`where c.status = 'pending'` : sql``}
    order by c.created_at desc limit 200`);
}

export async function decidePurchaseClaim(admin: CurrentUser & { adminRole: AdminRole }, claimId: string, input: { approve: boolean; refundCents?: number; note: string }, ip: string | null) {
  const [c] = await db.select().from(purchaseClaims).where(eq(purchaseClaims.id, claimId));
  if (!c) throw notFound("Signalement");
  if (c.status !== "pending") throw badRequest("Signalement déjà traité");
  const [a] = await db.select().from(serviceAssignments).where(eq(serviceAssignments.id, c.assignmentId));
  const [prov] = await db.select({ firstName: userProfiles.firstName }).from(userProfiles).where(eq(userProfiles.userId, c.providerId));

  if (input.approve) {
    const amount = Math.min(input.refundCents ?? c.claimedCents, c.claimedCents, a.purchaseCents);
    const r = await captureForPurchaseRefund(a.id, amount);
    await db.update(purchaseClaims).set({ status: "approved", refundedCents: r.amount, decidedBy: admin.id, decisionNote: input.note, decidedAt: new Date() }).where(eq(purchaseClaims.id, claimId));
    await db
      .update(serviceAssignments)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: a.requesterId, cancelReason: "Client injoignable : achats remboursés à l'intervenant par ENTOUR" })
      .where(eq(serviceAssignments.id, a.id));
    await db.update(users).set({ riskScore: sql`least(100, ${users.riskScore} + 20)` }).where(eq(users.id, a.requesterId));
    await systemMessage(a.conversationId!, `Décision ENTOUR : ${formatEUR(r.amount)} versés à ${prov?.firstName ?? "l'intervenant"} pour rembourser les achats (sans commission). Les ${formatEUR(r.released)} restants de la tirelire sont rendus au demandeur. ${input.note}`.trim());
    await notify({ userId: c.providerId, type: "payment", title: "Achats remboursés", body: `${formatEUR(r.amount)} vous sont versés.`, link: "/revenus", email: true });
    await notify({ userId: a.requesterId, type: "dispute", title: "Décision sur votre mission", body: `${formatEUR(r.amount)} d'achats ont été versés à l'intervenant ; ${formatEUR(r.released)} vous sont rendus.`, link: `/messages/${a.conversationId}`, email: true });
    await recomputeStats(a.requesterId);
  } else {
    await db.update(purchaseClaims).set({ status: "rejected", decidedBy: admin.id, decisionNote: input.note, decidedAt: new Date() }).where(eq(purchaseClaims.id, claimId));
    await db.update(serviceAssignments).set({ status: c.previousStatus as typeof a.status }).where(eq(serviceAssignments.id, a.id));
    await systemMessage(a.conversationId!, `Décision ENTOUR : le signalement n'a pas été retenu. ${input.note}`.trim());
    await notify({ userId: c.providerId, type: "dispute", title: "Signalement non retenu", body: input.note || "La preuve transmise n'a pas permis de valider le remboursement.", link: `/messages/${a.conversationId}` });
  }
  await logAdmin(admin.id, `purchase_claim.${input.approve ? "approve" : "reject"}`, { type: "purchase_claim", id: claimId }, { refundCents: input.refundCents ?? null, note: input.note }, ip);
}
