import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { setAvailabilities } from "@/server/users";

const schema = z.object({
  slots: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine((s) => s.startMinute < s.endMinute, "Créneau invalide"))
    .max(50),
});

export const PUT = route(async (req) => {
  const u = await requireUser();
  const { slots } = await parseBody(req, schema);
  await setAvailabilities(u.id, slots);
  return { ok: true };
});
