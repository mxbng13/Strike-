import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { groupMembers, groups, postLikes, posts, referrals, userProfiles, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { fuzzLocation } from "@/lib/geo";
import { analyzeMessage } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "./notifications";
import { getLocation } from "./users";

/* ───────────── Personnes disponibles autour de moi ───────────── */

export async function availableNeighbors(viewerId: string | null, lat: number, lng: number, radiusKm: number, opts: { categoryId?: number; onlyNow?: boolean; limit?: number } = {}) {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select p.user_id as id, p.first_name, p.avatar_url, p.rating_avg, p.rating_count, p.missions_done, p.area_label,
      (p.available_until is not null and p.available_until > now()) as available_now, p.available_until,
      (u.phone_verified_at is not null and u.identity_verified_at is not null) as verified,
      earth_distance(ll_to_earth(l.lat, l.lng), ll_to_earth(${lat}, ${lng})) / 1000.0 as distance_km,
      (select coalesce(json_agg(json_build_object('name', c.name, 'icon', c.icon, 'color', c.color)), '[]'::json)
         from (select c.* from user_skills s join categories c on c.id = s.category_id where s.user_id = p.user_id limit 4) c) as skills
    from user_locations l
    join users u on u.id = l.user_id and u.status = 'active' and u.email_verified_at is not null
    join user_profiles p on p.user_id = l.user_id
    where earth_box(ll_to_earth(${lat}, ${lng}), ${radiusKm * 1000}) @> ll_to_earth(l.lat, l.lng)
      and earth_distance(ll_to_earth(l.lat, l.lng), ll_to_earth(${lat}, ${lng})) <= ${radiusKm * 1000}
      ${viewerId ? sql`and l.user_id <> ${viewerId} and not exists (select 1 from blocks b where (b.blocker_id = ${viewerId} and b.blocked_id = l.user_id) or (b.blocker_id = l.user_id and b.blocked_id = ${viewerId}))` : sql``}
      ${opts.onlyNow ? sql`and p.available_until > now()` : sql`and exists (select 1 from user_skills s where s.user_id = l.user_id)`}
      ${opts.categoryId ? sql`and exists (select 1 from user_skills s where s.user_id = l.user_id and s.category_id = ${opts.categoryId})` : sql``}
    order by (p.available_until is not null and p.available_until > now()) desc, p.rating_avg * least(p.rating_count, 10) desc, distance_km asc
    limit ${opts.limit ?? 20}`);
  return rows.map((r) => ({
    id: String(r.id),
    firstName: String(r.first_name),
    avatarUrl: (r.avatar_url as string) ?? null,
    ratingAvg: Number(r.rating_avg ?? 0),
    ratingCount: Number(r.rating_count ?? 0),
    missionsDone: Number(r.missions_done ?? 0),
    areaLabel: (r.area_label as string) ?? null,
    availableNow: !!r.available_now,
    verified: !!r.verified,
    // Distance volontairement arrondie (au demi-kilomètre) pour protéger la position
    distanceKm: Math.max(0.5, Math.round(Number(r.distance_km) * 2) / 2),
    skills: (r.skills as { name: string; icon: string; color: string }[]) ?? [],
  }));
}

/* ───────────── Groupes de quartier et thématiques ───────────── */

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export async function listGroups(viewerId: string, lat: number, lng: number) {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select g.id, g.slug, g.name, g.description, g.kind, g.category_group, g.area_label, g.members_count, g.radius_km,
      earth_distance(ll_to_earth(g.lat, g.lng), ll_to_earth(${lat}, ${lng})) / 1000.0 as distance_km,
      exists (select 1 from group_members m where m.group_id = g.id and m.user_id = ${viewerId}) as is_member
    from groups g
    where earth_box(ll_to_earth(${lat}, ${lng}), 30000) @> ll_to_earth(g.lat, g.lng)
       or exists (select 1 from group_members m where m.group_id = g.id and m.user_id = ${viewerId})
    order by is_member desc, distance_km asc limit 50`);
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: String(r.description ?? ""),
    kind: String(r.kind),
    categoryGroup: (r.category_group as string) ?? null,
    areaLabel: String(r.area_label),
    membersCount: Number(r.members_count),
    distanceKm: Number(r.distance_km),
    isMember: !!r.is_member,
  }));
}

