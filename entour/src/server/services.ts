import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  groupMembers,
  serviceApplications,
  serviceAssignments,
  serviceImages,
  services,
  uploads,
  userLocations,
  userProfiles,
  users,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { AppError, badRequest, forbidden, notFound } from "@/lib/errors";
import { fuzzLocation, haversineKm } from "@/lib/geo";
import { analyzeListing, type Finding } from "@/lib/moderation";
import { suggestPrice } from "@/lib/pricing";
import { publish } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import { fileUrl } from "@/lib/storage";
import type { CreateServiceInput } from "@/lib/validators";
import { broadcastService } from "./broadcast";
import { notify } from "./notifications";

/* ───────────── Création ───────────── */

function computeExpiry(timing: CreateServiceInput["timingType"], startsAt: Date | null): Date {
  const now = new Date();
  const endOfParisDay = (offsetDays: number) => {
    const d = new Date(now.getTime() + offsetDays * 86400_000);
    const s = d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    return new Date(`${s}T23:59:00+01:00`);
  };
  switch (timing) {
    case "immediate":
      return new Date(now.getTime() + 6 * 3600_000);
    case "today":
      return endOfParisDay(0);
    case "tomorrow":
      return endOfParisDay(1);
    default:
      return new Date((startsAt ?? now).getTime() + 2 * 3600_000);
  }
}

export async function createService(user: CurrentUser, input: CreateServiceInput) {
  if (!user.emailVerified) throw new AppError(403, "email_unverified", "Confirmez votre adresse e-mail avant de publier une demande.");
  const settings = await getSettings();
  const [cat] = await db.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.isActive, true)));
  if (!cat) throw badRequest("Catégorie indisponible");

  const [{ open }] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(services)
    .where(and(eq(services.requesterId, user.id), inArray(services.status, ["open", "assigned", "in_progress"])));
  if (open >= settings.limits.maxOpenServicesPerUser)
    throw new AppError(429, "too_many_open", `Vous avez déjà ${open} demandes en cours. Clôturez-en une avant d'en publier une nouvelle.`);

  if (input.groupId) {
    const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, user.id)));
    if (!m) throw forbidden("Vous n'êtes pas membre de ce groupe");
  }

  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(services)
    .where(and(eq(services.requesterId, user.id), sql`${services.createdAt} > now() - interval '1 hour'`));
  const [acct] = await db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, user.id));
  const analysis = analyzeListing({
    title: input.title,
    description: input.description,
    budgetCents: input.budgetCents ?? null,
    pricingType: input.pricingType,
    durationMinutes: input.durationMinutes ?? null,
    category: cat,
    bannedWords: settings.moderation.bannedWords,
    accountAgeHours: (Date.now() - acct.createdAt.getTime()) / 3600_000,
    recentListingsCount: recent,
  });
  const held = analysis.riskScore >= settings.moderation.autoHoldRiskScore;

  const startsAt = input.startsAt ? new Date(input.startsAt) : input.timingType === "immediate" ? new Date() : null;
  const seed = randomToken(8);
  const fuzzed = fuzzLocation(input.location.lat, input.location.lng, seed);

  // Images : uniquement des fichiers téléversés par l'auteur
  let imageKeys: string[] = [];
  if (input.imageKeys.length) {
    const owned = await db
      .select({ key: uploads.storageKey })
      .from(uploads)
      .where(and(eq(uploads.ownerId, user.id), inArray(uploads.storageKey, input.imageKeys), sql`${uploads.mimeType} like 'image/%'`));
    const set = new Set(owned.map((o) => o.key));
    imageKeys = input.imageKeys.filter((k) => set.has(k));
    if (imageKeys.length) await db.update(uploads).set({ visibility: "public" }).where(inArray(uploads.storageKey, imageKeys));
  }

  const service = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(services)
      .values({
        requesterId: user.id,
        categoryId: cat.id,
        title: input.title,
        description: input.description,
        pricingType: input.pricingType,
        budgetCents: input.pricingType === "offer" ? (input.budgetCents ?? null) : input.budgetCents,
        timingType: input.timingType,
        startsAt,
        durationMinutes: input.durationMinutes,
        durationExact: input.durationExact,
        purchaseCents: input.purchaseCents || null,
        purchaseNote: input.purchaseCents ? input.purchaseNote || null : null,
        recurrence: input.timingType === "recurring" && input.recurrence ? { freq: input.recurrence.freq, interval: input.recurrence.interval, until: input.recurrence.until ?? null } : null,
        urgency: input.timingType === "immediate" ? "urgent" : input.urgency,
        peopleNeeded: input.peopleNeeded,
        skillsRequired: input.skillsRequired,
        searchRadiusKm: input.searchRadiusKm,
        lat: input.location.lat,
        lng: input.location.lng,
        publicLat: fuzzed.lat,
        publicLng: fuzzed.lng,
        areaLabel: input.location.label,
        postcode: input.location.postcode ?? null,
        addressPrivate: input.addressPrivate || null,
        visibility: input.visibility,
        inviteCode: input.visibility === "invite" ? randomToken(9) : null,
        groupId: input.visibility === "group" ? input.groupId : null,
        isGroupBuy: input.isGroupBuy,
        moderation: held ? "pending_review" : "approved",
        moderationReasons: analysis.findings.filter((f) => f.severity === "risk").map((f) => f.message),
        riskScore: analysis.riskScore,
        parentServiceId: input.parentServiceId ?? null,
        isDemo: user.isDemo,
        expiresAt: computeExpiry(input.timingType, startsAt),
      })
      .returning();
    if (imageKeys.length) await tx.insert(serviceImages).values(imageKeys.map((k, i) => ({ serviceId: s.id, url: fileUrl(k), position: i })));
    return s;
  });

  // Le demandeur garde sa zone en mémoire pour les prochaines publications
  const [loc] = await db.select().from(userLocations).where(eq(userLocations.userId, user.id));
  if (!loc) await db.insert(userLocations).values({ userId: user.id, lat: input.location.lat, lng: input.location.lng, label: input.location.label, postcode: input.location.postcode ?? null }).onConflictDoNothing();

  let notified = 0;
  if (held) {
    await notify({
      userId: user.id,
      type: "moderation",
      title: "Votre demande est en cours de vérification",
      body: "Notre équipe la relit avant publication. Vous serez prévenu dès qu'elle sera en ligne.",
      link: `/missions/${service.id}`,
    });
  } else {
    notified = await broadcastService({ ...service, categoryGroup: cat.groupName, categoryName: cat.name, requiresPhone: cat.requiresPhone, requiresIdentity: cat.requiresIdentity }).catch((e) => {
      console.error("[broadcast]", e);
      return 0;
    });
  }
  return { service, findings: analysis.findings as Finding[], held, notified };
}

