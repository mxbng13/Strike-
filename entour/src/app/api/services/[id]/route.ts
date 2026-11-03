import { z } from "zod";
import { getCurrentUser, requireActiveUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { getServiceDetail, updateService } from "@/server/services";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const viewer = await getCurrentUser();
  const sp = req.nextUrl.searchParams;
  const lat = sp.get("lat") ? Number(sp.get("lat")) : undefined;
  const lng = sp.get("lng") ? Number(sp.get("lng")) : undefined;
  return { service: await getServiceDetail(id, viewer, { inviteCode: sp.get("invite") ?? undefined, viewerLat: lat, viewerLng: lng }) };
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const user = await requireActiveUser();
  const patch = await parseBody(
    req,
    z.object({
      title: z.string().trim().min(5).max(90).optional(),
      description: z.string().trim().min(10).max(3000).optional(),
      budgetCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
      startsAt: z.string().datetime({ offset: true }).nullable().optional(),
      urgency: z.enum(["normal", "high", "urgent"]).optional(),
    }),
  );
  await updateService(user, id, patch);
  return { ok: true };
});
