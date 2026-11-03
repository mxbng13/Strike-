import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { respondToOffer } from "@/server/assignments";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireActiveUser();
  const { accept } = await parseBody(req, z.object({ accept: z.boolean() }));
  await respondToOffer(user, id, accept);
  return { ok: true };
});