/* ───────────── Lecture publique ───────────── */

export type ServiceListParams = {
  lat: number;
  lng: number;
  radiusKm: number;
  categoryIds?: number[];
  minPriceCents?: number;
  maxPriceCents?: number;
  when?: "now" | "today" | "tomorrow" | "week" | "later";
  urgentOnly?: boolean;
  recurringOnly?: boolean;
  q?: string;
  sort?: "relevance" | "distance" | "recent" | "price_desc" | "price_asc" | "date";
  limit?: number;
  offset?: number;
  bbox?: [number, number, number, number]; // [ouest, sud, est, nord]
  requesterId?: string;
};

export type ServiceCard = {
  id: string;
  title: string;
  excerpt: string;
  status: string;
  category: { id: number; slug: string; name: string; icon: string; color: string };
  pricingType: "fixed" | "negotiable" | "offer";
  budgetCents: number | null;
  purchaseCents: number | null;
  timingType: string;
  startsAt: string | null;
  durationMinutes: number | null;
  durationExact: boolean;
  urgency: "normal" | "high" | "urgent";
  peopleNeeded: number;
  areaLabel: string;
  lat: number;
  lng: number;
  distanceKm: number | null;
  imageUrl: string | null;
  recurrence: unknown;
  isGroupBuy: boolean;
  boosted: boolean;
  applicationsCount: number;
  createdAt: string;
  isDemo: boolean;
  requester: { id: string; firstName: string; avatarUrl: string | null; ratingAvg: number; ratingCount: number; verified: boolean };
};

