import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewCriteria, reviews, serviceAssignments, services, userProfiles } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import type { z } from "zod";
import type { reviewSchema } from "@/lib/validators";
import { notify } from "./notifications";
import { addPoints, evaluateBadges, recomputeStats } from "./reputation";

/** Contexte d'évaluation : seuls les participants d'une mission réellement terminée peuvent noter. */
export async function reviewContext(user: CurrentUser, assignmentId: string) {
  const [row] = await db
    .select({ a: serviceAssignments, title: services.title })
    .from(serviceAssignments)
    .innerJoin(services, eq(services.id, serviceAssignments.serviceId))
    .where(eq(serviceAssignments.id, assignmentId));
  if (!row) throw notFound("Mission");
  const { a } = row;
  if (user.id !== a.providerId && user.id !== a.requesterId) throw forbidden();
  const targetId = user.id === a.providerId ? a.requesterId : a.providerId;
  const [target] = await db.select({ firstName: userProfiles.firstName, avatarUrl: userProfiles.avatarUrl }).from(userProfiles).where(eq(userProfiles.userId, targetId));
  const [existing] = await db.select().from(reviews).where(and(eq(reviews.assignmentId, assignmentId), eq(reviews.authorId, user.id)));
  return {
    assignmentId,
    serviceTitle: row.title,
    status: a.status,
    completedAt: a.completedAt?.toISOString() ?? null,
    role: user.id === a.providerId ? ("as_provider" as const) : ("as_requester" as const),
    target: { id: targetId, ...target },
    alreadyReviewed: !!existing,
  };
}

export async function createReview(user: CurrentUser, assignmentId: string, input: z.infer<typeof reviewSchema>) {
  const ctx = await reviewContext(user, assignmentId);
  if (ctx.status !== "completed") throw badRequest("Vous pourrez évaluer une fois la mission terminée et confirmée");
  if (ctx.completedAt && Date.now() - new Date(ctx.completedAt).getTime() > 30 * 86400_000) throw badRequest("Le délai pour laisser un avis (30 jours) est dépassé");
  if (ctx.alreadyReviewed) throw conflict("Vous avez déjà évalué cette mission");
  const [a] = await db.select().from(serviceAssignments).where(eq(serviceAssignments.id, assignmentId));
  const review = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(reviews)
      .values({ assignmentId, serviceId: a.serviceId, authorId: user.id, targetId: ctx.target.id, role: ctx.role, rating: input.rating, comment: input.comment })
      .returning();
    const entries = Object.entries(input.criteria).filter(([, v]) => v != null) as [keyof typeof input.criteria, number][];
    if (entries.length) await tx.insert(reviewCriteria).values(entries.map(([criterion, score]) => ({ reviewId: r.id, criterion, score })));
    return r;
  });
  const settings = await getSettings();
  await recomputeStats(ctx.target.id);
  await evaluateBadges(ctx.target.id);
  await addPoints(user.id, settings.loyalty.pointsPerReview, "review", review.id);
  await notify({ userId: ctx.target.id, type: "review_received", title: `${user.firstName} vous a laissé un avis`, body: `${"★".repeat(input.rating)}${"☆".repeat(5 - input.rating)} ${input.comment.slice(0, 100)}`, link: `/u/${ctx.target.id}` });
  return review;
}

export async function replyToReview(user: CurrentUser, reviewId: string, reply: string) {
  const [r] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
  if (!r || r.targetId !== user.id) throw notFound("Avis");
  if (r.reply) throw conflict("Vous avez déjà répondu à cet avis");
  await db.update(reviews).set({ reply: reply.trim().slice(0, 800) }).where(eq(reviews.id, reviewId));
}
