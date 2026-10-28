import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { AppError, notFound } from "@/lib/errors";
import { requireWorkspaceRole } from "@/workspaces/service";
import { audit } from "@/audit/service";
import { executeApprovedAction } from "./executors";

export async function listApprovals(userId: string, workspaceId: string, status?: "pending") {
  await requireWorkspaceRole(userId, workspaceId);
  return db()
    .select()
    .from(schema.approvalRequests)
    .where(and(eq(schema.approvalRequests.workspaceId, workspaceId), status ? eq(schema.approvalRequests.status, status) : undefined))
    .orderBy(desc(schema.approvalRequests.createdAt));
}

export async function listProjectApprovals(projectId: string) {
  return db().select().from(schema.approvalRequests).where(eq(schema.approvalRequests.projectId, projectId)).orderBy(desc(schema.approvalRequests.createdAt));
}

/**
 * A human decision on an L2 action. Only workspace admins/owners decide.
 * Approval triggers the executor, which ONLY reports "executed" if a configured
 * connector really performed the action.
 */
export async function decideApproval(userId: string, approvalId: string, decision: "approved" | "rejected", comment?: string) {
  const req = await db().query.approvalRequests.findFirst({ where: eq(schema.approvalRequests.id, approvalId) });
  if (!req) throw notFound("Demande d'approbation");
  await requireWorkspaceRole(userId, req.workspaceId, "admin").catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") throw notFound("Demande d'approbation");
    throw e;
  });
  if (req.status !== "pending") throw new AppError("CONFLICT", "Cette demande a déjà été traitée.");
  await db().transaction(async (tx) => {
    const upd = await tx
      .update(schema.approvalRequests)
      .set({ status: decision, decidedAt: new Date() })
      .where(and(eq(schema.approvalRequests.id, approvalId), inArray(schema.approvalRequests.status, ["pending"])))
      .returning({ id: schema.approvalRequests.id });
    if (upd.length === 0) throw new AppError("CONFLICT", "Cette demande a déjà été traitée.");
    await tx.insert(schema.approvalDecisions).values({ approvalRequestId: approvalId, userId, decision, comment: comment?.slice(0, 1000) ?? null });
    await audit({ workspaceId: req.workspaceId, projectId: req.projectId, actorType: "user", actorId: userId, action: `approval.${decision}`, target: req.title, data: { actionType: req.actionType } }, tx);
  });
  if (decision === "approved") await executeApprovedAction(approvalId);
  return db().query.approvalRequests.findFirst({ where: eq(schema.approvalRequests.id, approvalId) });
}
