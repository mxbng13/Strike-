import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { listFavorites, toggleFavorite } from "@/server/trust";

export const GET = route(async () => {
  const user = await requireUser();
  return listFavorites(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { kind, targetId } = await parseBody(req, z.object({ kind: z.enum(["service", "user", "trusted"]), targetId: z.string().uuid() }));
  return { active: await toggleFavorite(user.id, kind, targetId) };
});
