import { createSession, clientIp } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { loginSchema } from "@/lib/validators";
import { authenticate } from "@/server/users";

export const POST = route(async (req) => {
  const { email, password } = await parseBody(req, loginSchema);
  const ip = await clientIp();
  const user = await authenticate(email, password, ip);
  await createSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
  return { ok: true };
});
