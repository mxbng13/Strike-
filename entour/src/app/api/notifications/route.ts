import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { listNotifications, markRead, unreadCount } from "@/server/notifications";

export const GET = route(async () => {
  const user = await requireUser();
  const [items, unread] = await Promise.all([listNotifications(user.id), unreadCount(user.id)]);
  return { notifications: items, unread };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { id } = await parseBody(req, z.object({ id: z.string().uuid().optional() }));
  await markRead(user.id, id);
  return { ok: true };
});