export async function listServices(p: ServiceListParams, viewerId: string | null): Promise<ServiceCard[]> {
  const conds = [sql`s.status = 'open'`, sql`s.moderation = 'approved'`, sql`(s.expires_at is null or s.expires_at > now())`];
  if (p.bbox) {
    const [w, so, e, n] = p.bbox;
    conds.push(sql`s.public_lng between ${w} and ${e} and s.public_lat between ${so} and ${n}`);
  } else {
    conds.push(sql`earth_box(ll_to_earth(${p.lat}, ${p.lng}), ${p.radiusKm * 1000}) @> ll_to_earth(s.public_lat, s.public_lng)`);
    conds.push(sql`earth_distance(ll_to_earth(${p.lat}, ${p.lng}), ll_to_earth(s.public_lat, s.public_lng)) <= ${p.radiusKm * 1000}`);
  }
  if (viewerId) {
    conds.push(sql`(s.visibility = 'public' or (s.visibility = 'group' and exists (select 1 from group_members gm where gm.group_id = s.group_id and gm.user_id = ${viewerId})) or s.requester_id = ${viewerId})`);
    conds.push(sql`not exists (select 1 from blocks b where (b.blocker_id = ${viewerId} and b.blocked_id = s.requester_id) or (b.blocker_id = s.requester_id and b.blocked_id = ${viewerId}))`);
  } else {
    conds.push(sql`s.visibility = 'public'`);
  }
  if (p.requesterId) conds.push(sql`s.requester_id = ${p.requesterId}`);
  if (p.categoryIds?.length) conds.push(sql`s.category_id in ${p.categoryIds}`);
  if (p.minPriceCents != null) conds.push(sql`coalesce(s.budget_cents, 0) >= ${p.minPriceCents}`);
  if (p.maxPriceCents != null) conds.push(sql`(s.budget_cents is null or s.budget_cents <= ${p.maxPriceCents})`);
  if (p.urgentOnly) conds.push(sql`s.urgency = 'urgent'`);
  if (p.recurringOnly) conds.push(sql`s.timing_type = 'recurring'`);
  if (p.when === "now") conds.push(sql`s.timing_type = 'immediate'`);
  if (p.when === "today") conds.push(sql`(s.timing_type in ('immediate','today') or (s.starts_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date)`);
  if (p.when === "tomorrow") conds.push(sql`(s.timing_type = 'tomorrow' or (s.starts_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date + 1)`);
  if (p.when === "week") conds.push(sql`(s.starts_at is null or s.starts_at < now() + interval '7 days')`);
  if (p.when === "later") conds.push(sql`s.starts_at >= now() + interval '7 days'`);
  if (p.q?.trim()) {
    const q = p.q.trim().slice(0, 80);
    conds.push(sql`(to_tsvector('french', s.title || ' ' || s.description) @@ plainto_tsquery('french', ${q}) or s.title % ${q} or c.name ilike ${"%" + q + "%"})`);
  }

  const dist = sql`earth_distance(ll_to_earth(${p.lat}, ${p.lng}), ll_to_earth(s.public_lat, s.public_lng)) / 1000.0`;
  const order = {
    relevance: sql`(case when s.boosted_until > now() then 1 else 0 end) desc, (case s.urgency when 'urgent' then 2 when 'high' then 1 else 0 end) desc, ${dist} / 3 + extract(epoch from now() - s.created_at) / 7200 asc`,
    distance: sql`${dist} asc`,
    recent: sql`s.created_at desc`,
    price_desc: sql`s.budget_cents desc nulls last`,
    price_asc: sql`s.budget_cents asc nulls last`,
    date: sql`coalesce(s.starts_at, s.created_at) asc`,
  }[p.sort ?? "relevance"];

  const rows = await db.execute<Record<string, unknown>>(sql`
    select s.id, s.title, left(s.description, 180) as excerpt, s.status, s.pricing_type, s.budget_cents, s.purchase_cents, s.timing_type, s.starts_at,
      s.duration_minutes, s.duration_exact, s.urgency, s.people_needed, s.area_label, s.public_lat, s.public_lng, s.recurrence, s.is_group_buy,
      (s.boosted_until is not null and s.boosted_until > now()) as boosted, s.created_at, s.is_demo,
      ${dist} as distance_km,
      c.id as c_id, c.slug as c_slug, c.name as c_name, c.icon as c_icon, c.color as c_color,
      u.id as r_id, p.first_name as r_name, p.avatar_url as r_avatar, p.rating_avg as r_rating, p.rating_count as r_count,
      (u.phone_verified_at is not null and u.identity_verified_at is not null) as r_verified,
      (select url from service_images si where si.service_id = s.id order by position limit 1) as image_url,
      (select count(*) from service_applications a where a.service_id = s.id and a.status in ('pending','accepted'))::int as apps
    from services s
    join categories c on c.id = s.category_id
    join users u on u.id = s.requester_id and u.status = 'active'
    join user_profiles p on p.user_id = s.requester_id
    where ${sql.join(conds, sql` and `)}
    order by ${order}
    limit ${Math.min(p.limit ?? 30, 300)} offset ${p.offset ?? 0}`);

  return rows.map(toCard);
}

