import { z } from "zod";
import { parseQuery, route } from "@/lib/http";
import { priceSuggestionFor } from "@/server/services";

export const GET = route(async (req) => {
  const q = parseQuery(
    req,
    z.object({ categoryId: z.coerce.number().int().positive(), duration: z.coerce.number().int().min(5).max(20000).optional(), urgency: z.enum(["normal", "high", "urgent"]).default("normal") }),
  );
  return { suggestion: await priceSuggestionFor(q.categoryId, q.duration ?? null, q.urgency) };
});
