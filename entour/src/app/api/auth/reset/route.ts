import { z } from "zod";
import { clientIp } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { passwordSchema } from "@/lib/validators";
import { resetPassword } from "@/server/users";

export const POST = route(async (req) => {
  const { token, password } = await parseBody(req, z.object({ token: z.string().min(10).max(200), password: passwordSchema }));
  await resetPassword(token, password, await clientIp());
  return { ok: true };
});
