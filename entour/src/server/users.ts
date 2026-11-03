import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  authTokens,
  badges,
  categories,
  notificationPreferences,
  referrals,
  reviewCriteria,
  reviews,
  serviceAssignments,
  services,
  userAvailabilities,
  userBadges,
  userLocations,
  userProfiles,
  users,
  userSkills,
  userVerifications,
} from "@/db/schema";
import { logSecurity } from "@/lib/audit";
import { hashPassword, randomCode, randomReferralCode, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { ageFromBirthDate } from "@/lib/dates";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { emailLayout, sendEmail, sendSms } from "@/lib/messaging-providers";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { fileUrl } from "@/lib/storage";
import type { z } from "zod";
import type { registerSchema } from "@/lib/validators";
import { evaluateBadges } from "./reputation";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export async function registerUser(input: z.infer<typeof registerSchema>, ip: string | null) {
  await rateLimit(`register:${ip ?? "unknown"}`, 5, 3600);
  if (input.website) throw badRequest("Inscription refusée");
  const age = ageFromBirthDate(input.birthDate);
  if (Number.isNaN(age) || age > 110) throw badRequest("Date de naissance invalide");
  if (age < 18) throw new AppError(403, "underage", "ENTOUR est réservé aux personnes majeures (18 ans et plus).");

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (existing.length) throw new AppError(409, "email_taken", "Un compte existe déjà avec cette adresse e-mail.");

  const settings = await getSettings();
  let referrerId: string | null = null;
  if (input.referralCode) {
    const [ref] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, input.referralCode));
    referrerId = ref?.id ?? null;
  }

  const passwordHash = await hashPassword(input.password);
  const user = await db.transaction(async (tx) => {
    let code = randomReferralCode();
    for (let i = 0; i < 5; i++) {
      const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.referralCode, code));
      if (!taken) break;
      code = randomReferralCode();
    }
    const [u] = await tx
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        birthDate: input.birthDate,
        referralCode: code,
        referredBy: referrerId,
        acceptedTermsAt: new Date(),
        termsVersion: settings.legal.termsVersion,
      })
      .returning();
    await tx.insert(userProfiles).values({
      userId: u.id,
      firstName: input.firstName,
      lastName: input.lastName,
      settings: { theme: "system", notifyNewMissions: true, notifyUrgent: true, dailyDigest: true, dndNightly: true },
    });
    if (referrerId) await tx.insert(referrals).values({ referrerId, referredId: u.id });
    return u;
  });
  await logSecurity(user.id, "register", {}, ip);
  await sendEmailVerification(user.id, user.email, input.firstName);
  await evaluateBadges(user.id);
  return user;
}

export async function authenticate(email: string, password: string, ip: string | null) {
  await rateLimit(`login:${ip ?? "unknown"}`, 20, 900);
  await rateLimit(`login:${email}`, 8, 900);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  // Comparaison effectuée même si le compte n'existe pas (temps constant, pas d'énumération).
  const ok = await verifyPassword(password, u?.passwordHash ?? "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" + "A".repeat(86));
  if (!u || !ok) {
    await logSecurity(u?.id ?? null, "login_failed", { email }, ip);
    throw new AppError(401, "invalid_credentials", "Adresse e-mail ou mot de passe incorrect.");
  }
  if (u.status === "banned") throw new AppError(403, "banned", "Ce compte a été fermé suite à une décision de modération.");
  if (u.status === "deleted") throw new AppError(401, "invalid_credentials", "Adresse e-mail ou mot de passe incorrect.");
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
  await logSecurity(u.id, "login", {}, ip);
  return u;
}

/* ───────────── Vérifications ───────────── */

