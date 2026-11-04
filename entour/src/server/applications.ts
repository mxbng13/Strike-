import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, serviceApplications, serviceAssignments, services, userProfiles } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { AppError, badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { formatEUR } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import type { z } from "zod";
import type { applySchema } from "@/lib/validators";
import { assertNotBlocked, ensureMissionConversation, systemMessage } from "./conversations";
import { notify } from "./notifications";
import { getServiceDetail } from "./services";

export async function applyToService(user: CurrentUser, serviceId: string, input: z.infer<typeof applySchema>) {
  const settings = await getSettings();
  await rateLimit(`apply:${user.id}`, settings.limits.maxApplicationsPerDay, 86400);
  const detail = await getServiceDetail(serviceId, user);
  if (detail.viewer?.isOwner) throw badRequest("Vous ne pouvez pas répondre à votre propre demande");
  if (detail.status !== "open" && detail.status !== "assigned") throw badRequest("Cette demande n'accepte plus de candidatures");
  if (detail.moderation !== "approved") throw badRequest("Cette demande est en cours de vérification");
  if (!detail.viewer?.eligibility.ok) throw new AppError(403, "not_eligible", `Pour cette catégorie : ${detail.viewer?.eligibility.reasons.join(", ")}.`);
  await assertNotBlocked(user.id, detail.requester.id);

  let price: number | null = null;
  if (input.acceptsBudget) {
    if (detail.budgetCents == null) throw badRequest("Aucun budget indiqué : proposez votre tarif");
    price = detail.budgetCents;
  } else if (input.proposedPriceCents != null) {
    if (detail.pricingType === "fixed") throw badRequest("Le prix de cette demande est fixe : acceptez-le ou posez une question");
    price = input.proposedPriceCents;
  } else if (detail.pricingType === "offer") {
    throw badRequest("Indiquez votre tarif");
  }
  if (price === null && detail.budgetCents != null) price = detail.budgetCents;

  const status = detail.seatsLeft > 0 ? "pending" : "waitlisted";
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(serviceApplications).where(and(eq(serviceApplications.serviceId, serviceId), eq(serviceApplications.applicantId, user.id)));
    if (existing && existing.status !== "withdrawn") throw conflict("Vous avez déjà répondu à cette demande");
    const conv = await ensureMissionConversation(tx, serviceId, detail.requester.id, user.id);
    const values = {
      message: input.message,
      experience: input.experience,
      proposedPriceCents: price,
      acceptsBudget: input.acceptsBudget,
      status: status as "pending" | "waitlisted",
      conversationId: conv.id,
      createdAt: new Date(),
      decidedAt: null,
    };
    const [app] = existing
      ? await tx.update(serviceApplications).set(values).where(eq(serviceApplications.id, existing.id)).returning()
      : await tx.insert(serviceApplications).values({ serviceId, applicantId: user.id, ...values }).returning();
    return { app, conv };
  });

  const priceText = price != null ? (input.acceptsBudget ? `accepte le tarif de ${formatEUR(price)}` : `propose ${formatEUR(price)}`) : "souhaite en discuter";
  await systemMessage(
    result.conv.id,
    `${user.firstName} ${priceText}${status === "waitlisted" ? " (liste d'attente)" : ""}.`,
    { action: { type: "application", amountCents: price ?? undefined, status } },
    user.id,
    "action",
  );
  if (input.message.trim()) {
    const { messages } = await import("@/db/schema");
    await db.insert(messages).values({ conversationId: result.conv.id, senderId: user.id, kind: "text", body: input.message.trim().slice(0, 1000) });
  }
  await notify({
    userId: detail.requester.id,
    type: "application_received",
    title: `${user.firstName} est intéressé(e)`,
    body: `« ${detail.title} » · ${price != null ? formatEUR(price) : "tarif à discuter"}`,
    link: `/missions/${serviceId}/candidatures`,
    dedupeKey: `app:${result.app.id}:${result.app.createdAt.getTime()}`,
  });
  await publish([detail.requester.id], { type: "service:updated", serviceId });
  return { application: result.app, conversationId: result.conv.id };
}