function toCard(r: Record<string, unknown>): ServiceCard {
  return {
    id: String(r.id),
    title: String(r.title),
    excerpt: String(r.excerpt ?? ""),
    status: String(r.status),
    category: { id: Number(r.c_id), slug: String(r.c_slug), name: String(r.c_name), icon: String(r.c_icon), color: String(r.c_color) },
    pricingType: r.pricing_type as ServiceCard["pricingType"],
    budgetCents: r.budget_cents == null ? null : Number(r.budget_cents),
    purchaseCents: r.purchase_cents == null ? null : Number(r.purchase_cents),
    timingType: String(r.timing_type),
    startsAt: r.starts_at ? new Date(r.starts_at as string).toISOString() : null,
    durationMinutes: r.duration_minutes == null ? null : Number(r.duration_minutes),
    durationExact: !!r.duration_exact,
    urgency: r.urgency as ServiceCard["urgency"],
    peopleNeeded: Number(r.people_needed),
    areaLabel: String(r.area_label),
    lat: Number(r.public_lat),
    lng: Number(r.public_lng),
    distanceKm: r.distance_km == null ? null : Number(r.distance_km),
    imageUrl: (r.image_url as string) ?? null,
    recurrence: r.recurrence ?? null,
    isGroupBuy: !!r.is_group_buy,
    boosted: !!r.boosted,
    applicationsCount: Number(r.apps ?? 0),
    createdAt: new Date(r.created_at as string).toISOString(),
    isDemo: !!r.is_demo,
    requester: {
      id: String(r.r_id),
      firstName: String(r.r_name),
      avatarUrl: (r.r_avatar as string) ?? null,
      ratingAvg: Number(r.r_rating ?? 0),
      ratingCount: Number(r.r_count ?? 0),
      verified: !!r.r_verified,
    },
  };
}

/** Missions recommandées : catégories des compétences déclarées + catégories déjà réalisées. */
export async function recommendedServices(viewerId: string, lat: number, lng: number, radiusKm: number) {
  const cats = await db.execute<{ id: number }>(sql`
    select category_id as id from user_skills where user_id = ${viewerId}
    union select s.category_id from service_assignments a join services s on s.id = a.service_id where a.provider_id = ${viewerId} and a.status = 'completed'`);
  if (!cats.length) return [];
  const list = await listServices({ lat, lng, radiusKm, categoryIds: cats.map((c) => Number(c.id)), sort: "relevance", limit: 12 }, viewerId);
  return list.filter((s) => s.requester.id !== viewerId);
}

/* ───────────── Détail ───────────── */

