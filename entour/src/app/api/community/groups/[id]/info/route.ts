import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { getGroup } from "@/server/community";

/** Détail d'un groupe par son identifiant lisible (slug). */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  return { group: await getGroup(id, user.id) };
});
