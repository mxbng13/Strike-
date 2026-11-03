import { requireUser } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { route } from "@/lib/http";
import { leaderboards } from "@/server/community";
import { getLocation } from "@/server/users";

export const GET = route(async () => {
  const user = await requireUser();
  const loc = await getLocation(user.id);
  if (!loc) throw badRequest("Définissez votre localisation");
  return leaderboards(loc.lat, loc.lng);
});
