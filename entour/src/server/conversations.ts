import "server-only";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  blocks,
  conversationMembers,
  conversations,
  messageAttachments,
  messageReactions,
  messages,
  services,
  uploads,
  userProfiles,
  type MessageMeta,
} from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { analyzeMessage } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime";
import { getSettings } from "@/lib/settings";
import { fileUrl } from "@/lib/storage";
import type { z } from "zod";
import type { sendMessageSchema } from "@/lib/validators";
import { notify } from "./notifications";

/** Crée (ou retrouve) la conversation liée à un couple (mission, intervenant). */
export async function ensureMissionConversation(tx: Tx | typeof db, serviceId: string, requesterId: string, providerId: string) {
  const pairKey = `mission:${serviceId}:${providerId}`;
  const [existing] = await tx.select().from(conversations).where(eq(conversations.pairKey, pairKey));
  if (existing) {
    // Réafficher la conversation si l'un des deux l'avait masquée
    await tx.update(conversationMembers).set({ hidden: false }).where(eq(conversationMembers.conversationId, existing.id));
    return existing;
  }
  const [c] = await tx.insert(conversations).values({ kind: "mission", serviceId, pairKey }).onConflictDoNothing().returning();
  const conv = c ?? (await tx.select().from(conversations).where(eq(conversations.pairKey, pairKey)))[0];
  await tx
    .insert(conversationMembers)
    .values([
      { conversationId: conv.id, userId: requesterId },
      { conversationId: conv.id, userId: providerId },
    ])
    .onConflictDoNothing();
  return conv;
}

export async function ensureDirectConversation(a: string, b: string) {
  if (a === b) throw badRequest("Conversation impossible avec vous-même");
  await assertNotBlocked(a, b);
  const [x, y] = [a, b].sort();
  const pairKey = `direct:${x}:${y}`;
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(conversations).where(eq(conversations.pairKey, pairKey));
    if (existing) return existing;
    const [c] = await tx.insert(conversations).values({ kind: "direct", pairKey }).returning();
    await tx.insert(conversationMembers).values([
      { conversationId: c.id, userId: a },
      { conversationId: c.id, userId: b },
    ]);
    return c;
  });
}

export async function assertNotBlocked(a: string, b: string) {
  const r = await db
    .select()
    .from(blocks)
    .where(sql`(${blocks.blockerId} = ${a} and ${blocks.blockedId} = ${b}) or (${blocks.blockerId} = ${b} and ${blocks.blockedId} = ${a})`);
  if (r.length) throw forbidden("Échange impossible : l'un de vous a bloqué l'autre.");
}

async function membership(conversationId: string, userId: string) {
  const [m] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  if (!m) throw notFound("Conversation");
  return m;
}

async function otherMembers(conversationId: string, userId: string) {
  const rows = await db
    .select({ userId: conversationMembers.userId, muted: conversationMembers.muted })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), sql`${conversationMembers.userId} <> ${userId}`));
  return rows;
}

/** Insère un message système/action visible par les deux parties (historique des modifications importantes). */
export async function systemMessage(conversationId: string, body: string, meta: MessageMeta = {}, senderId: string | null = null, kind: "system" | "action" = "system") {
  const [m] = await db.insert(messages).values({ conversationId, senderId, kind, body, meta }).returning();
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
  const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId));
  await publish(members.map((x) => x.userId), { type: "message:new", conversationId, messageId: m.id, senderId });
  return m;
}

/* ───────────── Liste et lecture ───────────── */

