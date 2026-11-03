import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { setMutedCategories } from "@/server/users";

export const PUT = route(async (req) => {
  const u = await requireUser();
  const { categoryIds } = await parseBody(req, z.object({ categoryIds: z.array(z.number().int().positive()).max(100) }));
  await setMutedCategories(u.id, categoryIds);
  return { ok: true };
});

export const GET = route(async () => {
  const u = await requireUser();
  const rows = await db.select({ id: notificationPreferences.categoryId }).from(notificationPreferences).where(eq(notificationPreferences.userId, u.id));
  return { muted: rows.map((r) => r.id) };
});
