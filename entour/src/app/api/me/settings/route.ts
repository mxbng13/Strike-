import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { updateSettings } from "@/server/users";

const schema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    dndUntil: z.string().datetime({ offset: true }).nullable(),
    dndNightly: z.boolean(),
    dailyDigest: z.boolean(),
    notifyNewMissions: z.boolean(),
    notifyUrgent: z.boolean(),
    maxNotifPerHour: z.number().int().min(1).max(30),
    autoTranslate: z.boolean(),
    language: z.enum(["fr", "en", "es", "de", "it", "pt", "ar"]),
  })
  .partial();

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const patch = await parseBody(req, schema);
  return { settings: await updateSettings(u.id, patch) };
});
