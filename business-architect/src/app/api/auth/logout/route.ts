import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { api } from "@/lib/http";
import { SESSION_COOKIE, destroySession } from "@/auth/service";

export const POST = api(async () => {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
