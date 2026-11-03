import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { getConversation, getMessages, setConversationFlags } from "@/server/conversations";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const user = await requireUser();
  const [conversation, messages] = await Promise.all([getConversation(user.id, id), getMessages(user.id, id)]);
  return { conversation, messages };
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const user = await requireUser();
  const flags = await parseBody(req, z.object({ archived: z.boolean().optional(), muted: z.boolean().optional(), hide: z.boolean().optional() }));
  await setConversationFlags(user.id, id, flags);
  return { ok: true };
});