/** Question avant engagement : ouvre la conversation de mission sans candidater. */
export async function askQuestion(user: CurrentUser, serviceId: string, body: string) {
  const detail = await getServiceDetail(serviceId, user);
  if (detail.viewer?.isOwner) throw badRequest("Action impossible sur votre propre demande");
  await assertNotBlocked(user.id, detail.requester.id);
  const conv = await ensureMissionConversation(db, serviceId, detail.requester.id, user.id);
  const { sendMessage } = await import("./conversations");
  await sendMessage(user, conv.id, { body, kind: "text", attachmentKeys: [] });
  return { conversationId: conv.id };
}

export async function withdrawApplication(user: CurrentUser, applicationId: string) {
  const [a] = await db.select().from(serviceApplications).where(eq(serviceApplications.id, applicationId));
  if (!a || a.applicantId !== user.id) throw notFound("Candidature");
  if (!["pending", "waitlisted"].includes(a.status)) throw badRequest("Cette candidature ne peut plus être retirée");
  await db.update(serviceApplications).set({ status: "withdrawn", decidedAt: new Date() }).where(eq(serviceApplications.id, applicationId));
  if (a.conversationId) await systemMessage(a.conversationId, `${user.firstName} a retiré sa candidature.`);
}

/** Candidatures d'une demande avec les éléments de comparaison (réservé au demandeur). */
export async function listApplicationsForOwner(user: CurrentUser, serviceId: string) {
  const [s] = await db.select().from(services).where(eq(services.id, serviceId));
  if (!s) throw notFound("Demande");
  if (s.requesterId !== user.id && !user.adminRole) throw forbidden();
  const rows = await db.execute<Record<string, unknown>>(sql`
    select a.id, a.status, a.message, a.experience, a.proposed_price_cents, a.accepts_budget, a.created_at, a.conversation_id,
      u.id as user_id, u.created_at as member_since,
      (u.phone_verified_at is not null) as phone_verified, (u.identity_verified_at is not null) as identity_verified,
      p.first_name, p.avatar_url, p.bio, p.rating_avg, p.rating_count, p.missions_done, p.missions_cancelled, p.on_time_count, p.late_count,
      p.provider_rating_avg, p.provider_rating_count,
      case when l.user_id is null then null else
        earth_distance(ll_to_earth(l.lat, l.lng), ll_to_earth(${s.publicLat}, ${s.publicLng})) / 1000.0 end as distance_km,
      sk.years_experience as skill_years, sk.certified as skill_certified, sk.description as skill_description,
      (select count(*) from service_assignments x join services sv on sv.id = x.service_id
        where x.provider_id = u.id and x.status = 'completed' and sv.category_id = ${s.categoryId})::int as similar_done,
      (select count(*) from service_assignments x where x.provider_id = u.id and x.requester_id = ${user.id} and x.status = 'completed')::int as worked_with_me,
      exists (select 1 from favorites f where f.user_id = ${user.id} and f.kind = 'trusted' and f.target_id = u.id) as trusted,
      (select coalesce(json_agg(json_build_object('name', b.name, 'icon', b.icon, 'color', b.color) order by b.sort_order), '[]'::json)
         from user_badges ub join badges b on b.id = ub.badge_id where ub.user_id = u.id and b.slug <> 'nouveau-membre') as badges
    from service_applications a
    join users u on u.id = a.applicant_id
    join user_profiles p on p.user_id = u.id
    left join user_locations l on l.user_id = u.id
    left join user_skills sk on sk.user_id = u.id and sk.category_id = ${s.categoryId}
    where a.service_id = ${serviceId}
    order by case a.status when 'accepted' then 0 when 'pending' then 1 when 'waitlisted' then 2 else 3 end, a.created_at asc`);
  return rows.map((r) => {
    const done = Number(r.missions_done ?? 0);
    const cancelled = Number(r.missions_cancelled ?? 0);
    const punct = Number(r.on_time_count ?? 0) + Number(r.late_count ?? 0);
    return {
      id: String(r.id),
      status: String(r.status),
      message: String(r.message ?? ""),
      experience: String(r.experience ?? ""),
      proposedPriceCents: r.proposed_price_cents == null ? null : Number(r.proposed_price_cents),
      acceptsBudget: !!r.accepts_budget,
      createdAt: new Date(r.created_at as string).toISOString(),
      conversationId: (r.conversation_id as string) ?? null,
      applicant: {
        id: String(r.user_id),
        firstName: String(r.first_name),
        avatarUrl: (r.avatar_url as string) ?? null,
        bio: String(r.bio ?? ""),
        memberSince: new Date(r.member_since as string).toISOString(),
        phoneVerified: !!r.phone_verified,
        identityVerified: !!r.identity_verified,
        ratingAvg: Number(r.rating_avg ?? 0),
        ratingCount: Number(r.rating_count ?? 0),
        missionsDone: done,
        completionRate: done + cancelled ? Math.round((done / (done + cancelled)) * 100) : null,
        punctualityRate: punct ? Math.round((Number(r.on_time_count) / punct) * 100) : null,
        distanceKm: r.distance_km == null ? null : Number(r.distance_km),
        skillYears: r.skill_years == null ? null : Number(r.skill_years),
        skillCertified: !!r.skill_certified,
        skillDescription: (r.skill_description as string) ?? null,
        similarDone: Number(r.similar_done ?? 0),
        workedWithMe: Number(r.worked_with_me ?? 0),
        trusted: !!r.trusted,
        badges: (r.badges as { name: string; icon: string; color: string }[]) ?? [],
      },
    };
  });
}
export type ApplicationForOwner = Awaited<ReturnType<typeof listApplicationsForOwner>>[number];

