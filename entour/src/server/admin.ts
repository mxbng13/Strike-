import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminLogs,
  adminRoles,
  announcements,
  badges,
  categories,
  disputes,
  reports,
  reviews,
  serviceAssignments,
  services,
  userProfiles,
  users,
  userVerifications,
  sessions,
} from "@/db/schema";
import { logAdmin } from "@/lib/audit";
import type { AdminRole, CurrentUser } from "@/lib/auth";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { gridCell } from "@/lib/geo";
import { publish } from "@/lib/realtime";
import { invalidateSettings, setSetting, type Settings } from "@/lib/settings";
import { broadcastService } from "./broadcast";
import { notify } from "./notifications";
import { cancelOrRefund, capturePayment, paymentForAssignment } from "./payments";
import { evaluateBadges, recomputeStats } from "./reputation";

type Admin = CurrentUser & { adminRole: AdminRole };

/* ───────────── Tableau de bord (agrégats sur données réelles) ───────────── */

export async function dashboardStats(opts: { includeDemo?: boolean } = {}) {
  const demo = opts.includeDemo ? sql`true` : sql`u.is_demo = false`;
  const sdemo = opts.includeDemo ? sql`true` : sql`s.is_demo = false`;
  const [k] = await db.execute<Record<string, unknown>>(sql`
    select
      (select count(*) from users u where u.status <> 'deleted' and ${demo})::int as users,
      (select count(*) from users u where u.created_at > now() - interval '7 days' and ${demo})::int as new_users_7d,
      (select count(*) from users u where u.last_seen_at > now() - interval '30 days' and ${demo})::int as active_30d,
      (select count(*) from services s where ${sdemo})::int as services,
      (select count(*) from services s where s.status = 'open' and ${sdemo})::int as services_open,
      (select count(*) from services s where s.status = 'completed' and ${sdemo})::int as services_completed,
      (select count(*) from services s where s.status = 'cancelled' and ${sdemo})::int as services_cancelled,
      (select count(*) from services s where s.moderation = 'pending_review')::int as services_held,
      (select coalesce(sum(p.amount_cents), 0) from payments p where p.status in ('captured','partially_refunded') and p.provider = 'stripe')::bigint as volume_live,
      (select coalesce(sum(p.fee_cents), 0) from payments p where p.status in ('captured','partially_refunded') and p.provider = 'stripe')::bigint as revenue_live,
      (select coalesce(sum(p.amount_cents), 0) from payments p where p.status in ('captured','partially_refunded') and p.provider = 'simulation')::bigint as volume_sim,
      (select coalesce(sum(p.fee_cents), 0) from payments p where p.status in ('captured','partially_refunded') and p.provider = 'simulation')::bigint as revenue_sim,
      (select count(*) from disputes where status in ('open','under_review'))::int as disputes_open,
      (select count(*) from reports where status in ('open','reviewing'))::int as reports_open,
      (select count(*) from user_verifications where status = 'pending')::int as verifications_pending,
      (select count(*) from subscriptions where status = 'active')::int as subscriptions_active`);
  const topCategories = await db.execute<{ name: string; n: number }>(sql`
    select c.name, count(*)::int as n from services s join categories c on c.id = s.category_id where ${sdemo}
    group by c.name order by n desc limit 10`);
  const byArea = await db.execute<{ area: string; n: number }>(sql`
    select coalesce(nullif(split_part(s.area_label, ',', 1), ''), 'Inconnu') as area, count(*)::int as n from services s where ${sdemo}
    group by 1 order by n desc limit 10`);
  const daily = await db.execute<{ day: string; services: number; users: number }>(sql`
    with d as (select generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*) from services s where date_trunc('day', s.created_at) = d.day and ${sdemo})::int as services,
      (select count(*) from users u where date_trunc('day', u.created_at) = d.day and ${demo})::int as users
    from d order by d.day`);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    users: n(k.users),
    newUsers7d: n(k.new_users_7d),
    active30d: n(k.active_30d),
    services: n(k.services),
    servicesOpen: n(k.services_open),
    servicesCompleted: n(k.services_completed),
    servicesCancelled: n(k.services_cancelled),
    servicesHeld: n(k.services_held),
    volumeLiveCents: n(k.volume_live),
    revenueLiveCents: n(k.revenue_live),
    volumeSimCents: n(k.volume_sim),
    revenueSimCents: n(k.revenue_sim),
    disputesOpen: n(k.disputes_open),
    reportsOpen: n(k.reports_open),
    verificationsPending: n(k.verifications_pending),
    subscriptionsActive: n(k.subscriptions_active),
    topCategories: topCategories.map((c) => ({ name: c.name, n: Number(c.n) })),
    byArea: byArea.map((a) => ({ area: a.area, n: Number(a.n) })),
    daily: daily.map((d) => ({ day: d.day, services: Number(d.services), users: Number(d.users) })),
  };
}

