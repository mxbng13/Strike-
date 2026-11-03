import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { joinGroup } from "@/server/community";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const { join } = await parseBody(req, z.object({ join: z.boolean() }));
  await joinGroup(user.id, id, join);
  return { ok: true };
});