export async function getServiceDetail(id: string, viewer: CurrentUser | null, opts: { inviteCode?: string; viewerLat?: number; viewerLng?: number } = {}) {
  const [row] = await db
    .select({ s: services, c: categories, p: userProfiles, u: { id: users.id, phoneVerifiedAt: users.phoneVerifiedAt, identityVerifiedAt: users.identityVerifiedAt, createdAt: users.createdAt, status: users.status } })
    .from(services)
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .innerJoin(users, eq(users.id, services.requesterId))
    .innerJoin(userProfiles, eq(userProfiles.userId, services.requesterId))
    .where(eq(services.id, id));
  if (!row) throw notFound("Demande");
  const { s, c, p, u } = row;
  const isOwner = viewer?.id === s.requesterId;
  const isAdmin = !!viewer?.adminRole;

  const assignments = await db
    .select({
      id: serviceAssignments.id,
      providerId: serviceAssignments.providerId,
      status: serviceAssignments.status,
      agreedPriceCents: serviceAssignments.agreedPriceCents,
      startsAt: serviceAssignments.startsAt,
      conversationId: serviceAssignments.conversationId,
      providerDoneAt: serviceAssignments.providerDoneAt,
      completedAt: serviceAssignments.completedAt,
      lateMinutes: serviceAssignments.lateMinutes,
      firstName: userProfiles.firstName,
      avatarUrl: userProfiles.avatarUrl,
      ratingAvg: userProfiles.ratingAvg,
      ratingCount: userProfiles.ratingCount,
    })
    .from(serviceAssignments)
    .innerJoin(userProfiles, eq(userProfiles.userId, serviceAssignments.providerId))
    .where(eq(serviceAssignments.serviceId, id));
  const myAssignment = viewer ? assignments.find((a) => a.providerId === viewer.id && a.status !== "cancelled") : undefined;

  // Contrôle d'accès
  const visible =
    isOwner ||
    isAdmin ||
    !!myAssignment ||
    (s.moderation === "approved" &&
      s.status !== "removed" &&
      (s.visibility === "public" ||
        (s.visibility === "invite" && opts.inviteCode && opts.inviteCode === s.inviteCode) ||
        (s.visibility === "group" &&
          viewer &&
          (await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, s.groupId!), eq(groupMembers.userId, viewer.id)))).length > 0)));
  if (!visible) throw notFound("Demande");

  if (viewer && !isOwner) await db.update(services).set({ viewsCount: sql`${services.viewsCount} + 1` }).where(eq(services.id, id));

  const images = await db.select().from(serviceImages).where(eq(serviceImages.serviceId, id)).orderBy(serviceImages.position);
  const [{ apps }] = await db
    .select({ apps: sql<number>`count(*)::int` })
    .from(serviceApplications)
    .where(and(eq(serviceApplications.serviceId, id), inArray(serviceApplications.status, ["pending", "accepted"])));
  const myApplication = viewer
    ? (await db.select().from(serviceApplications).where(and(eq(serviceApplications.serviceId, id), eq(serviceApplications.applicantId, viewer.id))))[0] ?? null
    : null;

  const activeAssignments = assignments.filter((a) => a.status !== "cancelled");
  const seatsLeft = Math.max(0, s.peopleNeeded - activeAssignments.length);
  // Adresse exacte : uniquement le demandeur et les intervenants retenus (mission confirmée)
  const revealExact = isOwner || !!myAssignment;

  let eligibility: { ok: boolean; reasons: string[] } = { ok: true, reasons: [] };
  if (viewer && !isOwner) {
    const reasons: string[] = [];
    if (!viewer.emailVerified) reasons.push("Confirmez votre adresse e-mail");
    if (c.requiresPhone && !viewer.phoneVerified) reasons.push("Vérifiez votre numéro de téléphone");
    if (c.requiresIdentity && !viewer.identityVerified) reasons.push("Vérifiez votre identité");
    if (c.requiresReferences) {
      const refs = await db.execute<{ n: number }>(sql`select count(*)::int as n from user_verifications where user_id = ${viewer.id} and type = 'reference' and status = 'approved'`);
      if (Number(refs[0]?.n ?? 0) < 1) reasons.push("Ajoutez au moins une référence validée");
    }
    if (viewer.status === "suspended") reasons.push("Compte suspendu");
    eligibility = { ok: reasons.length === 0, reasons };
  }

  const distanceKm = opts.viewerLat != null && opts.viewerLng != null ? haversineKm({ lat: opts.viewerLat, lng: opts.viewerLng }, { lat: s.publicLat, lng: s.publicLng }) : null;

  const history = await db.execute<{ price: number; duration: number | null }>(sql`
    select a.agreed_price_cents as price, sv.duration_minutes as duration from service_assignments a join services sv on sv.id = a.service_id
    where sv.category_id = ${c.id} and a.status = 'completed' and a.completed_at > now() - interval '180 days' limit 500`);
  const price = suggestPrice(c, s.durationMinutes, history.map((h) => ({ priceCents: Number(h.price), durationMinutes: h.duration == null ? null : Number(h.duration) })), s.urgency);

  return {
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status,
    moderation: s.moderation,
    moderationReasons: isOwner || isAdmin ? s.moderationReasons : [],
    pricingType: s.pricingType,
    budgetCents: s.budgetCents,
    purchaseCents: s.purchaseCents,
    purchaseNote: s.purchaseNote,
    commissionPct: (await getSettings()).fees.providerCommissionPct,
    timingType: s.timingType,
    startsAt: s.startsAt?.toISOString() ?? null,
    durationMinutes: s.durationMinutes,
    durationExact: s.durationExact,
    recurrence: s.recurrence,
    urgency: s.urgency,
    peopleNeeded: s.peopleNeeded,
    seatsLeft,
    skillsRequired: s.skillsRequired,
    searchRadiusKm: s.searchRadiusKm,
    areaLabel: s.areaLabel,
    publicLat: s.publicLat,
    publicLng: s.publicLng,
    exactLocation: revealExact ? { lat: s.lat, lng: s.lng, address: s.addressPrivate } : null,
    visibility: s.visibility,
    inviteCode: isOwner ? s.inviteCode : null,
    isGroupBuy: s.isGroupBuy,
    boostedUntil: s.boostedUntil?.toISOString() ?? null,
    viewsCount: isOwner ? s.viewsCount : null,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
    isDemo: s.isDemo,
    images: images.map((i) => i.url),
    applicationsCount: apps,
    distanceKm,
    priceSuggestion: price,
    category: {
      id: c.id,
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      color: c.color,
      groupName: c.groupName,
      sensitivity: c.sensitivity,
      safetyNotice: c.safetyNotice,
      requiresPhone: c.requiresPhone,
      requiresIdentity: c.requiresIdentity,
      requiresReferences: c.requiresReferences,
    },
    requester: {
      id: u.id,
      firstName: p.firstName,
      avatarUrl: p.avatarUrl,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      missionsRequested: p.missionsRequested,
      memberSince: u.createdAt.toISOString(),
      phoneVerified: !!u.phoneVerifiedAt,
      identityVerified: !!u.identityVerifiedAt,
    },
    viewer: viewer
      ? {
          isOwner,
          isAdmin,
          eligibility,
          myApplication: myApplication
            ? { id: myApplication.id, status: myApplication.status, proposedPriceCents: myApplication.proposedPriceCents, conversationId: myApplication.conversationId }
            : null,
          myAssignment: myAssignment ?? null,
        }
      : null,
    assignments: isOwner || isAdmin ? assignments : myAssignment ? [myAssignment] : [],
  };
}
export type ServiceDetail = Awaited<ReturnType<typeof getServiceDetail>>;

