import { getCurrentUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { relationFlags } from "@/server/trust";
import { getPublicProfile } from "@/server/users";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const viewer = await getCurrentUser();
  const profile = await getPublicProfile(id, viewer?.id);
  const relation = viewer && viewer.id !== id ? await relationFlags(viewer.id, id) : null;
  return { profile, relation };
});
