import { z } from "zod";
import { getCurrentUser, requireActiveUser } from "@/lib/auth";
import { parseBody, parseQuery, route } from "@/lib/http";
import { createServiceSchema, radiusSchema } from "@/lib/validators";
import { createService, listServices } from "@/server/services";
import { getLocation } from "@/server/users";

const listQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: radiusSchema.optional(),
  categories: z.string().max(400).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  when: z.enum(["now", "today", "tomorrow", "week", "later"]).optional(),
  urgent: z.enum(["1", "0"]).optional(),
  recurring: z.enum(["1", "0"]).optional(),
  q: z.string().max(80).optional(),
  sort: z.enum(["relevance", "distance", "recent", "price_desc", "price_asc", "date"]).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
  bbox: z
    .string()
    .regex(/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/)
    .optional(),
});

export const GET = route(async (req) => {
  const q = parseQuery(req, listQuery);
  const viewer = await getCurrentUser();
  let lat = q.lat;
  let lng = q.lng;
  let radius = q.radius as number | undefined;
  if ((lat == null || lng == null) && viewer) {
    const loc = await getLocation(viewer.id);
    if (loc) {
      lat = loc.lat;
      lng = loc.lng;
      radius ??= loc.radiusKm;
    }
  }
  lat ??= 46.6;
  lng ??= 2.4; // centre de la France par défaut
  const bbox = q.bbox?.split(",").map(Number) as [number, number, number, number] | undefined;
  const services = await listServices(
    {
      lat,
      lng,
      radiusKm: radius ?? 10,
      categoryIds: q.categories?.split(",").map(Number).filter(Boolean),
      minPriceCents: q.minPrice != null ? q.minPrice * 100 : undefined,
      maxPriceCents: q.maxPrice != null ? q.maxPrice * 100 : undefined,
      when: q.when,
      urgentOnly: q.urgent === "1",
      recurringOnly: q.recurring === "1",
      q: q.q,
      sort: q.sort,
      limit: q.limit,
      offset: q.offset,
      bbox,
    },
    viewer?.id ?? null,
  );
  return { services, center: { lat, lng }, radiusKm: radius ?? 10 };
});

export const POST = route(async (req) => {
  const user = await requireActiveUser();
  const input = await parseBody(req, createServiceSchema);
  const r = await createService(user, input);
  return { id: r.service.id, held: r.held, notified: r.notified, findings: r.findings };
});
