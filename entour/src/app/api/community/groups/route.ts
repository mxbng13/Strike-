import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import { createGroup, listGroups } from "@/server/community";
import { getLocation } from "@/server/users";

export const GET = route(async () => {
  const user = await requireUser();
  const loc = await getLocation(user.id);
  if (!loc) throw badRequest("Définissez votre localisation pour voir les groupes proches");
  return { groups: await listGroups(user.id, loc.lat, loc.lng) };
});

export const POST = route(async (req) => {
  const user = await requireActiveUser();
  const input = await parseBody(
    req,
    z.object({ name: z.string().trim().min(3).max(80), description: z.string().trim().max(500).default(""), kind: z.enum(["neighborhood", "topic"]), categoryGroup: z.string().max(60).nullable().optional() }),
  );
  return { group: await createGroup(user, input) };
});
