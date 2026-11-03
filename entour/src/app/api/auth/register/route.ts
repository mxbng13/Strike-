import { createSession, clientIp } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { registerSchema } from "@/lib/validators";
import { registerUser } from "@/server/users";

export const POST = route(async (req) => {
  const input = await parseBody(req, registerSchema);
  const ip = await clientIp();
  const user = await registerUser(input, ip);
  await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
  return { ok: true, userId: user.id };
});
