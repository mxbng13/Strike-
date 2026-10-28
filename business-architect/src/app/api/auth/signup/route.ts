import { NextResponse } from "next/server";
import { api, parseBody } from "@/lib/http";
import { SignupInput, signup, createSession } from "@/auth/service";
import { rateLimit } from "@/lib/rate-limit";
import { withSessionCookie } from "@/lib/session-cookie";

export const POST = api(async (req) => {
  await rateLimit(`signup:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 3600);
  const input = await parseBody(req, SignupInput);
  const { user } = await signup(input);
  const s = await createSession(user.id, req.headers.get("user-agent") ?? undefined);
  return withSessionCookie(NextResponse.json({ user }, { status: 201 }), s.token, s.expiresAt);
});
