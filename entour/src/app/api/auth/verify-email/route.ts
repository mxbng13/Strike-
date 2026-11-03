import { z } from "zod";
import { parseBody, route } from "@/lib/http";
import { verifyEmailToken } from "@/server/users";
import { evaluateBadges } from "@/server/reputation";

export const POST = route(async (req) => {
  const { token } = await parseBody(req, z.object({ token: z.string().min(10).max(200) }));
  const userId = await verifyEmailToken(token);
  await evaluateBadges(userId);
  return { ok: true };
});
