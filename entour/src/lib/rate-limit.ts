import { sql } from "drizzle-orm";
import { db } from "@/db";
import { AppError } from "./errors";

/**
 * Limitation de débit à fenêtre fixe, stockée en base : fonctionne avec plusieurs instances.
 * Lève une erreur 429 si la limite est dépassée.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  if (process.env.DISABLE_RATE_LIMIT === "1" && process.env.NODE_ENV !== "production") return { remaining: limit };
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) {
    throw new AppError(429, "rate_limited", "Trop de tentatives. Merci de patienter un instant avant de réessayer.");
  }
  if (Math.random() < 0.01) {
    await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  }
  return { remaining: limit - count };
}
