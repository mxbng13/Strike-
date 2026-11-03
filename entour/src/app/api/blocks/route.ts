import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { blockUser, listBlocked, unblockUser } from "@/server/trust";

const body = z.object({ userId: z.string().uuid() });

export const GET = route(async () => {
  const user = await requireUser();
  return { blocked: await listBlocked(user.id) };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { userId } = await parseBody(req, body);
  await blockUser(user.id, userId);
  return { ok: true };
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { userId } = await parseBody(req, body);
  await unblockUser(user.id, userId);
  return { ok: true };
});
