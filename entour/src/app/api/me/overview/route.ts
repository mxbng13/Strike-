import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { badges, userAvailabilities, userBadges, userSkills, userVerifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { getGateway } from "@/lib/payments";
import { loyaltySummary } from "@/server/reputation";
import { currentSubscription } from "@/server/subscriptions";
import { getPublicProfile } from "@/server/users";

/** Données privées du profil : compétences, disponibilités, vérifications, badges, fidélité, abonnement. */
export const GET = route(async () => {
  const user = await requireUser();
  const [profile, skills, slots, verifications, allBadges, owned, loyalty, subscription] = await Promise.all([
    getPublicProfile(user.id, user.id),
    db.select().from(userSkills).where(eq(userSkills.userId, user.id)),
    db.select().from(userAvailabilities).where(eq(userAvailabilities.userId, user.id)),
    db.select().from(userVerifications).where(eq(userVerifications.userId, user.id)).orderBy(desc(userVerifications.createdAt)),
    db.select().from(badges).where(eq(badges.isActive, true)).orderBy(badges.sortOrder),
    db.select().from(userBadges).where(eq(userBadges.userId, user.id)),
    loyaltySummary(user.id),
    currentSubscription(user.id),
  ]);
  const ownedMap = new Map(owned.map((o) => [o.badgeId, o.awardedAt]));
  return {
    profile,
    skills,
    availabilities: slots,
    verifications: verifications.map((v) => ({ id: v.id, type: v.type, status: v.status, createdAt: v.createdAt, decidedAt: v.decidedAt, decisionNote: v.decisionNote, details: v.type === "reference" ? { name: (v.details as { name?: string }).name } : {} })),
    badges: allBadges.map((b) => ({ id: b.id, slug: b.slug, name: b.name, description: b.description, icon: b.icon, color: b.color, kind: b.kind, awardedAt: ownedMap.get(b.id) ?? null })),
    loyalty,
    subscription,
    paymentProvider: getGateway().name,
  };
});
