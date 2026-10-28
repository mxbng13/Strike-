/**
 * Typed application errors. Route handlers map them to HTTP responses;
 * workers map them to task statuses. Messages are user-facing (French) and
 * must never contain secrets.
 */
export type AppErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BUDGET_EXCEEDED"
  | "APPROVAL_REQUIRED"
  | "ACTION_FORBIDDEN"
  | "DEPENDENCY_MISSING"
  | "PROVIDER_ERROR"
  | "QUALITY_BLOCKED"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 402,
  APPROVAL_REQUIRED: 409,
  ACTION_FORBIDDEN: 403,
  DEPENDENCY_MISSING: 503,
  PROVIDER_ERROR: 502,
  QUALITY_BLOCKED: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, message: string, opts?: { details?: Record<string, unknown>; retryable?: boolean; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "AppError";
    this.code = code;
    this.details = opts?.details;
    this.retryable = opts?.retryable ?? (code === "PROVIDER_ERROR" || code === "RATE_LIMITED");
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export function notFound(what = "Ressource"): AppError {
  // Same error for "absent" and "not yours": never leak existence of other tenants' data.
  return new AppError("NOT_FOUND", `${what} introuvable.`);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
