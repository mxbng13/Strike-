import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, conversations, favorites, follows, messages, posts, reports, reviews, services, userProfiles, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { z } from "zod";
import type { reportSchema } from "@/lib/validators";
import { notify } from "./notifications";

/* ───────────── Signalements ───────────── */

async function resolveTargetUser(type: string, id: string): Promise<string | null> {
  switch (type) {
    case "user":
      return (await db.select({ id: users.id }).from(users).where(eq(users.id, id)))[0]?.id ?? null;
    case "service":
      return (await db.select({ id: services.requesterId }).from(services).where(eq(services.id, id)))[0]?.id ?? null;
    case "message":
      return (await db.select({ id: messages.senderId }).from(messages).where(eq(messages.id, id)))[0]?.id ?? null;
    case "review":
      return (await db.select({ id: reviews.authorId }).from(reviews).where(eq(reviews.id, id)))[0]?.id ?? null;
    case "post":
      return (await db.select({ id: posts.authorId }).from(posts).where(eq(posts.id, id)))[0]?.id ?? null;
    default:
      return null;
  }
}

export async function createReport(user: CurrentUser, input: z.infer<typeof reportSchema>) {
  await rateLimit(`report:${user.id}`, 20, 86400);
  const targetUserId = await resolveTargetUser(input.targetType, input.targetId);
  if (input.targetType !== "conversation" && !targetUserId) throw notFound("Élément signalé");
  if (targetUserId === user.id) throw badRequest("Vous ne pouvez pas vous signaler vous-même");
  if (input.targetType === "conversation") {
    const isMember = await db.execute(sql`select 1 from conversation_members where conversation_id = ${input.targetId} and user_id = ${user.id}`);
    if (!isMember.length) throw notFound("Conversation");
    await db.update(conversations).set({ reported: true }).where(eq(conversations.id, input.targetId));
  }
  if (input.targetType === "review") await db.update(reviews).set({ status: "under_review" }).where(eq(reviews.id, input.targetId));
  const [r] = await db
    .insert(reports)
    .values({ reporterId: user.id, targetType: input.targetType, targetId: input.targetId, targetUserId, reason: input.reason, details: input.details })
    .onConflictDoNothing()
    .returning();
  if (!r) throw conflict("Vous avez déjà signalé cet élément ; il est en cours d'examen");
  // Signal de risque : plusieurs signalements distincts sur une même personne
  if (targetUserId) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
      .from(reports)
      .where(and(eq(reports.targetUserId, targetUserId), sql`${reports.createdAt} > now() - interval '30 days'`));
    await db.update(users).set({ riskScore: Math.min(100, n * 15) }).where(eq(users.id, targetUserId));
  }
  return r;
}

/* ───────────── Blocage ───────────── */

export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw badRequest("Action impossible");
  await db.insert(blocks).values({ blockerId: userId, blockedId: targetId }).onConflictDoNothing();
  await db.delete(follows).where(sql`(${follows.followerId} = ${userId} and ${follows.followeeId} = ${targetId}) or (${follows.followerId} = ${targetId} and ${follows.followeeId} = ${userId})`);
}

export async function unblockUser(userId: string, targetId: string) {
  await db.delete(blocks).where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, targetId)));
}

export async function listBlocked(userId: string) {
  return db
    .select({ id: blocks.blockedId, firstName: userProfiles.firstName, avatarUrl: userProfiles.avatarUrl, at: blocks.createdAt })
    .from(blocks)
    .innerJoin(userProfiles, eq(userProfiles.userId, blocks.blockedId))
    .where(eq(blocks.blockerId, userId));
}

/* ───────────── Favoris, confiance, abonnements ───────────── */

export async function toggleFavorite(userId: string, kind: "service" | "user" | "trusted", targetId: string) {
  const cond = and(eq(favorites.userId, userId), eq(favorites.kind, kind), eq(favorites.targetId, targetId));
  const [existing] = await db.select().from(favorites).where(cond);
  if (existing) {
    await db.delete(favorites).where(cond);
    return false;
  }
  await db.insert(favorites).values({ userId, kind, targetId });
  return true;
}

export async function listFavorites(userId: string) {
  const svc = await db.execute<Record<string, unknown>>(sql`
    select s.id, s.title, s.status, s.budget_cents, s.pricing_type, s.area_label, s.starts_at, c.name as category_name, c.icon, c.color
    from favorites f join services s on s.id = f.target_id join categories c on c.id = s.category_id
    where f.user_id = ${userId} and f.kind = 'service' order by f.created_at desc`);
  const people = await db.execute<Record<string, unknown>>(sql`
    select p.user_id as id, p.first_name, p.avatar_url, p.rating_avg, p.rating_count, p.missions_done, f.kind,
      (p.available_until is not null and p.available_until > now()) as available_now
    from favorites f join user_profiles p on p.user_id = f.target_id join users u on u.id = p.user_id and u.status = 'active'
    where f.user_id = ${userId} and f.kind in ('user','trusted') order by f.kind desc, f.created_at desc`);
  return { services: svc, people };
}

export async function favoriteFlags(userId: string, targetIds: string[]) {
  if (!targetIds.length) return [];
  return db.select().from(favorites).where(and(eq(favorites.userId, userId), sql`${favorites.targetId} in ${targetIds}`));
}

export async function toggleFollow(userId: string, targetId: string, followerName: string) {
  if (userId === targetId) throw badRequest("Action impossible");
  const cond = and(eq(follows.followerId, userId), eq(follows.followeeId, targetId));
  const [existing] = await db.select().from(follows).where(cond);
  if (existing) {
    await db.delete(follows).where(cond);
    return false;
  }
  await db.insert(follows).values({ followerId: userId, followeeId: targetId });
  await notify({ userId: targetId, type: "follow", title: `${followerName} vous suit`, body: "Vos nouvelles disponibilités lui seront signalées.", link: `/u/${userId}`, dedupeKey: `follow:${userId}` });
  return true;
}

export async function relationFlags(viewerId: string, targetId: string) {
  const [fav] = await db.select().from(favorites).where(and(eq(favorites.userId, viewerId), eq(favorites.kind, "user"), eq(favorites.targetId, targetId)));
  const [trusted] = await db.select().from(favorites).where(and(eq(favorites.userId, viewerId), eq(favorites.kind, "trusted"), eq(favorites.targetId, targetId)));
  const [fol] = await db.select().from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)));
  const [blk] = await db.select().from(blocks).where(and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, targetId)));
  const [{ followers }] = await db.select({ followers: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followeeId, targetId));
  return { favorite: !!fav, trusted: !!trusted, following: !!fol, blocked: !!blk, followers };
}

export async function myReports(userId: string) {
  return db.select().from(reports).where(eq(reports.reporterId, userId)).orderBy(desc(reports.createdAt)).limit(50);
}