export async function listConversations(userId: string, opts: { archived?: boolean; q?: string } = {}) {
  const q = opts.q?.trim().slice(0, 80);
  const rows = await db.execute<Record<string, unknown>>(sql`
    select c.id, c.kind, c.service_id, c.last_message_at, m.archived_at, m.muted, m.last_read_at,
      s.title as service_title, s.status as service_status,
      o.user_id as other_id, p.first_name as other_name, p.avatar_url as other_avatar,
      lm.body as last_body, lm.kind as last_kind, lm.sender_id as last_sender, lm.created_at as last_at,
      (select count(*) from messages x where x.conversation_id = c.id and x.created_at > coalesce(m.last_read_at, 'epoch')
         and (x.sender_id is null or x.sender_id <> ${userId}) and x.created_at > coalesce(m.cleared_at, 'epoch') and x.deleted_at is null)::int as unread
    from conversation_members m
    join conversations c on c.id = m.conversation_id
    join conversation_members o on o.conversation_id = c.id and o.user_id <> ${userId}
    join user_profiles p on p.user_id = o.user_id
    left join services s on s.id = c.service_id
    left join lateral (select body, kind, sender_id, created_at from messages where conversation_id = c.id and deleted_at is null
                       and created_at > coalesce(m.cleared_at, 'epoch') order by created_at desc limit 1) lm on true
    where m.user_id = ${userId} and m.hidden = false
      and ${opts.archived ? sql`m.archived_at is not null` : sql`m.archived_at is null`}
      ${q ? sql`and (p.first_name ilike ${"%" + q + "%"} or s.title ilike ${"%" + q + "%"} or exists (
          select 1 from messages sm where sm.conversation_id = c.id and sm.deleted_at is null
          and (to_tsvector('french', sm.body) @@ plainto_tsquery('french', ${q}) or sm.body ilike ${"%" + q + "%"})))` : sql``}
    order by c.last_message_at desc
    limit 200`);
  return rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    serviceId: (r.service_id as string) ?? null,
    serviceTitle: (r.service_title as string) ?? null,
    serviceStatus: (r.service_status as string) ?? null,
    other: { id: String(r.other_id), firstName: String(r.other_name), avatarUrl: (r.other_avatar as string) ?? null },
    lastMessage: r.last_at ? { body: String(r.last_body ?? ""), kind: String(r.last_kind), mine: r.last_sender === userId, at: new Date(r.last_at as string).toISOString() } : null,
    unread: Number(r.unread ?? 0),
    archived: !!r.archived_at,
    muted: !!r.muted,
  }));
}

export async function totalUnreadMessages(userId: string) {
  const r = await db.execute<{ n: number }>(sql`
    select coalesce(sum((select count(*) from messages x where x.conversation_id = m.conversation_id
      and x.created_at > coalesce(m.last_read_at, 'epoch') and (x.sender_id is null or x.sender_id <> ${userId}) and x.deleted_at is null)), 0)::int as n
    from conversation_members m where m.user_id = ${userId} and m.hidden = false and m.archived_at is null`);
  return Number(r[0]?.n ?? 0);
}

export async function getConversation(userId: string, conversationId: string) {
  const me = await membership(conversationId, userId);
  const [c] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
  const others = await db
    .select({
      userId: conversationMembers.userId,
      lastReadAt: conversationMembers.lastReadAt,
      lastDeliveredAt: conversationMembers.lastDeliveredAt,
      firstName: userProfiles.firstName,
      avatarUrl: userProfiles.avatarUrl,
      ratingAvg: userProfiles.ratingAvg,
      ratingCount: userProfiles.ratingCount,
    })
    .from(conversationMembers)
    .innerJoin(userProfiles, eq(userProfiles.userId, conversationMembers.userId))
    .where(and(eq(conversationMembers.conversationId, conversationId), sql`${conversationMembers.userId} <> ${userId}`));
  const other = others[0];
  const blocked = other
    ? (await db.select().from(blocks).where(sql`(${blocks.blockerId} = ${userId} and ${blocks.blockedId} = ${other.userId}) or (${blocks.blockerId} = ${other.userId} and ${blocks.blockedId} = ${userId})`)).length > 0
    : false;
  let mission = null;
  if (c.serviceId) {
    const { missionContext } = await import("./assignments");
    mission = await missionContext(c.serviceId, userId, other?.userId ?? null);
  }
  return {
    id: c.id,
    kind: c.kind,
    serviceId: c.serviceId,
    archived: !!me.archivedAt,
    muted: me.muted,
    other: other ?? null,
    blocked,
    iBlocked: other ? (await db.select().from(blocks).where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, other.userId)))).length > 0 : false,
    mission,
  };
}

