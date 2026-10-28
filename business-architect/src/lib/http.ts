import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { z } from "zod";
import { AppError, isAppError } from "./errors";
import { logger, withCorrelation } from "./logger";
import { SESSION_COOKIE, userFromToken, type SessionUser } from "@/auth/service";

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: correlation id, CSRF origin check, typed error mapping. */
export function api<P = Record<string, string>>(handler: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> =>
    withCorrelation(async () => {
      try {
        if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
        return await handler(req, ctx);
      } catch (e) {
        if (isAppError(e)) {
          return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
        }
        logger.error("unhandled route error", { path: req.nextUrl.pathname, error: e });
        return NextResponse.json({ error: { code: "INTERNAL", message: "Erreur interne. L'incident a été journalisé." } }, { status: 500 });
      }
    });
}

export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin) return; // Non-browser clients (no ambient cookies are sent cross-site with SameSite=Lax).
  try {
    if (new URL(origin).host === host) return;
  } catch {
    /* invalid origin */
  }
  throw new AppError("FORBIDDEN", "Origine de la requête refusée.");
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userFromToken(token);
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Connexion requise.");
  return u;
}

export async function parseBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("VALIDATION", "Corps JSON invalide.");
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new AppError("VALIDATION", r.error.issues[0]?.message ?? "Données invalides.", {
      details: { issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    });
  }
  return r.data;
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
