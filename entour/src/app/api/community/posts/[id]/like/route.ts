import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { toggleLike } from "@/server/community";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  return { liked: await toggleLike(user.id, id) };
});
