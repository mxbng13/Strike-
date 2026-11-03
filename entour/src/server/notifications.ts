import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { publish } from "@/lib/realtime";
import { emailLayout, sendEmail } from "@/lib/messaging-providers";

export type NotifType =
  | "new_mission"
  | "urgent_mission"
  | "application_received"
  | "application_accepted"
  | "application_rejected"
  | "application_waitlisted"
  | "message"
  | "price_change"
  | "schedule_change"
  | "mission_reminder"
  | "mission_late"
  | "mission_cancelled"
  | "mission_done"
  | "mission_completed"
  | "payment"
  | "review_received"
  | "badge"
  | "dispute"
  | "moderation"
  | "announcement"
  | "referral"
  | "follow"
  | "thanks"
  | "system";

export type NotifyInput = {
  userId: string;
  type: NotifType;
  title: string;
  body?: string;
  link?: string | null;
  data?: Record<string, unknown>;
  dedupeKey?: string;
  email?: boolean;
};

/** Crée une notification in-app, la pousse en temps réel et, si demandé, l'envoie par e-mail. */
export async function notify(input: NotifyInput) {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      link: input.link ?? null,
      data: input.data ?? {},
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return null; // déjà notifié (clé de déduplication)
  await publish([input.userId], { type: "notification:new", notificationId: row.id, title: row.title, body: row.body, link: row.link, notifType: row.type });
  if (input.email) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.userId));
    if (u) {
      const url = `${process.env.APP_URL ?? "http://localhost:3000"}${input.link ?? "/notifications"}`;
      await sendEmail(u.email, input.title, emailLayout(input.title, escapeHtml(input.body ?? ""), { label: "Ouvrir ENTOUR", url }), `${input.title}\n\n${input.body ?? ""}\n\n${url}`);
    }
  }
  return row;
}

export async function notifyMany(inputs: NotifyInput[]) {
  for (const i of inputs) await notify(i);
}

export async function listNotifications(userId: string, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markRead(userId: string, id?: string) {
  const cond = id ? and(eq(notifications.userId, userId), eq(notifications.id, id)) : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(cond);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
