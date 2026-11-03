import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { setAvailableNow } from "@/server/users";

export const POST = route(async (req) => {
  const u = await requireActiveUser();
  const { hours } = await parseBody(req, z.object({ hours: z.number().min(0.5).max(12).nullable() }));
  await setAvailableNow(u.id, hours);
  return { ok: true, availableUntil: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null };
});
