import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { replyToReview } from "@/server/reviews";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireActiveUser();
  const { reply } = await parseBody(req, z.object({ reply: z.string().trim().min(2).max(800) }));
  await replyToReview(user, id, reply);
  return { ok: true };
});