export async function getMessages(userId: string, conversationId: string, opts: { before?: string; limit?: number } = {}) {
  const me = await membership(conversationId, userId);
  const conds = [eq(messages.conversationId, conversationId)];
  if (me.clearedAt) conds.push(sql`${messages.createdAt} > ${me.clearedAt}`);
  if (opts.before) conds.push(lt(messages.createdAt, new Date(opts.before)));
  const rows = await db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(desc(messages.createdAt))
    .limit(Math.min(opts.limit ?? 50, 100));
  const ids = rows.map((r) => r.id);
  const atts = ids.length ? await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, ids)) : [];
  const reacts = ids.length ? await db.select().from(messageReactions).where(inArray(messageReactions.messageId, ids)) : [];
  const replyIds = rows.map((r) => r.replyToId).filter((x): x is string => !!x);
  const replies = replyIds.length ? await db.select({ id: messages.id, body: messages.body, kind: messages.kind, senderId: messages.senderId }).from(messages).where(inArray(messages.id, replyIds)) : [];
  const replyMap = new Map(replies.map((r) => [r.id, r]));

  // Accusé de distribution : les messages récupérés sont distribués
  await db.update(conversationMembers).set({ lastDeliveredAt: new Date() }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));

  return rows.reverse().map((m) => ({
    id: m.id,
    senderId: m.senderId,
    kind: m.kind,
    body: m.deletedAt ? "" : m.body,
    deleted: !!m.deletedAt,
    meta: m.deletedAt ? {} : expireLocation(m.meta),
    createdAt: m.createdAt.toISOString(),
    replyTo: m.replyToId ? (replyMap.get(m.replyToId) ?? null) : null,
    attachments: m.deletedAt
      ? []
      : atts.filter((a) => a.messageId === m.id).map((a) => ({ id: a.id, url: fileUrl(a.storageKey), mimeType: a.mimeType, fileName: a.fileName, sizeBytes: a.sizeBytes, durationMs: a.durationMs })),
    reactions: Object.entries(
      reacts
        .filter((r) => r.messageId === m.id)
        .reduce<Record<string, string[]>>((acc, r) => {
          (acc[r.emoji] ??= []).push(r.userId);
          return acc;
        }, {}),
    ).map(([emoji, users]) => ({ emoji, users })),
  }));
}

/** Le partage de position est temporaire : une fois expiré, les coordonnées ne sont plus transmises. */
function expireLocation(meta: MessageMeta): MessageMeta {
  if (meta.location && new Date(meta.location.expiresAt) < new Date()) return { ...meta, location: { lat: 0, lng: 0, expiresAt: meta.location.expiresAt } };
  return meta;
}

/* ───────────── Envoi ───────────── */

export async function sendMessage(user: CurrentUser, conversationId: string, input: z.infer<typeof sendMessageSchema>) {
  await membership(conversationId, user.id);
  const settings = await getSettings();
  await rateLimit(`msg:${user.id}`, settings.limits.maxMessagesPerMinute, 60);
  if (user.status === "suspended") throw forbidden("Compte suspendu");
  const others = await otherMembers(conversationId, user.id);
  for (const o of others) await assertNotBlocked(user.id, o.userId);

  const body = input.body.trim();
  if (input.kind === "text" && !body) throw badRequest("Message vide");
  let meta: MessageMeta = {};
  if (input.kind === "location") {
    if (!input.location) throw badRequest("Position manquante");
    meta = { location: { lat: input.location.lat, lng: input.location.lng, label: input.location.label, expiresAt: new Date(Date.now() + input.location.minutes * 60_000).toISOString() } };
  }
  if (input.replyToId) {
    const [r] = await db.select({ c: messages.conversationId }).from(messages).where(eq(messages.id, input.replyToId));
    if (!r || r.c !== conversationId) throw badRequest("Message cité introuvable");
  }
  // Pièces jointes : uniquement des fichiers téléversés par l'expéditeur pour CETTE conversation
  const files = input.attachmentKeys.length
    ? await db
        .select()
        .from(uploads)
        .where(and(eq(uploads.ownerId, user.id), inArray(uploads.storageKey, input.attachmentKeys), eq(uploads.conversationId, conversationId)))
    : [];
  if (input.attachmentKeys.length && files.length !== input.attachmentKeys.length) throw badRequest("Pièce jointe invalide");
  if (["image", "video", "file", "audio"].includes(input.kind) && !files.length) throw badRequest("Pièce jointe manquante");

  const check = body ? analyzeMessage(body) : { warning: null, scam: false };
  const [m] = await db.transaction(async (tx) => {
    const inserted = await tx.insert(messages).values({ conversationId, senderId: user.id, kind: input.kind, body: body.slice(0, 4000), replyToId: input.replyToId ?? null, meta }).returning();
    if (files.length)
      await tx.insert(messageAttachments).values(
        files.map((f) => ({ messageId: inserted[0].id, storageKey: f.storageKey, mimeType: f.mimeType, sizeBytes: f.sizeBytes, fileName: f.fileName, durationMs: input.kind === "audio" ? (input.durationMs ?? null) : null })),
      );
    await tx.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversationId));
    await tx.update(conversationMembers).set({ lastReadAt: new Date(), hidden: false }).where(eq(conversationMembers.conversationId, conversationId));
    if (check.scam) await tx.update(conversations).set({ reported: true }).where(eq(conversations.id, conversationId));
    return inserted;
  });

  await publish([user.id, ...others.map((o) => o.userId)], { type: "message:new", conversationId, messageId: m.id, senderId: user.id });
  const preview = input.kind === "text" ? body.slice(0, 120) : { image: "📷 Photo", video: "🎬 Vidéo", file: "📎 Document", audio: "🎤 Message vocal", location: "📍 Position partagée" }[input.kind];
  for (const o of others) {
    if (o.muted) continue;
    // Une notification groupée par conversation et par tranche de 10 minutes pour éviter le spam
    await notify({
      userId: o.userId,
      type: "message",
      title: `Nouveau message de ${user.firstName}`,
      body: preview,
      link: `/messages/${conversationId}`,
      dedupeKey: `msg:${conversationId}:${Math.floor(Date.now() / 600_000)}`,
    });
  }
  return { id: m.id, warning: check.warning };
}

