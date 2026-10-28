import { z } from "zod";
import { eq } from "drizzle-orm";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { requireWorkspaceRole } from "@/workspaces/service";
import { db, schema } from "@/db/client";
import { audit } from "@/audit/service";

export const PUT = api<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireWorkspaceRole(user.id, id, "admin");
  const body = await parseBody(req, z.object({ aiMode: z.enum(["auto", "llm", "heuristic"]).optional(), monthlyAiBudgetEur: z.number().min(0).max(100_000).optional(), defaultProjectAiBudgetEur: z.number().min(0).max(10_000).optional() }));
  await db().transaction(async (tx) => {
    await tx.update(schema.workspaceSettings).set({ ...body, updatedAt: new Date() }).where(eq(schema.workspaceSettings.workspaceId, id));
    if (body.monthlyAiBudgetEur !== undefined) await tx.insert(schema.budgets).values({ workspaceId: id, kind: "ai_operations", period: "monthly", limitEur: body.monthlyAiBudgetEur });
    await audit({ workspaceId: id, actorType: "user", actorId: user.id, action: "workspace.settings", data: body }, tx);
  });
  return json({ ok: true });
});
