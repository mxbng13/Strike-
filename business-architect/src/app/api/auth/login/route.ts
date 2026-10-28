import { NextResponse } from "next/server";
import { api, parseBody } from "@/lib/http";
import { LoginInput, login, createSession } from "@/auth/service";
import { rateLimit } from "@/lib/rate-limit";
import { withSessionCookie } from "@/lib/session-cookie";

export const POST = api(async (req) => {
  const input = await parseBody(req, LoginInput);
  await rateLimit(`login:${input.email}`, 10, 900);
  const user = await login(input);
  const s = await createSession(user.id, req.headers.get("user-agent") ?? undefined);
  return withSessionCookie(NextResponse.json({ user }), s.token, s.expiresAt);
});
