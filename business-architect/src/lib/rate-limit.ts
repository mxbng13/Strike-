import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiter backed by Postgres (works across processes and
 * restarts). Atomic upsert: the window resets once expired.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const res = await db().execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  const count = Number(res.rows[0]?.count ?? 0);
  if (count > limit) throw new AppError("RATE_LIMITED", "Trop de requêtes. Réessayez dans quelques instants.");
}
