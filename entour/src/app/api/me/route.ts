import { getCurrentUser, requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { profileSchema } from "@/lib/validators";
import { totalUnreadMessages } from "@/server/conversations";
import { unreadCount } from "@/server/notifications";
import { getLocation, updateProfile } from "@/server/users";

export const GET = route(async () => {
  const u = await getCurrentUser();
  if (!u) return { user: null };
  const [location, notifications, messages] = await Promise.all([getLocation(u.id), unreadCount(u.id), totalUnreadMessages(u.id)]);
  return { user: u, location, unread: { notifications, messages } };
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const input = await parseBody(req, profileSchema);
  await updateProfile(u.id, input);
  return { ok: true };
});
