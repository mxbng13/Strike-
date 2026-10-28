import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/auth/service";
import { env } from "@/config/env";

export function withSessionCookie(res: NextResponse, token: string, expiresAt: Date): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
  return res;
}