export async function createGroup(user: CurrentUser, input: { name: string; description: string; kind: "neighborhood" | "topic"; categoryGroup?: string | null }) {
  await rateLimit(`group:${user.id}`, 3, 86400);
  const loc = await getLocation(user.id);
  if (!loc) throw badRequest("Définissez d'abord votre localisation");
  const base = slugify(`${input.name}-${loc.label}`) || "groupe";
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  const center = fuzzLocation(loc.lat, loc.lng, slug, 200, 600);
  const g = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(groups)
      .values({ slug, name: input.name.slice(0, 80), description: input.description.slice(0, 500), kind: input.kind, categoryGroup: input.categoryGroup ?? null, lat: center.lat, lng: center.lng, areaLabel: loc.label, createdBy: user.id, membersCount: 1 })
      .returning();
    await tx.insert(groupMembers).values({ groupId: g.id, userId: user.id, role: "admin" });
    return g;
  });
  return g;
}

export async function joinGroup(userId: string, groupId: string, join: boolean) {
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!g) throw notFound("Groupe");
  if (join) {
    const ins = await db.insert(groupMembers).values({ groupId, userId }).onConflictDoNothing().returning();
    if (ins.length) await db.update(groups).set({ membersCount: sql`${groups.membersCount} + 1` }).where(eq(groups.id, groupId));
  } else {
    const del = await db.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))).returning();
    if (del.length) await db.update(groups).set({ membersCount: sql`greatest(${groups.membersCount} - 1, 0)` }).where(eq(groups.id, groupId));
  }
}

export async function getGroup(slug: string, viewerId: string) {
  const [g] = await db.select().from(groups).where(eq(groups.slug, slug));
  if (!g) throw notFound("Groupe");
  const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, viewerId)));
  return { ...g, isMember: !!m, role: m?.role ?? null };
}

/* ───────────── Fil d'actualité local ───────────── */