/**
 * Sélection d'un intervenant. Sécurité concurrente :
 *  - verrou de ligne (SELECT … FOR UPDATE) sur la demande pendant la transaction ;
 *  - contrôle du nombre de places restantes ;
 *  - trigger PostgreSQL de capacité en dernier rempart.
 * Deux sélections simultanées ne peuvent donc jamais dépasser le nombre de places.
 */
export async function acceptApplication(user: CurrentUser, applicationId: string) {
  const outcome = await db.transaction(async (tx) => {
    const [app] = await tx.select().from(serviceApplications).where(eq(serviceApplications.id, applicationId));
    if (!app) throw notFound("Candidature");
    const locked = await tx.execute<{ id: string; requester_id: string; status: string; people_needed: number; budget_cents: number | null; purchase_cents: number | null; starts_at: string | null; title: string }>(
      sql`select id, requester_id, status, people_needed, budget_cents, purchase_cents, starts_at, title from services where id = ${app.serviceId} for update`,
    );
    const s = locked[0];
    if (!s) throw notFound("Demande");
    if (s.requester_id !== user.id) throw forbidden();
    if (!["open", "assigned"].includes(s.status)) throw badRequest("Cette demande n'est plus ouverte");
    if (!["pending", "waitlisted"].includes(app.status)) throw conflict("Cette candidature a déjà été traitée");
    const [{ active }] = await tx
      .select({ active: sql<number>`count(*)::int` })
      .from(serviceAssignments)
      .where(and(eq(serviceAssignments.serviceId, app.serviceId), sql`${serviceAssignments.status} <> 'cancelled'`));
    if (active >= s.people_needed) throw conflict("Toutes les places de cette mission sont déjà attribuées");
    const price = app.proposedPriceCents ?? s.budget_cents;
    if (price == null) throw badRequest("Mettez-vous d'accord sur un prix dans la conversation avant de confirmer");

    const conv = await ensureMissionConversation(tx, app.serviceId, user.id, app.applicantId);
    const [assignment] = await tx
      .insert(serviceAssignments)
      .values({
        serviceId: app.serviceId,
        providerId: app.applicantId,
        requesterId: user.id,
        applicationId: app.id,
        conversationId: conv.id,
        agreedPriceCents: price,
        purchaseCents: s.purchase_cents ?? 0,
        startsAt: s.starts_at ? new Date(s.starts_at) : null,
      })
      .returning();
    await tx.update(serviceApplications).set({ status: "accepted", decidedAt: new Date() }).where(eq(serviceApplications.id, app.id));
    const full = active + 1 >= s.people_needed;
    let waitlisted: string[] = [];
    if (full) {
      await tx.update(services).set({ status: "assigned", updatedAt: new Date() }).where(eq(services.id, app.serviceId));
      const others = await tx
        .update(serviceApplications)
        .set({ status: "waitlisted" })
        .where(and(eq(serviceApplications.serviceId, app.serviceId), eq(serviceApplications.status, "pending")))
        .returning({ applicantId: serviceApplications.applicantId });
      waitlisted = others.map((o) => o.applicantId);
    }
    return { assignment, app, s, conv, waitlisted, price };
  });

  const [prov] = await db.select({ firstName: userProfiles.firstName }).from(userProfiles).where(eq(userProfiles.userId, outcome.app.applicantId));
  await systemMessage(
    outcome.conv.id,
    `Mission confirmée : ${user.firstName} a choisi ${prov?.firstName ?? "l'intervenant"} pour ${formatEUR(outcome.price)}${outcome.s.purchase_cents ? ` + ${formatEUR(outcome.s.purchase_cents)} d'achats à avancer. ${user.firstName} doit d'abord bloquer ${formatEUR(outcome.price + outcome.s.purchase_cents)} dans la tirelire ENTOUR : n'achetez rien avant` : ""}. L'adresse exacte est désormais visible dans la fiche mission.`,
    { action: { type: "assignment_confirmed", amountCents: outcome.price } },
  );
  await notify({
    userId: outcome.app.applicantId,
    type: "application_accepted",
    title: "Vous avez été choisi(e) !",
    body: `${user.firstName} vous confie « ${outcome.s.title} » pour ${formatEUR(outcome.price)}.`,
    link: `/messages/${outcome.conv.id}`,
    email: true,
  });
  for (const w of outcome.waitlisted)
    await notify({
      userId: w,
      type: "application_waitlisted",
      title: "Mission attribuée",
      body: `« ${outcome.s.title} » a été confiée à quelqu'un d'autre. Vous restez en liste d'attente si une place se libère.`,
      link: `/missions/${outcome.s.id}`,
    });
  await publish([user.id, outcome.app.applicantId, ...outcome.waitlisted], { type: "service:updated", serviceId: outcome.s.id });
  return outcome.assignment;
}

