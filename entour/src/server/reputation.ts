import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { badges, pointsLedger, userBadges, userProfiles, users, type BadgeRule } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { notify } from "./notifications";

/** Recalcule les statistiques de réputation d'un membre à partir des données réelles. */
export async function recomputeStats(userId: string) {
  await db.execute(sql`
    update user_profiles p set
      rating_avg = coalesce((select avg(rating)::float from reviews where target_id = ${userId} and status = 'visible'), 0),
      rating_count = (select count(*) from reviews where target_id = ${userId} and status = 'visible'),
      provider_rating_avg = coalesce((select avg(rating)::float from reviews where target_id = ${userId} and status = 'visible' and role = 'as_requester'), 0),
      provider_rating_count = (select count(*) from reviews where target_id = ${userId} and status = 'visible' and role = 'as_requester'),
      missions_done = (select count(*) from service_assignments where provider_id = ${userId} and status = 'completed'),
      missions_requested = (select count(*) from services where requester_id = ${userId} and status = 'completed'),
      missions_cancelled = (select count(*) from service_assignments where cancelled_by = ${userId} and status = 'cancelled'),
      on_time_count = (select count(*) from service_assignments where provider_id = ${userId} and status = 'completed' and coalesce(late_minutes, 0) <= 5),
      late_count = (select count(*) from service_assignments where provider_id = ${userId} and status = 'completed' and late_minutes > 5),
      updated_at = now()
    where p.user_id = ${userId}`);
}

export async function addPoints(userId: string, points: number, reason: string, refId: string) {
  const inserted = await db.insert(pointsLedger).values({ userId, points, reason, refId }).onConflictDoNothing().returning();
  if (inserted.length) await db.update(userProfiles).set({ points: sql`${userProfiles.points} + ${points}` }).where(eq(userProfiles.userId, userId));
}

export function levelFor(points: number, thresholds: number[]) {
  let level = 1;
  thresholds.forEach((t, i) => {
    if (points >= t) level = i + 1;
  });
  const next = thresholds[level] ?? null;
  const current = thresholds[level - 1] ?? 0;
  const names = ["Voisin", "Voisin engagé", "Pilier du quartier", "Ambassadeur", "Référence locale", "Légende ENTOUR"];
  return { level, name: names[level - 1] ?? `Niveau ${level}`, current, next, progress: next ? (points - current) / (next - current) : 1 };
}

async function ruleSatisfied(userId: string, rule: BadgeRule): Promise<boolean> {
  const one = async (q: ReturnType<typeof sql>) => {
    const r = await db.execute<{ v: unknown }>(q);
    return r[0]?.v;
  };
  switch (rule.type) {
    case "account_created":
      return true;
    case "missions_done":
      return Number(await one(sql`select missions_done as v from user_profiles where user_id = ${userId}`)) >= rule.min;
    case "rating": {
      const [p] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
      return !!p && p.ratingCount >= rule.minCount && p.ratingAvg >= rule.min;
    }
    case "punctuality": {
      const [p] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
      const n = (p?.onTimeCount ?? 0) + (p?.lateCount ?? 0);
      return n >= rule.minCount && (p!.onTimeCount / n) >= rule.minRate;
    }
    case "category_missions":
      return (
        Number(
          await one(sql`select count(*)::int as v from service_assignments a join services s on s.id = a.service_id join categories c on c.id = s.category_id
            where a.provider_id = ${userId} and a.status = 'completed' and c.group_name = ${rule.categoryGroup}`),
        ) >= rule.min
      );
    case "verified": {
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      return !!u?.phoneVerifiedAt && !!u?.identityVerifiedAt;
    }
    case "active_days":
      return (
        Number(
          await one(sql`select (
            (select count(*) from service_assignments where provider_id = ${userId} and created_at > now() - make_interval(days => ${rule.days})) +
            (select count(*) from services where requester_id = ${userId} and created_at > now() - make_interval(days => ${rule.days}))
          )::int as v`),
        ) >= rule.minActions
      );
    case "reliability": {
      const [p] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
      const n = (p?.missionsDone ?? 0) + (p?.missionsCancelled ?? 0);
      return n >= rule.minCount && p!.missionsCancelled / n <= rule.maxCancelRate;
    }
    case "criterion_avg": {
      const r = await db.execute<{ avg: number; n: number }>(sql`select avg(rc.score)::float as avg, count(*)::int as n from review_criteria rc
        join reviews r on r.id = rc.review_id where r.target_id = ${userId} and r.status = 'visible' and rc.criterion = ${rule.criterion}`);
      return Number(r[0]?.n ?? 0) >= rule.minCount && Number(r[0]?.avg ?? 0) >= rule.min;
    }
    case "neighbor":
      return Number(await one(sql`select count(distinct requester_id)::int as v from service_assignments where provider_id = ${userId} and status = 'completed'`)) >= rule.minDistinctPeople;
    case "season": {
      const months = rule.months;
      return (
        Number(
          await one(sql`select count(*)::int as v from service_assignments where provider_id = ${userId} and status = 'completed'
            and extract(month from completed_at at time zone 'Europe/Paris')::int = any(${sql.raw(`ARRAY[${months.map(Number).join(",")}]`)})
            and completed_at > now() - interval '12 months'`),
        ) >= rule.min
      );
    }
    case "manual":
      return false;
  }
}

/** Attribue automatiquement les badges dont les critères sont remplis. */
export async function evaluateBadges(userId: string) {
  const all = await db.select().from(badges).where(eq(badges.isActive, true));
  const owned = new Set((await db.select({ id: userBadges.badgeId }).from(userBadges).where(eq(userBadges.userId, userId))).map((b) => b.id));
  const awarded: string[] = [];
  for (const b of all) {
    if (owned.has(b.id) || b.kind === "manual") continue;
    if (await ruleSatisfied(userId, b.rule)) {
      const ins = await db.insert(userBadges).values({ userId, badgeId: b.id }).onConflictDoNothing().returning();
      if (ins.length) {
        awarded.push(b.name);
        if (b.points) await addPoints(userId, b.points, "badge", String(b.id));
        if (b.slug !== "nouveau-membre") {
          await notify({ userId, type: "badge", title: `Nouveau badge : ${b.name}`, body: b.description, link: "/profil/reputation", dedupeKey: `badge:${b.id}` });
        }
      }
    }
  }
  return awarded;
}

export async function awardManualBadge(userId: string, badgeId: number) {
  await db.insert(userBadges).values({ userId, badgeId }).onConflictDoNothing();
}

export async function revokeBadge(userId: string, badgeId: number) {
  await db.delete(userBadges).where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
}

export async function loyaltySummary(userId: string) {
  const settings = await getSettings();
  const [p] = await db.select({ points: userProfiles.points }).from(userProfiles).where(eq(userProfiles.userId, userId));
  return { points: p?.points ?? 0, ...levelFor(p?.points ?? 0, settings.loyalty.levels) };
}
