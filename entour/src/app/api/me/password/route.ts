import { z } from "zod";
import { clientIp, requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { passwordSchema } from "@/lib/validators";
import { changePassword } from "@/server/users";

export const POST = route(async (req) => {
  const u = await requireUser();
  const { current, next } = await parseBody(req, z.object({ current: z.string().min(1), next: passwordSchema }));
  await changePassword(u.id, current, next, await clientIp());
  return { ok: true };
});
