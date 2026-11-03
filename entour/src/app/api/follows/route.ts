import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { toggleFollow } from "@/server/trust";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { userId } = await parseBody(req, z.object({ userId: z.string().uuid() }));
  return { following: await toggleFollow(user.id, userId, user.firstName) };
});
