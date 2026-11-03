import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { myApplications } from "@/server/applications";
import { myAssignments, workedWith } from "@/server/assignments";
import { myRequests } from "@/server/services";

/** Toutes les missions de l'utilisateur, dans ses deux rôles. */
export const GET = route(async () => {
  const user = await requireUser();
  const [assignments, requests, applications, people] = await Promise.all([myAssignments(user.id), myRequests(user.id), myApplications(user.id), workedWith(user.id)]);
  return { assignments, requests, applications, people };
});
