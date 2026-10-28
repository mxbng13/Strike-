import { and, desc, eq, isNull, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type DbOrTx } from "@/db/client";
import { AppError, notFound } from "@/lib/errors";
import { requireWorkspaceRole, type Role, getWorkspaceSettings } from "@/workspaces/service";
import { PHASES, PHASE_INFO } from "./lifecycle";
import { audit } from "@/audit/service";
import { firstIntakeMessage } from "@/intake/engine";

export const CreateProjectInput = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().max(120).optional(),
});

export type ProjectRow = typeof schema.projects.$inferSelect;

/**
 * THE authorization gate for anything project-scoped. A browser-supplied id is
 * never trusted on its own: the caller must be a member of the owning workspace.
 */
export async function requireProjectAccess(
  userId: string,
  projectId: string,
  min: Role = "viewer",
  tx: DbOrTx = db(),
): Promise<{ project: ProjectRow; role: Role }> {
  if (!z.string().uuid().safeParse(projectId).success) throw notFound("Projet");
  const project = await tx.query.projects.findFirst({ where: and(eq(schema.projects.id, projectId), isNull(schema.projects.archivedAt)) });
  if (!project) throw notFound("Projet");
  const role = await requireWorkspaceRole(userId, project.workspaceId, min, tx).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") throw notFound("Projet");
    throw e;
  });
  return { project, role };
}

export async function createProject(userId: string, input: z.infer<typeof CreateProjectInput>): Promise<ProjectRow> {
  await requireWorkspaceRole(userId, input.workspaceId, "member");
  const settings = await getWorkspaceSettings(input.workspaceId);
  return db().transaction(async (tx) => {
    const [p] = await tx
      .insert(schema.projects)
      .values({ workspaceId: input.workspaceId, createdBy: userId, name: input.name || "Nouveau business" })
      .returning();
    await tx.insert(schema.projectMilestones).values(
      PHASES.map((phase) => ({
        projectId: p!.id,
        phase,
        status: phase === "intake" ? ("in_progress" as const) : ("pending" as const),
        startedAt: phase === "intake" ? new Date() : null,
        entryCriteria: PHASE_INFO[phase].entry,
        exitCriteria: PHASE_INFO[phase].exit,
      })),
    );
    await tx.insert(schema.budgets).values({
      workspaceId: input.workspaceId,
      projectId: p!.id,
      kind: "ai_operations",
      period: "total",
      limitEur: settings.defaultProjectAiBudgetEur,
    });
    await tx.insert(schema.intakeMessages).values(firstIntakeMessage(p!.id));
    await audit({ workspaceId: input.workspaceId, projectId: p!.id, actorType: "user", actorId: userId, action: "project.create" }, tx);
    return p!;
  });
}

export async function listProjects(userId: string, workspaceId: string) {
  await requireWorkspaceRole(userId, workspaceId);
  const rows = await db()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.workspaceId, workspaceId), isNull(schema.projects.archivedAt)))
    .orderBy(desc(schema.projects.updatedAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const taskCounts = await db()
    .select({ projectId: schema.agentTasks.projectId, status: schema.agentTasks.status, n: sql<number>`count(*)::int` })
    .from(schema.agentTasks)
    .where(inArray(schema.agentTasks.projectId, ids))
    .groupBy(schema.agentTasks.projectId, schema.agentTasks.status);
  const milestones = await db()
    .select({ projectId: schema.projectMilestones.projectId, status: schema.projectMilestones.status, n: sql<number>`count(*)::int` })
    .from(schema.projectMilestones)
    .where(inArray(schema.projectMilestones.projectId, ids))
    .groupBy(schema.projectMilestones.projectId, schema.projectMilestones.status);
  return rows.map((p) => ({
    ...p,
    tasks: Object.fromEntries(taskCounts.filter((t) => t.projectId === p.id).map((t) => [t.status, t.n])),
    phasesDone: milestones.find((m) => m.projectId === p.id && m.status === "done")?.n ?? 0,
  }));
}

export async function setProjectStatus(
  tx: DbOrTx,
  projectId: string,
  status: ProjectRow["status"],
  reason?: string | null,
): Promise<void> {
  await tx
    .update(schema.projects)
    .set({ status, statusReason: reason ?? null, updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
}

export async function setPhase(tx: DbOrTx, projectId: string, phase: (typeof PHASES)[number], status: "in_progress" | "done" | "blocked"): Promise<void> {
  const now = new Date();
  await tx
    .update(schema.projectMilestones)
    .set({
      status,
      ...(status === "in_progress" ? { startedAt: now } : {}),
      ...(status === "done" ? { completedAt: now } : {}),
    })
    .where(and(eq(schema.projectMilestones.projectId, projectId), eq(schema.projectMilestones.phase, phase)));
  if (status === "in_progress") await tx.update(schema.projects).set({ phase, updatedAt: now }).where(eq(schema.projects.id, projectId));
}

export async function recordEvent(tx: DbOrTx, projectId: string, type: string, message: string, data?: Record<string, unknown>, taskId?: string) {
  await tx.insert(schema.workflowEvents).values({ projectId, type, message, data: data ?? null, taskId: taskId ?? null });
}