export async function sendEmailVerification(userId: string, email: string, firstName: string) {
  await rateLimit(`verify-email:${userId}`, 5, 3600);
  const token = randomToken(24);
  await db.insert(authTokens).values({ userId, type: "email_verify", tokenHash: sha256(token), target: email, expiresAt: new Date(Date.now() + 48 * 3600_000) });
  const url = `${appUrl()}/verifier-email?token=${token}`;
  const res = await sendEmail(
    email,
    "Confirmez votre adresse e-mail",
    emailLayout(`Bienvenue ${firstName} !`, "Confirmez votre adresse e-mail pour commencer à publier et accepter des missions près de chez vous.", { label: "Confirmer mon e-mail", url }),
    `Bienvenue ${firstName} ! Confirmez votre adresse e-mail : ${url}`,
  );
  return { devUrl: res.devLogged ? url : null };
}

export async function verifyEmailToken(token: string) {
  const [t] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.type, "email_verify"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  if (!t) throw badRequest("Lien invalide ou expiré");
  await db.transaction(async (tx) => {
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, t.userId));
    await tx.insert(userVerifications).values({ userId: t.userId, type: "email", status: "approved", provider: "email_link", decidedAt: new Date() });
  });
  return t.userId;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return `+33${digits.slice(1)}`;
  if (/^\+33[67]\d{8}$/.test(digits)) return digits;
  if (/^0[1-59]\d{8}$/.test(digits)) return `+33${digits.slice(1)}`;
  throw badRequest("Numéro de téléphone français invalide (mobile recommandé)");
}

export async function startPhoneVerification(userId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  await rateLimit(`phone-code:${userId}`, 4, 3600);
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, phone), sql`${users.phoneVerifiedAt} is not null`, sql`${users.id} <> ${userId}`));
  if (taken) throw new AppError(409, "phone_taken", "Ce numéro est déjà associé à un autre compte.");
  const code = randomCode(6);
  await db.insert(authTokens).values({ userId, type: "phone_code", tokenHash: sha256(`${userId}:${code}`), target: phone, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const res = await sendSms(phone, `ENTOUR : votre code de vérification est ${code}. Il expire dans 10 minutes.`);
  return { phone, devCode: res.devLogged ? code : null };
}

export async function confirmPhoneCode(userId: string, code: string) {
  const [t] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, "phone_code"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .orderBy(desc(authTokens.createdAt))
    .limit(1);
  if (!t) throw badRequest("Code expiré : demandez-en un nouveau");
  if (t.attempts >= 5) throw badRequest("Trop d'essais : demandez un nouveau code");
  if (t.tokenHash !== sha256(`${userId}:${code.trim()}`)) {
    await db.update(authTokens).set({ attempts: t.attempts + 1 }).where(eq(authTokens.id, t.id));
    throw badRequest("Code incorrect");
  }
  await db.transaction(async (tx) => {
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
    await tx.update(users).set({ phone: t.target, phoneVerifiedAt: new Date() }).where(eq(users.id, userId));
    await tx.insert(userVerifications).values({ userId, type: "phone", status: "approved", provider: "sms", details: { last4: t.target?.slice(-4) }, decidedAt: new Date() });
  });
  await evaluateBadges(userId);
}

/** Demande de vérification d'identité : traitée par le prestataire (Stripe Identity) ou par un modérateur habilité. */
export async function requestIdentityVerification(userId: string, note: string) {
  const [pending] = await db
    .select({ id: userVerifications.id })
    .from(userVerifications)
    .where(and(eq(userVerifications.userId, userId), eq(userVerifications.type, "identity"), eq(userVerifications.status, "pending")));
  if (pending) throw badRequest("Une demande est déjà en cours d'examen");
  const [v] = await db
    .insert(userVerifications)
    .values({ userId, type: "identity", provider: process.env.STRIPE_SECRET_KEY ? "stripe_identity" : "manual", details: { note: note.slice(0, 300) } })
    .returning();
  return v;
}

export async function addReference(userId: string, input: { name: string; relation: string; contact: string; categoryId: number | null }) {
  const [v] = await db
    .insert(userVerifications)
    .values({ userId, type: "reference", categoryId: input.categoryId, details: { name: input.name, relation: input.relation, contact: input.contact } })
    .returning();
  return v;
}

/* ───────────── Profil, localisation, compétences ───────────── */

export async function updateProfile(userId: string, input: { firstName?: string; lastName?: string; bio?: string; avatarKey?: string | null; portfolio?: { key: string; caption?: string }[] }) {
  const patch: Partial<typeof userProfiles.$inferInsert> = { updatedAt: new Date() };
  if (input.firstName !== undefined) patch.firstName = input.firstName;
  if (input.lastName !== undefined) patch.lastName = input.lastName;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.avatarKey !== undefined) patch.avatarUrl = input.avatarKey ? fileUrl(input.avatarKey) : null;
  if (input.portfolio !== undefined) patch.portfolio = input.portfolio.map((p) => ({ url: fileUrl(p.key), caption: p.caption }));
  await db.update(userProfiles).set(patch).where(eq(userProfiles.userId, userId));
}