/* ───────────── Mes demandes / gestion ───────────── */

export async function myRequests(userId: string) {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select s.id, s.title, s.status, s.moderation, s.budget_cents, s.pricing_type, s.starts_at, s.timing_type, s.created_at, s.urgency, s.people_needed,
      c.name as category_name, c.icon as category_icon, c.color as category_color,
      (select count(*) from service_applications a where a.service_id = s.id and a.status = 'pending')::int as pending_apps,
      (select count(*) from service_assignments a where a.service_id = s.id and a.status <> 'cancelled')::int as assigned
    from services s join categories c on c.id = s.category_id
    where s.requester_id = ${userId}
    order by case when s.status in ('open','assigned','in_progress') then 0 else 1 end, s.created_at desc
    limit 200`);
  return rows;
}

export async function cancelService(user: CurrentUser, id: string, reason: string) {
  const [s] = await db.select().from(services).where(eq(services.id, id));
  if (!s) throw notFound("Demande");
  if (s.requesterId !== user.id) throw forbidden();
  if (!["open", "assigned"].includes(s.status)) throw badRequest("Cette demande ne peut plus être annulée ici : utilisez l'annulation de mission.");
  const active = await db
    .select()
    .from(serviceAssignments)
    .where(and(eq(serviceAssignments.serviceId, id), inArray(serviceAssignments.status, ["confirmed", "in_progress", "provider_done"])));
  if (active.length) {
    const { cancelAssignment } = await import("./assignments");
    for (const a of active) await cancelAssignment(user, a.id, reason || "Demande annulée par le demandeur");
  }
  await db.update(services).set({ status: "cancelled", cancelReason: reason || null, cancelledAt: new Date(), updatedAt: new Date() }).where(eq(services.id, id));
  const pending = await db
    .select({ applicantId: serviceApplications.applicantId })
    .from(serviceApplications)
    .where(and(eq(serviceApplications.serviceId, id), inArray(serviceApplications.status, ["pending", "waitlisted"])));
  await db.update(serviceApplications).set({ status: "rejected", decidedAt: new Date() }).where(and(eq(serviceApplications.serviceId, id), inArray(serviceApplications.status, ["pending", "waitlisted"])));
  for (const a of pending)
    await notify({ userId: a.applicantId, type: "mission_cancelled", title: "Demande annulée", body: `« ${s.title} » a été annulée par le demandeur.`, link: `/missions/${id}` });
  await publish([user.id, ...pending.map((p) => p.applicantId)], { type: "service:updated", serviceId: id });
}

export async function updateService(user: CurrentUser, id: string, patch: { title?: string; description?: string; budgetCents?: number | null; startsAt?: string | null; urgency?: "normal" | "high" | "urgent" }) {
  const [s] = await db.select().from(services).where(eq(services.id, id));
  if (!s) throw notFound("Demande");
  if (s.requesterId !== user.id) throw forbidden();
  if (s.status !== "open") throw badRequest("Seule une demande ouverte peut être modifiée");
  const changes: Partial<typeof services.$inferInsert> = { updatedAt: new Date() };
  if (patch.title) changes.title = patch.title.slice(0, 90);
  if (patch.description) changes.description = patch.description.slice(0, 3000);
  if (patch.budgetCents !== undefined) changes.budgetCents = patch.budgetCents;
  if (patch.startsAt !== undefined) changes.startsAt = patch.startsAt ? new Date(patch.startsAt) : null;
  if (patch.urgency) changes.urgency = patch.urgency;
  await db.update(services).set(changes).where(eq(services.id, id));
  if (patch.budgetCents !== undefined && patch.budgetCents !== s.budgetCents) {
    const apps = await db.select({ applicantId: serviceApplications.applicantId }).from(serviceApplications).where(and(eq(serviceApplications.serviceId, id), eq(serviceApplications.status, "pending")));
    for (const a of apps) await notify({ userId: a.applicantId, type: "price_change", title: "Budget modifié", body: `Le budget de « ${s.title} » a été modifié.`, link: `/missions/${id}` });
  }
}

/** « Renouveler » : prépare une nouvelle demande pré-remplie à partir d'une ancienne. */
export async function renewTemplate(user: CurrentUser, id: string) {
  const [s] = await db.select().from(services).where(eq(services.id, id));
  if (!s || s.requesterId !== user.id) throw notFound("Demande");
  return {
    title: s.title,
    categoryId: s.categoryId,
    description: s.description,
    pricingType: s.pricingType,
    budgetCents: s.budgetCents,
    purchaseCents: s.purchaseCents,
    purchaseNote: s.purchaseNote,
    durationMinutes: s.durationMinutes,
    durationExact: s.durationExact,
    peopleNeeded: s.peopleNeeded,
    skillsRequired: s.skillsRequired,
    searchRadiusKm: s.searchRadiusKm,
    location: { lat: s.lat, lng: s.lng, label: s.areaLabel, postcode: s.postcode },
    addressPrivate: s.addressPrivate,
    parentServiceId: s.id,
  };
}

export async function boostService(user: CurrentUser, id: string) {
  const settings = await getSettings();
  const [s] = await db.select().from(services).where(eq(services.id, id));
  if (!s || s.requesterId !== user.id) throw notFound("Demande");
  if (s.status !== "open") throw badRequest("Seule une demande ouverte peut être mise en avant");
  // Option payante : en l'absence de passerelle réelle, la mise en avant est offerte et signalée comme telle.
  const until = new Date(Date.now() + settings.boost.hours * 3600_000);
  await db.update(services).set({ boostedUntil: until }).where(eq(services.id, id));
  return { boostedUntil: until.toISOString(), priceCents: settings.boost.priceCents };
}

export async function priceSuggestionFor(categoryId: number, durationMinutes: number | null, urgency: "normal" | "high" | "urgent") {
  const [c] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!c) throw notFound("Catégorie");
  const history = await db.execute<{ price: number; duration: number | null }>(sql`
    select a.agreed_price_cents as price, sv.duration_minutes as duration from service_assignments a join services sv on sv.id = a.service_id
    where sv.category_id = ${categoryId} and a.status = 'completed' and a.completed_at > now() - interval '180 days' limit 500`);
  return suggestPrice(c, durationMinutes, history.map((h) => ({ priceCents: Number(h.price), durationMinutes: h.duration == null ? null : Number(h.duration) })), urgency);
}

export async function listCategories(includeInactive = false) {
  const rows = await db.select().from(categories).where(includeInactive ? undefined : eq(categories.isActive, true)).orderBy(categories.sortOrder);
  return rows;
}

export async function recentServicesOf(userId: string) {
  return db.select().from(services).where(eq(services.requesterId, userId)).orderBy(desc(services.createdAt)).limit(20);
}
