import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { deleteOwnMessage, toggleReaction } from "@/server/conversations";

/** Réaction à un message (bascule). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const { emoji } = await parseBody(req, z.object({ emoji: z.string().max(8) }));
  await toggleReaction(user.id, id, emoji);
  return { ok: true };
});

/** Retrait de son propre message (15 minutes après envoi maximum). */
export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  await deleteOwnMessage(user.id, id);
  return { ok: true };
});
