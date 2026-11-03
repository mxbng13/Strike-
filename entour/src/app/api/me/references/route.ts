import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { addReference } from "@/server/users";

export const POST = route(async (req) => {
  const u = await requireUser();
  const input = await parseBody(
    req,
    z.object({
      name: z.string().trim().min(2).max(80),
      relation: z.string().trim().min(2).max(120),
      contact: z.string().trim().min(5).max(120),
      categoryId: z.number().int().positive().nullable().default(null),
    }),
  );
  return { verification: await addReference(u.id, input) };
});