export async function markConversationRead(userId: string, conversationId: string) {
  await membership(conversationId, userId);
  const at = new Date();
  await db.update(conversationMembers).set({ lastReadAt: at, lastDeliveredAt: at }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  const others = await otherMembers(conversationId, userId);
  await publish(others.map((o) => o.userId), { type: "conversation:read", conversationId, userId, at: at.toISOString() });
}

export async function typing(user: CurrentUser, conversationId: string) {
  await membership(conversationId, user.id);
  const others = await otherMembers(conversationId, user.id);
  await publish(others.map((o) => o.userId), { type: "typing", conversationId, userId: user.id, name: user.firstName });
}

export async function toggleReaction(userId: string, messageId: string, emoji: string) {
  if (!["👍", "❤️", "😂", "😮", "🙏", "👏"].includes(emoji)) throw badRequest("Réaction non disponible");
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!m) throw notFound("Message");
  await membership(m.conversationId, userId);
  const existing = await db.select().from(messageReactions).where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji)));
  if (existing.length) await db.delete(messageReactions).where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji)));
  else await db.insert(messageReactions).values({ messageId, userId, emoji });
  const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, m.conversationId));
  await publish(members.map((x) => x.userId), { type: "message:updated", conversationId: m.conversationId, messageId });
}

export async function deleteOwnMessage(userId: string, messageId: string) {
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
  if (!m || m.senderId !== userId) throw notFound("Message");
  if (Date.now() - m.createdAt.getTime() > 15 * 60_000) throw badRequest("Un message ne peut être retiré que dans les 15 minutes suivant son envoi");
  await db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, messageId));
  const members = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, m.conversationId));
  await publish(members.map((x) => x.userId), { type: "message:updated", conversationId: m.conversationId, messageId });
}

export async function setConversationFlags(userId: string, conversationId: string, flags: { archived?: boolean; muted?: boolean; hide?: boolean }) {
  await membership(conversationId, userId);
  const patch: Partial<typeof conversationMembers.$inferInsert> = {};
  if (flags.archived !== undefined) patch.archivedAt = flags.archived ? new Date() : null;
  if (flags.muted !== undefined) patch.muted = flags.muted;
  if (flags.hide) {
    // « Supprimer de mon affichage » : masque la conversation et son historique pour moi uniquement
    patch.hidden = true;
    patch.clearedAt = new Date();
  }
  await db.update(conversationMembers).set(patch).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
}

export async function conversationForService(serviceId: string, userId: string) {
  const [s] = await db.select({ requesterId: services.requesterId }).from(services).where(eq(services.id, serviceId));
  if (!s) throw notFound("Demande");
  return s;
}

export async function unreadByConversation(userId: string) {
  return db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, userId), isNull(conversationMembers.archivedAt)));
}
