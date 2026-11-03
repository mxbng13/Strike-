import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { setSkills } from "@/server/users";

const schema = z.object({
  skills: z
    .array(
      z.object({
        categoryId: z.number().int().positive(),
        description: z.string().trim().max(400).default(""),
        yearsExperience: z.number().int().min(0).max(60).default(0),
        hourlyRateCents: z.number().int().min(0).max(100000).nullable().optional(),
        notify: z.boolean().default(true),
      }),
    )
    .max(30),
});

export const PUT = route(async (req) => {
  const u = await requireUser();
  const { skills } = await parseBody(req, schema);
  await setSkills(u.id, skills);
  return { ok: true };
});
