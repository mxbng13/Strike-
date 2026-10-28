import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { requireProjectAccess } from "@/projects/service";
import { db, schema } from "@/db/client";
import { audit } from "@/audit/service";

/** Sets the AI-operations budget of a project (FinOps). A new row keeps the history. */
export const PUT = api<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { project } = await requireProjectAccess(user.id, id, "admin");
  const { limitEur } = await parseBody(req, z.object({ limitEur: z.number().min(0).max(10_000) }));
  await db().insert(schema.budgets).values({ workspaceId: project.workspaceId, projectId: id, kind: "ai_operations", period: "total", limitEur });
  await audit({ workspaceId: project.workspaceId, projectId: id, actorType: "user", actorId: user.id, action: "budget.update", data: { limitEur } });
  return json({ ok: true });
});
