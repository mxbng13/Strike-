import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";

type Ctx<P> = { params: Promise<P> };

/**
 * Enveloppe de route API : gestion uniforme des erreurs, protection CSRF (vérification de l'origine
 * pour toute requête modifiante) et réponses JSON.
 */
export function route<P = Record<string, string>>(fn: (req: NextRequest, params: P) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await fn(req, params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      { error: { code: "validation", message: first?.message ?? "Données invalides", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  console.error("[api] erreur inattendue", err);
  return NextResponse.json({ error: { code: "internal", message: "Une erreur inattendue est survenue. Réessayez dans un instant." } }, { status: 500 });
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Les navigateurs envoient toujours Origin sur les requêtes modifiantes ; on tolère son absence
    // uniquement pour les clients non navigateurs authentifiés (cookie SameSite=Lax).
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AppError(403, "bad_origin", "Origine de la requête refusée");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(403, "bad_origin", "Origine de la requête refusée");
  }
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError(400, "invalid_json", "Corps de requête invalide");
  }
  return schema.parse(json);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (obj[k] = v));
  return schema.parse(obj);
}
