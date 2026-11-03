import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import { createPost, feed } from "@/server/community";
import { getLocation } from "@/server/users";

export const GET = route(async (req) => {
  const user = await requireUser();
  const loc = await getLocation(user.id);
  if (!loc) throw badRequest("Définissez votre localisation pour voir le fil de votre quartier");
  const groupId = req.nextUrl.searchParams.get("groupId") ?? undefined;
  return { posts: await feed(user.id, loc.lat, loc.lng, groupId) };
});

export const POST = route(async (req) => {
  const user = await requireActiveUser();
  const input = await parseBody(
    req,
    z.object({ body: z.string().max(1500), kind: z.enum(["post", "thanks", "offer"]).default("post"), groupId: z.string().uuid().nullable().optional(), thankedUserId: z.string().uuid().nullable().optional() }),
  );
  return { post: await createPost(user, input) };
});
