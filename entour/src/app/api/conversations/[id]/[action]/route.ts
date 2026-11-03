import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import { proposeChange } from "@/server/assignments";
import { markConversationRead, typing } from "@/server/conversations";

export const POST = route<{ id: string; action: string }>(async (req, { id, action }) => {
  if (action === "read") {
    const user = await requireUser();
    await markConversationRead(user.id, id);
    return { ok: true };
  }
  if (action === "typing") {
    const user = await requireUser();
    await typing(user, id);
    return { ok: true };
  }
  if (action === "offers") {
    const user = await requireActiveUser();
    const input = await parseBody(
      req,
      z.object({ kind: z.enum(["price", "schedule"]), amountCents: z.number().int().min(0).max(1_000_000).optional(), startsAt: z.string().datetime({ offset: true }).optional(), note: z.string().max(300).optional() }),
    );
    return { offer: await proposeChange(user, id, input) };
  }
  throw notFound("Action");
});