/** Rentabilité : revenus réels (Stripe) vs simulés, par mois, avec abonnements. */
export async function profitability() {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select to_char(date_trunc('month', t.created_at), 'YYYY-MM') as month, t.provider,
      coalesce(sum(t.amount_cents) filter (where t.type = 'platform_fee'), 0)::int as fees,
      coalesce(-sum(t.amount_cents) filter (where t.type = 'charge'), 0)::int as gmv,
      count(distinct t.payment_id)::int as payments
    from transactions t where t.created_at > now() - interval '12 months'
    group by 1, 2 order by 1`);
  const subs = await db.execute<Record<string, unknown>>(sql`
    select plan, provider, count(*)::int as n, coalesce(sum(price_cents), 0)::int as mrr from subscriptions where status = 'active' group by plan, provider`);
  return {
    months: rows.map((r) => ({ month: String(r.month), provider: String(r.provider), feesCents: Number(r.fees), gmvCents: Number(r.gmv), payments: Number(r.payments) })),
    subscriptions: subs.map((s) => ({ plan: String(s.plan), provider: String(s.provider), count: Number(s.n), mrrCents: Number(s.mrr) })),
  };
}

/** Équilibre offre / demande par zone (grille ~2 km) : détecte où manquent demandeurs ou offreurs. */
export async function marketBalance() {
  const demand = await db.execute<{ lat: number; lng: number; open: number; unanswered: number }>(sql`
    select s.public_lat as lat, s.public_lng as lng, 1 as open,
      case when not exists (select 1 from service_applications a where a.service_id = s.id) and s.created_at < now() - interval '2 hours' then 1 else 0 end as unanswered
    from services s where s.created_at > now() - interval '30 days' and s.status in ('open','assigned','in_progress','completed','expired')`);
  const supply = await db.execute<{ lat: number; lng: number }>(sql`
    select l.lat, l.lng from user_locations l join users u on u.id = l.user_id and u.status = 'active'
    where exists (select 1 from user_skills s where s.user_id = l.user_id)`);
  const cells = new Map<string, { lat: number; lng: number; demand: number; unanswered: number; supply: number }>();
  const cell = (lat: number, lng: number) => {
    const g = gridCell(Number(lat), Number(lng));
    if (!cells.has(g.key)) cells.set(g.key, { lat: g.lat, lng: g.lng, demand: 0, unanswered: 0, supply: 0 });
    return cells.get(g.key)!;
  };
  for (const d of demand) {
    const c = cell(d.lat, d.lng);
    c.demand += 1;
    c.unanswered += Number(d.unanswered);
  }
  for (const s of supply) cell(s.lat, s.lng).supply += 1;
  return [...cells.values()]
    .map((c) => ({
      ...c,
      status: c.demand > 0 && c.supply === 0 ? "manque_offreurs" : c.supply >= 3 && c.demand === 0 ? "manque_demandeurs" : c.unanswered / Math.max(1, c.demand) > 0.5 ? "tension" : "equilibre",
    }))
    .sort((a, b) => b.demand + b.supply - (a.demand + a.supply));
}

/* ───────────── Utilisateurs ───────────── */

export async function searchUsers(q: string, limit = 50) {
  const term = `%${q.trim()}%`;
  return db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      createdAt: users.createdAt,
      isDemo: users.isDemo,
      riskScore: users.riskScore,
      phoneVerifiedAt: users.phoneVerifiedAt,
      identityVerifiedAt: users.identityVerifiedAt,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      ratingAvg: userProfiles.ratingAvg,
      missionsDone: userProfiles.missionsDone,
      role: adminRoles.role,
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(adminRoles, eq(adminRoles.userId, users.id))
    .where(q.trim() ? or(ilike(users.email, term), ilike(userProfiles.firstName, term), ilike(userProfiles.lastName, term), sql`${users.id}::text = ${q.trim()}`) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export async function userDetail(admin: Admin, userId: string) {
  const [u] = await db
    .select({ u: users, p: userProfiles, role: adminRoles.role })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(adminRoles, eq(adminRoles.userId, users.id))
    .where(eq(users.id, userId));
  if (!u) throw notFound("Utilisateur");
  await logAdmin(admin.id, "user.view", { type: "user", id: userId });
  const { passwordHash: _ph, ...safe } = u.u;
  const verifs = await db.select().from(userVerifications).where(eq(userVerifications.userId, userId)).orderBy(desc(userVerifications.createdAt));
  const reportsAgainst = await db.select().from(reports).where(eq(reports.targetUserId, userId)).orderBy(desc(reports.createdAt)).limit(50);
  const svc = await db.select({ id: services.id, title: services.title, status: services.status, createdAt: services.createdAt, moderation: services.moderation }).from(services).where(eq(services.requesterId, userId)).orderBy(desc(services.createdAt)).limit(50);
  const missions = await db.select().from(serviceAssignments).where(or(eq(serviceAssignments.providerId, userId), eq(serviceAssignments.requesterId, userId))).orderBy(desc(serviceAssignments.createdAt)).limit(50);
  const history = await db.select().from(adminLogs).where(and(eq(adminLogs.targetType, "user"), eq(adminLogs.targetId, userId))).orderBy(desc(adminLogs.createdAt)).limit(50);
  return { user: safe, profile: u.p, role: u.role, verifications: verifs, reports: reportsAgainst, services: svc, missions, history };
}

export async function setUserStatus(admin: Admin, userId: string, action: "suspend" | "ban" | "reactivate", input: { reason: string; days?: number }, ip: string | null) {
  if (userId === admin.id) throw badRequest("Action impossible sur votre propre compte");
  const [target] = await db.select({ role: adminRoles.role }).from(adminRoles).where(eq(adminRoles.userId, userId));
  if (target && admin.adminRole !== "super_admin") throw forbidden("Seul un super-administrateur peut sanctionner un membre de l'équipe");
  if (!input.reason.trim()) throw badRequest("Motif obligatoire");
  if (action === "ban" && admin.adminRole !== "super_admin" && admin.adminRole !== "moderator") throw forbidden();
  const patch =
    action === "suspend"
      ? { status: "suspended" as const, suspendedUntil: input.days ? new Date(Date.now() + input.days * 86400_000) : null, suspensionReason: input.reason }
      : action === "ban"
        ? { status: "banned" as const, suspensionReason: input.reason }
        : { status: "active" as const, suspendedUntil: null, suspensionReason: null };
  await db.update(users).set(patch).where(eq(users.id, userId));
  if (action !== "reactivate") {
    // Les demandes ouvertes d'un compte sanctionné sont retirées de la diffusion
    await db.update(services).set({ status: "removed", updatedAt: new Date() }).where(and(eq(services.requesterId, userId), eq(services.status, "open")));
  }
  if (action === "ban") await db.delete(sessions).where(eq(sessions.userId, userId));
  await logAdmin(admin.id, `user.${action}`, { type: "user", id: userId }, { reason: input.reason, days: input.days ?? null }, ip);
  if (action !== "ban")
    await notify({
      userId,
      type: "moderation",
      title: action === "suspend" ? "Compte suspendu" : "Compte réactivé",
      body: action === "suspend" ? `Motif : ${input.reason}${input.days ? ` (durée : ${input.days} jours)` : ""}` : "Votre compte est de nouveau actif.",
      email: true,
    });
}

export async function setAdminRole(admin: Admin, userId: string, role: AdminRole | null, ip: string | null) {
  if (admin.adminRole !== "super_admin") throw forbidden();
  if (userId === admin.id) throw badRequest("Vous ne pouvez pas modifier votre propre rôle");
  if (role) await db.insert(adminRoles).values({ userId, role, grantedBy: admin.id }).onConflictDoUpdate({ target: adminRoles.userId, set: { role, grantedBy: admin.id } });
  else await db.delete(adminRoles).where(eq(adminRoles.userId, userId));
  await logAdmin(admin.id, "admin.role", { type: "user", id: userId }, { role }, ip);
}

/* ───────────── Vérifications ───────────── */

export async function pendingVerifications() {
  return db
    .select({ v: userVerifications, firstName: userProfiles.firstName, lastName: userProfiles.lastName, email: users.email })
    .from(userVerifications)
    .innerJoin(users, eq(users.id, userVerifications.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, userVerifications.userId))
    .where(eq(userVerifications.status, "pending"))
    .orderBy(userVerifications.createdAt);
}

export async function decideVerification(admin: Admin, id: string, approve: boolean, note: string, ip: string | null) {
  const [v] = await db.select().from(userVerifications).where(eq(userVerifications.id, id));
  if (!v) throw notFound("Vérification");
  if (v.status !== "pending") throw badRequest("Déjà traitée");
  await db.update(userVerifications).set({ status: approve ? "approved" : "rejected", reviewedBy: admin.id, decisionNote: note, decidedAt: new Date() }).where(eq(userVerifications.id, id));
  if (approve && v.type === "identity") await db.update(users).set({ identityVerifiedAt: new Date() }).where(eq(users.id, v.userId));
  await logAdmin(admin.id, `verification.${approve ? "approve" : "reject"}`, { type: "user", id: v.userId }, { verificationId: id, type: v.type, note }, ip);
  await notify({
    userId: v.userId,
    type: "system",
    title: approve ? "Vérification validée" : "Vérification refusée",
    body: approve ? `Votre ${v.type === "identity" ? "identité" : "référence"} a été validée.` : `Motif : ${note || "informations insuffisantes"}`,
    link: "/profil/verifications",
  });
  if (approve) await evaluateBadges(v.userId);
}

/* ───────────── Annonces ───────────── */

export async function moderationQueue() {
  return db
    .select({ s: services, firstName: userProfiles.firstName, email: users.email, category: categories.name })
    .from(services)
    .innerJoin(users, eq(users.id, services.requesterId))
    .innerJoin(userProfiles, eq(userProfiles.userId, services.requesterId))
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .where(eq(services.moderation, "pending_review"))
    .orderBy(desc(services.riskScore));
}

export async function listServicesAdmin(q: string, status?: string) {
  return db
    .select({ id: services.id, title: services.title, status: services.status, moderation: services.moderation, riskScore: services.riskScore, createdAt: services.createdAt, isDemo: services.isDemo, firstName: userProfiles.firstName, category: categories.name, budgetCents: services.budgetCents })
    .from(services)
    .innerJoin(userProfiles, eq(userProfiles.userId, services.requesterId))
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .where(and(q ? ilike(services.title, `%${q}%`) : undefined, status ? sql`${services.status} = ${status}` : undefined))
    .orderBy(desc(services.createdAt))
    .limit(100);
}

export async function moderateService(admin: Admin, id: string, decision: "approve" | "reject" | "remove", reason: string, ip: string | null) {
  const [s] = await db.select({ s: services, c: categories }).from(services).innerJoin(categories, eq(categories.id, services.categoryId)).where(eq(services.id, id));
  if (!s) throw notFound("Demande");
  if (decision === "approve") {
    await db.update(services).set({ moderation: "approved", updatedAt: new Date() }).where(eq(services.id, id));
    await notify({ userId: s.s.requesterId, type: "moderation", title: "Demande publiée", body: `« ${s.s.title} » est en ligne.`, link: `/missions/${id}` });
    await broadcastService({ ...s.s, categoryGroup: s.c.groupName, categoryName: s.c.name, requiresPhone: s.c.requiresPhone, requiresIdentity: s.c.requiresIdentity });
  } else {
    await db.update(services).set({ moderation: "rejected", status: decision === "remove" ? "removed" : s.s.status === "open" ? "removed" : s.s.status, updatedAt: new Date(), cancelReason: reason }).where(eq(services.id, id));
    await notify({ userId: s.s.requesterId, type: "moderation", title: "Demande retirée", body: `« ${s.s.title} » ne respecte pas nos règles. Motif : ${reason}`, link: `/missions/${id}` });
  }
  await logAdmin(admin.id, `service.${decision}`, { type: "service", id }, { reason }, ip);
  await publish([s.s.requesterId], { type: "service:updated", serviceId: id });
}

/* ───────────── Signalements ───────────── */

export async function listReports(status: "open" | "all" = "open") {
  return db
    .select({ r: reports, reporterName: userProfiles.firstName })
    .from(reports)
    .innerJoin(userProfiles, eq(userProfiles.userId, reports.reporterId))
    .where(status === "open" ? inArray(reports.status, ["open", "reviewing"]) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

export async function reportTargetPreview(type: string, id: string) {
  const one = async (q: ReturnType<typeof sql>) => (await db.execute<Record<string, unknown>>(q))[0] ?? null;
  switch (type) {
    case "service":
      return one(sql`select id, title as label, description as body from services where id = ${id}`);
    case "message":
      return one(sql`select id, 'Message' as label, body, conversation_id from messages where id = ${id}`);
    case "review":
      return one(sql`select id, 'Avis ' || rating || '/5' as label, comment as body from reviews where id = ${id}`);
    case "user":
      return one(sql`select user_id as id, first_name || ' ' || last_name as label, bio as body from user_profiles where user_id = ${id}`);
    case "post":
      return one(sql`select id, 'Publication' as label, body from posts where id = ${id}`);
    case "conversation":
      return one(sql`select ${id}::uuid as id, 'Conversation' as label, string_agg(left(body, 200), ' · ' order by created_at desc) as body
        from (select body, created_at from messages where conversation_id = ${id} order by created_at desc limit 10) m`);
    default:
      return null;
  }
}

export async function handleReport(admin: Admin, id: string, decision: "actioned" | "dismissed" | "reviewing", resolution: string, ip: string | null) {
  const [r] = await db.select().from(reports).where(eq(reports.id, id));
  if (!r) throw notFound("Signalement");
  await db.update(reports).set({ status: decision, resolution, handledBy: admin.id, handledAt: decision === "reviewing" ? null : new Date() }).where(eq(reports.id, id));
  if (decision === "actioned") {
    if (r.targetType === "review") await db.update(reviews).set({ status: "hidden" }).where(eq(reviews.id, r.targetId));
    if (r.targetType === "post") await db.execute(sql`update posts set hidden = true where id = ${r.targetId}`);
    if (r.targetType === "message") await db.execute(sql`update messages set deleted_at = now() where id = ${r.targetId}`);
    if (r.targetType === "service") await db.update(services).set({ status: "removed", moderation: "rejected" }).where(eq(services.id, r.targetId));
  }
  if (decision === "dismissed" && r.targetType === "review") await db.update(reviews).set({ status: "visible" }).where(eq(reviews.id, r.targetId));
  if (r.targetType === "review") {
    const [rv] = await db.select({ t: reviews.targetId }).from(reviews).where(eq(reviews.id, r.targetId));
    if (rv) await recomputeStats(rv.t);
  }
  await logAdmin(admin.id, `report.${decision}`, { type: "report", id }, { resolution, target: `${r.targetType}:${r.targetId}` }, ip);
  if (decision !== "reviewing")
    await notify({ userId: r.reporterId, type: "moderation", title: "Signalement traité", body: decision === "actioned" ? "Merci : des mesures ont été prises." : "Après examen, aucune infraction n'a été constatée." });
}

/* ───────────── Litiges ───────────── */

export async function listDisputes(status: "open" | "all" = "open") {
  return db.execute<Record<string, unknown>>(sql`
    select d.*, s.title as service_title, s.id as service_id, a.agreed_price_cents, a.provider_id, a.requester_id, a.conversation_id,
      pp.first_name as provider_name, rp.first_name as requester_name, op.first_name as opened_by_name,
      p.status as payment_status, p.amount_cents as payment_amount, p.provider as payment_provider
    from disputes d join service_assignments a on a.id = d.assignment_id join services s on s.id = a.service_id
    join user_profiles pp on pp.user_id = a.provider_id join user_profiles rp on rp.user_id = a.requester_id
    join user_profiles op on op.user_id = d.opened_by
    left join payments p on p.id = d.payment_id
    ${status === "open" ? sql`where d.status in ('open','under_review')` : sql``}
    order by d.created_at desc limit 200`);
}

export async function resolveDispute(admin: Admin, id: string, input: { outcome: "resolved_requester" | "resolved_provider" | "resolved_split" | "under_review"; resolution: string; refundCents?: number }, ip: string | null) {
  const [d] = await db.select().from(disputes).where(eq(disputes.id, id));
  if (!d) throw notFound("Litige");
  if (!["open", "under_review"].includes(d.status)) throw badRequest("Litige déjà clôturé");
  const [a] = await db.select().from(serviceAssignments).where(eq(serviceAssignments.id, d.assignmentId));
  if (input.outcome !== "under_review") {
    const pay = await paymentForAssignment(a.id);
    if (input.outcome === "resolved_provider") {
      if (pay?.status === "authorized") await capturePayment(a.id);
      await db.update(serviceAssignments).set({ status: "completed", completedAt: a.completedAt ?? new Date() }).where(eq(serviceAssignments.id, a.id));
    } else if (input.outcome === "resolved_requester") {
      await cancelOrRefund(a.id);
      await db.update(serviceAssignments).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: "Litige résolu en faveur du demandeur" }).where(eq(serviceAssignments.id, a.id));
    } else {
      if (pay?.status === "authorized") await capturePayment(a.id);
      if (input.refundCents) await cancelOrRefund(a.id, input.refundCents);
      await db.update(serviceAssignments).set({ status: "completed", completedAt: a.completedAt ?? new Date() }).where(eq(serviceAssignments.id, a.id));
    }
    await recomputeStats(a.providerId);
    await recomputeStats(a.requesterId);
  }
  await db.update(disputes).set({ status: input.outcome, resolution: input.resolution, refundCents: input.refundCents ?? null, resolvedBy: admin.id, resolvedAt: input.outcome === "under_review" ? null : new Date() }).where(eq(disputes.id, id));
  await logAdmin(admin.id, `dispute.${input.outcome}`, { type: "dispute", id }, { resolution: input.resolution, refundCents: input.refundCents ?? null }, ip);
  for (const uid of [a.providerId, a.requesterId])
    await notify({ userId: uid, type: "dispute", title: input.outcome === "under_review" ? "Litige en cours d'examen" : "Litige résolu", body: input.resolution, link: `/missions/${a.serviceId}`, email: input.outcome !== "under_review" });
}

/* ───────────── Avis ───────────── */

export async function moderateReview(admin: Admin, id: string, visible: boolean, ip: string | null) {
  const [r] = await db.update(reviews).set({ status: visible ? "visible" : "hidden" }).where(eq(reviews.id, id)).returning();
  if (!r) throw notFound("Avis");
  await recomputeStats(r.targetId);
  await logAdmin(admin.id, `review.${visible ? "restore" : "hide"}`, { type: "review", id }, {}, ip);
}

/* ───────────── Catalogue ───────────── */

export async function upsertCategory(admin: Admin, input: Partial<typeof categories.$inferInsert> & { id?: number }, ip: string | null) {
  if (input.id) {
    const { id, ...patch } = input;
    const [c] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
    await logAdmin(admin.id, "category.update", { type: "category", id: String(id) }, patch as Record<string, unknown>, ip);
    return c;
  }
  if (!input.slug || !input.name || !input.groupName) throw badRequest("Slug, nom et groupe requis");
  const [c] = await db.insert(categories).values(input as typeof categories.$inferInsert).returning();
  await logAdmin(admin.id, "category.create", { type: "category", id: String(c.id) }, { name: c.name }, ip);
  return c;
}

export async function upsertBadge(admin: Admin, input: Partial<typeof badges.$inferInsert> & { id?: number }, ip: string | null) {
  if (input.id) {
    const { id, ...patch } = input;
    const [b] = await db.update(badges).set(patch).where(eq(badges.id, id)).returning();
    await logAdmin(admin.id, "badge.update", { type: "badge", id: String(id) }, patch as Record<string, unknown>, ip);
    return b;
  }
  if (!input.slug || !input.name || !input.rule) throw badRequest("Slug, nom et règle requis");
  const [b] = await db.insert(badges).values(input as typeof badges.$inferInsert).returning();
  await logAdmin(admin.id, "badge.create", { type: "badge", id: String(b.id) }, { name: b.name }, ip);
  return b;
}

export async function updateSetting(admin: Admin, key: keyof Settings, value: unknown, ip: string | null) {
  const row = await setSetting(key, value, admin.id);
  invalidateSettings();
  await logAdmin(admin.id, "settings.update", { type: "setting", id: key }, { value }, ip);
  return row;
}

/* ───────────── Communication ───────────── */

export async function sendAnnouncement(admin: Admin, input: { title: string; body: string; audience: "all" | "providers" | "requesters" }, ip: string | null) {
  const audience =
    input.audience === "providers"
      ? sql`exists (select 1 from user_skills s where s.user_id = u.id)`
      : input.audience === "requesters"
        ? sql`exists (select 1 from services s where s.requester_id = u.id)`
        : sql`true`;
  const recipients = await db.execute<{ id: string }>(sql`select u.id from users u where u.status = 'active' and ${audience}`);
  const [a] = await db.insert(announcements).values({ title: input.title, body: input.body, audience: input.audience, createdBy: admin.id, recipients: recipients.length }).returning();
  for (const r of recipients) await notify({ userId: r.id, type: "announcement", title: input.title, body: input.body, dedupeKey: `announcement:${a.id}` });
  await logAdmin(admin.id, "announcement.send", { type: "announcement", id: a.id }, { audience: input.audience, recipients: recipients.length }, ip);
  return a;
}

export async function listAnnouncements() {
  return db.select().from(announcements).orderBy(desc(announcements.createdAt)).limit(50);
}

export async function listLogs(limit = 200) {
  return db
    .select({ l: adminLogs, firstName: userProfiles.firstName })
    .from(adminLogs)
    .leftJoin(userProfiles, eq(userProfiles.userId, adminLogs.adminId))
    .orderBy(desc(adminLogs.id))
    .limit(limit);
}
