import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { ensureDirectConversation, listConversations } from "@/server/conversations";

export const GET = route(async (req) => {
  const user = await requireUser();
  const sp = req.nextUrl.searchParams;
  return { conversations: await listConversations(user.id, { archived: sp.get("archived") === "1", q: sp.get("q") ?? undefined }) };
});

/** Conversation directe (ex. contacter un intervenant de confiance pour lui proposer une mission). */
export const POST = route(async (req) => {
  const user = await requireActiveUser();
  const { userId } = await parseBody(req, z.object({ userId: z.string().uuid() }));
  const c = await ensureDirectConversation(user.id, userId);
  return { id: c.id };
});