export async function setLocation(userId: string, loc: { lat: number; lng: number; label: string; postcode?: string | null }, radiusKm?: number) {
  await db
    .insert(userLocations)
    .values({ userId, lat: loc.lat, lng: loc.lng, label: loc.label, postcode: loc.postcode ?? null, radiusKm: radiusKm ?? 5 })
    .onConflictDoUpdate({
      target: userLocations.userId,
      set: { lat: loc.lat, lng: loc.lng, label: loc.label, postcode: loc.postcode ?? null, ...(radiusKm ? { radiusKm } : {}), updatedAt: new Date() },
    });
  await db.update(userProfiles).set({ areaLabel: loc.label }).where(eq(userProfiles.userId, userId));
}

export async function getLocation(userId: string) {
  const [l] = await db.select().from(userLocations).where(eq(userLocations.userId, userId));
  return l ?? null;
}

export async function setSkills(userId: string, skills: { categoryId: number; description: string; yearsExperience: number; hourlyRateCents?: number | null; notify?: boolean }[]) {
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(userSkills).where(eq(userSkills.userId, userId));
    const keep = new Set(skills.map((s) => s.categoryId));
    for (const e of existing) if (!keep.has(e.categoryId)) await tx.delete(userSkills).where(and(eq(userSkills.userId, userId), eq(userSkills.categoryId, e.categoryId)));
    for (const s of skills) {
      await tx
        .insert(userSkills)
        .values({ userId, categoryId: s.categoryId, description: s.description, yearsExperience: s.yearsExperience, hourlyRateCents: s.hourlyRateCents ?? null, notify: s.notify ?? true })
        .onConflictDoUpdate({
          target: [userSkills.userId, userSkills.categoryId],
          set: { description: s.description, yearsExperience: s.yearsExperience, hourlyRateCents: s.hourlyRateCents ?? null, notify: s.notify ?? true },
        });
    }
  });
}

export async function setAvailabilities(userId: string, slots: { weekday: number; startMinute: number; endMinute: number }[]) {
  await db.transaction(async (tx) => {
    await tx.delete(userAvailabilities).where(eq(userAvailabilities.userId, userId));
    if (slots.length) await tx.insert(userAvailabilities).values(slots.map((s) => ({ userId, ...s })));
  });
}

export async function setAvailableNow(userId: string, hours: number | null) {
  await db
    .update(userProfiles)
    .set({ availableUntil: hours ? new Date(Date.now() + hours * 3600_000) : null })
    .where(eq(userProfiles.userId, userId));
}

export async function setMutedCategories(userId: string, categoryIds: number[]) {
  await db.transaction(async (tx) => {
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    if (categoryIds.length) await tx.insert(notificationPreferences).values(categoryIds.map((categoryId) => ({ userId, categoryId, muted: true })));
  });
}

export async function updateSettings(userId: string, patch: Record<string, unknown>) {
  const [p] = await db.select({ settings: userProfiles.settings }).from(userProfiles).where(eq(userProfiles.userId, userId));
  const next = { ...(p?.settings ?? {}), ...patch };
  await db.update(userProfiles).set({ settings: next }).where(eq(userProfiles.userId, userId));
  return next;
}

