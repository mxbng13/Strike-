import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { decideApproval } from "@/governance/approvals";

export const POST = api<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { decision, comment } = await parseBody(req, z.object({ decision: z.enum(["approved", "rejected"]), comment: z.string().max(1000).optional() }));
  return json({ approval: await decideApproval(user.id, id, decision, comment) });
});
