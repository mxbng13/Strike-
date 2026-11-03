import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { parseQuery, route } from "@/lib/http";
import { radiusSchema } from "@/lib/validators";
import { availableNeighbors } from "@/server/community";
import { getLocation } from "@/server/users";

export const GET = route(async (req) => {
  const q = parseQuery(
    req,
    z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), radius: radiusSchema.optional(), category: z.coerce.number().int().optional(), now: z.enum(["1", "0"]).optional() }),
  );
  const viewer = await getCurrentUser();
  let { lat, lng } = q;
  let radius = q.radius as number | undefined;
  if ((lat == null || lng == null) && viewer) {
    const loc = await getLocation(viewer.id);
    if (loc) ({ lat, lng } = loc), (radius ??= loc.radiusKm);
  }
  if (lat == null || lng == null) return { neighbors: [] };
  return { neighbors: await availableNeighbors(viewer?.id ?? null, lat, lng, radius ?? 5, { categoryId: q.category, onlyNow: q.now === "1" }) };
});