export async function feed(viewerId: string, lat: number, lng: number, groupId?: string) {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select po.id, po.kind, po.body, po.created_at, po.likes_count, po.area_label, po.group_id, po.service_id,
      a.user_id as author_id, a.first_name as author_name, a.avatar_url as author_avatar,
      t.user_id as thanked_id, t.first_name as thanked_name, t.avatar_url as thanked_avatar,
      g.name as group_name, g.slug as group_slug,
      exists (select 1 from post_likes pl where pl.post_id = po.id and pl.user_id = ${viewerId}) as liked
    from posts po
    join user_profiles a on a.user_id = po.author_id
    left join user_profiles t on t.user_id = po.thanked_user_id
    left join groups g on g.id = po.group_id
    where po.hidden = false
      ${groupId ? sql`and po.group_id = ${groupId}` : sql`and (po.group_id is null and earth_box(ll_to_earth(${lat}, ${lng}), 10000) @> ll_to_earth(po.public_lat, po.public_lng)
          or po.group_id in (select group_id from group_members where user_id = ${viewerId}))`}
      and not exists (select 1 from blocks b where (b.blocker_id = ${viewerId} and b.blocked_id = po.author_id) or (b.blocker_id = po.author_id and b.blocked_id = ${viewerId}))
    order by po.created_at desc limit 60`);
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    body: String(r.body),
    createdAt: new Date(r.created_at as string).toISOString(),
    likesCount: Number(r.likes_count),
    liked: !!r.liked,
    areaLabel: String(r.area_label),
    author: { id: String(r.author_id), firstName: String(r.author_name), avatarUrl: (r.author_avatar as string) ?? null },
    thanked: r.thanked_id ? { id: String(r.thanked_id), firstName: String(r.thanked_name), avatarUrl: (r.thanked_avatar as string) ?? null } : null,
    group: r.group_slug ? { name: String(r.group_name), slug: String(r.group_slug) } : null,
  }));
}

export async function createPost(user: CurrentUser, input: { body: string; kind: "post" | "thanks" | "offer"; groupId?: string | null; thankedUserId?: string | null }) {
  await rateLimit(`post:${user.id}`, 10, 3600);
  const body = input.body.trim();
  if (body.length < 3) throw badRequest("Message trop court");
  if (analyzeMessage(body).scam) throw badRequest("Ce message ne respecte pas les règles de la communauté");
  const loc = await getLocation(user.id);
  if (!loc) throw badRequest("Définissez d'abord votre localisation");
  if (input.groupId) {
    const [m] = await db.select().from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, user.id)));
    if (!m) throw forbidden("Rejoignez le groupe pour publier");
  }
  if (input.kind === "thanks") {
    if (!input.thankedUserId) throw badRequest("Choisissez la personne à remercier");
    // On ne peut remercier publiquement qu'une personne avec qui l'on a réellement travaillé
    const r = await db.execute(sql`select 1 from service_assignments where status = 'completed'
      and ((provider_id = ${user.id} and requester_id = ${input.thankedUserId}) or (requester_id = ${user.id} and provider_id = ${input.thankedUserId})) limit 1`);
    if (!r.length) throw badRequest("Vous ne pouvez remercier qu'une personne avec qui vous avez réalisé une mission");
  }
  const pos = fuzzLocation(loc.lat, loc.lng, `${user.id}:${Date.now()}`, 300, 800);
  const [p] = await db
    .insert(posts)
    .values({ authorId: user.id, groupId: input.groupId ?? null, kind: input.kind, body: body.slice(0, 1500), thankedUserId: input.kind === "thanks" ? input.thankedUserId : null, publicLat: pos.lat, publicLng: pos.lng, areaLabel: loc.label })
    .returning();
  if (input.kind === "thanks" && input.thankedUserId)
    await notify({ userId: input.thankedUserId, type: "thanks", title: `${user.firstName} vous remercie publiquement 💛`, body: body.slice(0, 120), link: "/communaute" });
  return p;
}

export async function toggleLike(userId: string, postId: string) {
  const [existing] = await db.select().from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
  if (existing) {
    await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    await db.update(posts).set({ likesCount: sql`greatest(${posts.likesCount} - 1, 0)` }).where(eq(posts.id, postId));
    return false;
  }
  await db.insert(postLikes).values({ postId, userId });
  await db.update(posts).set({ likesCount: sql`${posts.likesCount} + 1` }).where(eq(posts.id, postId));
  return true;
}

/* ───────────── Classements (données réelles uniquement) ───────────── */

export async function leaderboards(lat: number, lng: number, radiusKm = 20) {
  const near = sql`earth_box(ll_to_earth(${lat}, ${lng}), ${radiusKm * 1000}) @> ll_to_earth(l.lat, l.lng)`;
  const active = await db.execute<Record<string, unknown>>(sql`
    select p.user_id as id, p.first_name, p.avatar_url, p.rating_avg, p.rating_count, count(a.id)::int as score
    from service_assignments a join user_profiles p on p.user_id = a.provider_id
    join user_locations l on l.user_id = p.user_id join users u on u.id = p.user_id and u.status = 'active'
    where a.status = 'completed' and a.completed_at > now() - interval '30 days' and ${near}
    group by p.user_id, p.first_name, p.avatar_url, p.rating_avg, p.rating_count
    order by score desc, p.rating_avg desc limit 10`);
  const byCategory = await db.execute<Record<string, unknown>>(sql`
    select * from (
      select c.group_name, p.user_id as id, p.first_name, p.avatar_url, p.rating_avg, count(a.id)::int as score,
        row_number() over (partition by c.group_name order by count(a.id) desc, p.rating_avg desc) as rk
      from service_assignments a join services s on s.id = a.service_id join categories c on c.id = s.category_id
      join user_profiles p on p.user_id = a.provider_id join user_locations l on l.user_id = p.user_id
      where a.status = 'completed' and ${near}
      group by c.group_name, p.user_id, p.first_name, p.avatar_url, p.rating_avg
    ) t where rk <= 3 order by group_name, rk`);
  return {
    mostActive: active.map((r) => ({ id: String(r.id), firstName: String(r.first_name), avatarUrl: (r.avatar_url as string) ?? null, ratingAvg: Number(r.rating_avg), ratingCount: Number(r.rating_count), score: Number(r.score) })),
    byCategory: byCategory.map((r) => ({ group: String(r.group_name), id: String(r.id), firstName: String(r.first_name), avatarUrl: (r.avatar_url as string) ?? null, ratingAvg: Number(r.rating_avg), score: Number(r.score), rank: Number(r.rk) })),
  };
}

/* ───────────── Parrainage ───────────── */

export async function referralInfo(userId: string) {
  const [u] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
  const list = await db
    .select({ id: referrals.id, status: referrals.status, createdAt: referrals.createdAt, firstName: userProfiles.firstName })
    .from(referrals)
    .innerJoin(userProfiles, eq(userProfiles.userId, referrals.referredId))
    .where(eq(referrals.referrerId, userId));
  return { code: u?.code ?? "", referrals: list };
}
