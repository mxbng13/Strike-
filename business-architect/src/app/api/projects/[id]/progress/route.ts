import { and, desc, eq, gt } from "drizzle-orm";
import { api, json, requireUser } from "@/lib/http";
import { requireProjectAccess } from "@/projects/service";
import { db, schema } from "@/db/client";

/** Polled by the UI: real task statuses + workflow events (no artificial progress). */
export const GET = api<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { project } = await requireProjectAccess(user.id, id);
  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  const run = await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.projectId, id), orderBy: desc(schema.orchestrationRuns.startedAt) });
  const tasks = run
    ? await db()
        .select({ id: schema.agentTasks.id, kind: schema.agentTasks.kind, label: schema.agentTasks.label, phase: schema.agentTasks.phase, agentId: schema.agentTasks.agentId, status: schema.agentTasks.status, attempts: schema.agentTasks.attempts, lastError: schema.agentTasks.lastError, startedAt: schema.agentTasks.startedAt, finishedAt: schema.agentTasks.finishedAt, createdAt: schema.agentTasks.createdAt, input: schema.agentTasks.input })
        .from(schema.agentTasks)
        .where(eq(schema.agentTasks.orchestrationRunId, run.id))
        .orderBy(schema.agentTasks.createdAt)
    : [];
  const events = await db()
    .select()
    .from(schema.workflowEvents)
    .where(and(eq(schema.workflowEvents.projectId, id), gt(schema.workflowEvents.id, after)))
    .orderBy(desc(schema.workflowEvents.id))
    .limit(50);
  return json({ project: { status: project.status, statusReason: project.statusReason, phase: project.phase }, run: run ? { id: run.id, status: run.status, iteration: run.discoveryIteration } : null, tasks, events: events.reverse() });
});