export async function rejectApplication(user: CurrentUser, applicationId: string) {
  const [a] = await db
    .select({ a: serviceApplications, requesterId: services.requesterId, title: services.title })
    .from(serviceApplications)
    .innerJoin(services, eq(services.id, serviceApplications.serviceId))
    .where(eq(serviceApplications.id, applicationId));
  if (!a) throw notFound("Candidature");
  if (a.requesterId !== user.id) throw forbidden();
  if (!["pending", "waitlisted"].includes(a.a.status)) throw badRequest("Candidature déjà traitée");
  await db.update(serviceApplications).set({ status: "rejected", decidedAt: new Date() }).where(eq(serviceApplications.id, applicationId));
  await notify({ userId: a.a.applicantId, type: "application_rejected", title: "Candidature non retenue", body: `Le demandeur a choisi une autre option pour « ${a.title} ». Merci pour votre proposition !`, link: `/missions/${a.a.serviceId}` });
}

/** Missions où j'ai candidaté (côté offreur), y compris l'historique des candidatures refusées. */
export async function myApplications(userId: string) {
  const rows = await db
    .select({
      id: serviceApplications.id,
      status: serviceApplications.status,
      proposedPriceCents: serviceApplications.proposedPriceCents,
      createdAt: serviceApplications.createdAt,
      conversationId: serviceApplications.conversationId,
      serviceId: services.id,
      title: services.title,
      serviceStatus: services.status,
      startsAt: services.startsAt,
      areaLabel: services.areaLabel,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      requesterName: userProfiles.firstName,
    })
    .from(serviceApplications)
    .innerJoin(services, eq(services.id, serviceApplications.serviceId))
    .innerJoin(categories, eq(categories.id, services.categoryId))
    .innerJoin(userProfiles, eq(userProfiles.userId, services.requesterId))
    .where(eq(serviceApplications.applicantId, userId))
    .orderBy(desc(serviceApplications.createdAt))
    .limit(200);
  return rows;
}

export async function promoteWaitlist(serviceId: string) {
  const waiting = await db
    .select({ applicantId: serviceApplications.applicantId, id: serviceApplications.id })
    .from(serviceApplications)
    .where(and(eq(serviceApplications.serviceId, serviceId), eq(serviceApplications.status, "waitlisted")));
  if (!waiting.length) return;
  await db.update(serviceApplications).set({ status: "pending" }).where(inArray(serviceApplications.id, waiting.map((w) => w.id)));
  const [s] = await db.select({ title: services.title }).from(services).where(eq(services.id, serviceId));
  for (const w of waiting)
    await notify({ userId: w.applicantId, type: "application_waitlisted", title: "Une place s'est libérée", body: `« ${s?.title} » est de nouveau disponible : votre candidature est réactivée.`, link: `/missions/${serviceId}` });
}
