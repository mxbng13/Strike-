import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { locationSchema, radiusSchema } from "@/lib/validators";
import { setLocation } from "@/server/users";

export const PUT = route(async (req) => {
  const u = await requireUser();
  const body = await parseBody(req, locationSchema.extend({ radiusKm: radiusSchema.optional() }));
  await setLocation(u.id, body, body.radiusKm as number | undefined);
  return { ok: true };
});