export async function changePassword(userId: string, current: string, next: string, ip: string | null) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !(await verifyPassword(current, u.passwordHash))) throw badRequest("Mot de passe actuel incorrect");
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await logSecurity(userId, "password_changed", {}, ip);
}

/** Suppression de compte (RGPD) : anonymisation des données personnelles, conservation des écritures comptables. */
export async function deleteAccount(userId: string, ip: string | null) {
  const active = await db
    .select({ id: serviceAssignments.id })
    .from(serviceAssignments)
    .where(and(sql`(${serviceAssignments.providerId} = ${userId} or ${serviceAssignments.requesterId} = ${userId})`, sql`${serviceAssignments.status} in ('confirmed','in_progress','provider_done','disputed')`));
  if (active.length) throw badRequest("Terminez ou annulez vos missions en cours avant de supprimer votre compte.");
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ status: "deleted", deletedAt: new Date(), email: `deleted+${userId}@entour.invalid`, phone: null, passwordHash: "deleted" })
      .where(eq(users.id, userId));
    await tx.update(userProfiles).set({ firstName: "Membre", lastName: "supprimé", bio: "", avatarUrl: null, portfolio: [], areaLabel: null }).where(eq(userProfiles.userId, userId));
    await tx.delete(userLocations).where(eq(userLocations.userId, userId));
    await tx.update(services).set({ status: "cancelled", cancelReason: "Compte supprimé", cancelledAt: new Date() }).where(and(eq(services.requesterId, userId), eq(services.status, "open")));
  });
  await logSecurity(userId, "account_deleted", {}, ip);
}

/** Export des données personnelles (droit d'accès / portabilité RGPD). */
export async function exportUserData(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  const [p] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  const svc = await db.select().from(services).where(eq(services.requesterId, userId));
  const given = await db.select().from(reviews).where(eq(reviews.authorId, userId));
  const received = await db.select().from(reviews).where(eq(reviews.targetId, userId));
  const { passwordHash: _ph, ...safeUser } = u;
  return { exportedAt: new Date().toISOString(), user: safeUser, profile: p, services: svc, reviewsGiven: given, reviewsReceived: received, location: await getLocation(userId) };
}

/* ───────────── Profil public ───────────── */

export async function getPublicProfile(userId: string, viewerId?: string | null) {
  const [row] = await db
    .select({
      id: users.id,
      status: users.status,
      createdAt: users.createdAt,
      phoneVerified: sql<boolean>`${users.phoneVerifiedAt} is not null`,
      identityVerified: sql<boolean>`${users.identityVerifiedAt} is not null`,
      emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
      isDemo: users.isDemo,
      lastSeenAt: users.lastSeenAt,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      bio: userProfiles.bio,
      avatarUrl: userProfiles.avatarUrl,
      areaLabel: userProfiles.areaLabel,
      availableUntil: userProfiles.availableUntil,
      ratingAvg: userProfiles.ratingAvg,
      ratingCount: userProfiles.ratingCount,
      providerRatingAvg: userProfiles.providerRatingAvg,
      providerRatingCount: userProfiles.providerRatingCount,
      missionsDone: userProfiles.missionsDone,
      missionsRequested: userProfiles.missionsRequested,
      missionsCancelled: userProfiles.missionsCancelled,
      onTimeCount: userProfiles.onTimeCount,
      lateCount: userProfiles.lateCount,
      avgResponseMinutes: userProfiles.avgResponseMinutes,
      points: userProfiles.points,
      portfolio: userProfiles.portfolio,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row || row.status === "deleted") throw notFound("Profil");

  const skills = await db
    .select({ categoryId: userSkills.categoryId, name: categories.name, icon: categories.icon, color: categories.color, description: userSkills.description, years: userSkills.yearsExperience, certified: userSkills.certified, hourlyRateCents: userSkills.hourlyRateCents })
    .from(userSkills)
    .innerJoin(categories, eq(categories.id, userSkills.categoryId))
    .where(eq(userSkills.userId, userId));
  const badgeRows = await db
    .select({ slug: badges.slug, name: badges.name, description: badges.description, icon: badges.icon, color: badges.color, awardedAt: userBadges.awardedAt })
    .from(userBadges)
    .innerJoin(badges, eq(badges.id, userBadges.badgeId))
    .where(eq(userBadges.userId, userId))
    .orderBy(badges.sortOrder);
  const reviewRows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      role: reviews.role,
      reply: reviews.reply,
      createdAt: reviews.createdAt,
      authorId: reviews.authorId,
      authorName: userProfiles.firstName,
      authorAvatar: userProfiles.avatarUrl,
      serviceTitle: services.title,
    })
    .from(reviews)
    .innerJoin(userProfiles, eq(userProfiles.userId, reviews.authorId))
    .innerJoin(services, eq(services.id, reviews.serviceId))
    .where(and(eq(reviews.targetId, userId), eq(reviews.status, "visible")))
    .orderBy(desc(reviews.createdAt))
    .limit(30);
  const criteria = await db.execute<{ criterion: string; avg: number; n: number }>(sql`
    select rc.criterion, avg(rc.score)::float as avg, count(*)::int as n
    from review_criteria rc join reviews r on r.id = rc.review_id
    where r.target_id = ${userId} and r.status = 'visible' group by rc.criterion`);
  const slots = await db.select().from(userAvailabilities).where(eq(userAvailabilities.userId, userId));

  const total = row.missionsDone + row.missionsCancelled;
  const punctualityTotal = row.onTimeCount + row.lateCount;
  return {
    ...row,
    lastName: row.lastName ? `${row.lastName.charAt(0)}.` : "",
    completionRate: total ? Math.round((row.missionsDone / total) * 100) : null,
    punctualityRate: punctualityTotal ? Math.round((row.onTimeCount / punctualityTotal) * 100) : null,
    skills,
    badges: badgeRows,
    reviews: reviewRows,
    criteria: criteria.map((c) => ({ criterion: c.criterion, avg: Number(c.avg), n: Number(c.n) })),
    availabilities: slots,
    isSelf: viewerId === userId,
  };
}
export type PublicProfile = Awaited<ReturnType<typeof getPublicProfile>>;

export async function getReviewCriteriaFor(reviewIds: string[]) {
  if (!reviewIds.length) return [];
  return db.select().from(reviewCriteria).where(sql`${reviewCriteria.reviewId} in ${reviewIds}`);
}

/* ───────────── Réinitialisation du mot de passe ───────────── */

export async function requestPasswordReset(email: string, ip: string | null) {
  await rateLimit(`reset:${ip ?? "unknown"}`, 5, 3600);
  await rateLimit(`reset:${email}`, 3, 3600);
  const [u] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, email));
  // Réponse identique que le compte existe ou non (pas d'énumération des comptes)
  if (!u || u.status === "deleted" || u.status === "banned") return { devUrl: null };
  const token = randomToken(24);
  await db.insert(authTokens).values({ userId: u.id, type: "password_reset", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
  const url = `${appUrl()}/mot-de-passe?token=${token}`;
  const res = await sendEmail(email, "Réinitialisation de votre mot de passe", emailLayout("Réinitialiser votre mot de passe", "Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.", { label: "Choisir un nouveau mot de passe", url }), `Réinitialisez votre mot de passe : ${url}`);
  await logSecurity(u.id, "password_reset_requested", {}, ip);
  return { devUrl: res.devLogged ? url : null };
}

export async function resetPassword(token: string, password: string, ip: string | null) {
  const [t] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.type, "password_reset"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  if (!t) throw badRequest("Lien invalide ou expiré");
  await db.transaction(async (tx) => {
    await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
    await tx.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, t.userId));
  });
  const { destroyAllSessions } = await import("@/lib/auth");
  await destroyAllSessions(t.userId);
  await logSecurity(t.userId, "password_reset", {}, ip);
}
