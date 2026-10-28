import { and, eq, gte, isNull, sql, desc } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db/client";
import { AppError } from "@/lib/errors";

/**
 * FinOps: budgets for the AI OPERATIONS of this app (LLM + paid research), kept
 * strictly separate from the user's entrepreneurial budget.
 *
 * Enforcement is a pre-flight check with a cost estimate: spent + estimate must
 * stay under every applicable limit (workspace/month, project/total, task cap).
 * Worst-case overshoot is bounded by concurrent in-flight calls × their estimate.
 */
export const TASK_COST_CAP_EUR = 0.6;

export type SpendContext = { workspaceId: string; projectId?: string | null; taskId?: string | null };

function monthStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function sumUsage(tx: DbOrTx, where: ReturnType<typeof and>): Promise<number> {
  const [r] = await tx.select({ s: sql<string>`coalesce(sum(${schema.aiUsageEvents.costEur}), 0)` }).from(schema.aiUsageEvents).where(where);
  return Number(r?.s ?? 0);
}

export async function spendSummary(ctx: SpendContext, tx: DbOrTx = db()) {
  const wsMonth = await sumUsage(tx, and(eq(schema.aiUsageEvents.workspaceId, ctx.workspaceId), gte(schema.aiUsageEvents.createdAt, monthStart())));
  const project = ctx.projectId ? await sumUsage(tx, and(eq(schema.aiUsageEvents.projectId, ctx.projectId))) : 0;
  const task = ctx.taskId ? await sumUsage(tx, and(eq(schema.aiUsageEvents.taskId, ctx.taskId))) : 0;
  const wsBudget = await tx.query.budgets.findFirst({
    where: and(eq(schema.budgets.workspaceId, ctx.workspaceId), isNull(schema.budgets.projectId), eq(schema.budgets.kind, "ai_operations"), eq(schema.budgets.period, "monthly")),
    orderBy: desc(schema.budgets.createdAt),
  });
  const projBudget = ctx.projectId
    ? await tx.query.budgets.findFirst({
        where: and(eq(schema.budgets.projectId, ctx.projectId), eq(schema.budgets.kind, "ai_operations")),
        orderBy: desc(schema.budgets.createdAt),
      })
    : undefined;
  return {
    workspaceMonth: { spent: wsMonth, limit: wsBudget?.limitEur ?? null, budgetId: wsBudget?.id ?? null },
    project: { spent: project, limit: projBudget?.limitEur ?? null, budgetId: projBudget?.id ?? null },
    task: { spent: task, limit: TASK_COST_CAP_EUR },
  };
}

async function raiseAlert(tx: DbOrTx, ctx: SpendContext, budgetId: string | null, level: "warning" | "exceeded", message: string) {
  // One alert per budget, level and day.
  const since = new Date(Date.now() - 86400_000);
  const existing = await tx.query.budgetAlerts.findFirst({
    where: and(
      eq(schema.budgetAlerts.workspaceId, ctx.workspaceId),
      budgetId ? eq(schema.budgetAlerts.budgetId, budgetId) : isNull(schema.budgetAlerts.budgetId),
      eq(schema.budgetAlerts.level, level),
      gte(schema.budgetAlerts.createdAt, since),
    ),
  });
  if (!existing) await tx.insert(schema.budgetAlerts).values({ workspaceId: ctx.workspaceId, projectId: ctx.projectId ?? null, budgetId, level, message });
}

/** Throws BUDGET_EXCEEDED (and records an alert) if the estimated call would cross a limit. */
export async function assertBudget(ctx: SpendContext, estimateEur: number, tx: DbOrTx = db()): Promise<void> {
  if (estimateEur <= 0) return; // free providers never consume the AI budget
  const s = await spendSummary(ctx, tx);
  const checks: Array<{ name: string; spent: number; limit: number | null; budgetId: string | null }> = [
    { name: "budget IA mensuel de l'espace", ...s.workspaceMonth },
    { name: "budget IA du projet", ...s.project },
    ...(ctx.taskId ? [{ name: "plafond par tâche", spent: s.task.spent, limit: s.task.limit, budgetId: null }] : []),
  ];
  for (const c of checks) {
    if (c.limit === null) continue;
    if (c.spent + estimateEur > c.limit) {
      const msg = `Le ${c.name} serait dépassé (${c.spent.toFixed(4)} € consommés + ${estimateEur.toFixed(4)} € estimés > ${c.limit.toFixed(2)} €).`;
      await raiseAlert(tx, ctx, c.budgetId, "exceeded", msg);
      throw new AppError("BUDGET_EXCEEDED", msg, { details: { scope: c.name, spent: c.spent, limit: c.limit } });
    }
    if (c.spent + estimateEur > 0.8 * c.limit) {
      await raiseAlert(tx, ctx, c.budgetId, "warning", `Plus de 80 % du ${c.name} consommé.`);
    }
  }
}

export async function recordUsage(
  input: SpendContext & {
    agentRunId?: string | null;
    provider: string;
    model?: string | null;
    operation: string;
    inputTokens?: number;
    outputTokens?: number;
    costEur: number;
    estimated?: boolean;
  },
  tx: DbOrTx = db(),
): Promise<void> {
  await tx.insert(schema.aiUsageEvents).values({
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    agentRunId: input.agentRunId ?? null,
    provider: input.provider,
    model: input.model ?? null,
    operation: input.operation,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    costEur: input.costEur,
    estimated: input.estimated ?? false,
  });
}

export async function costBreakdown(workspaceId: string, projectId?: string) {
  const where = projectId ? and(eq(schema.aiUsageEvents.workspaceId, workspaceId), eq(schema.aiUsageEvents.projectId, projectId)) : eq(schema.aiUsageEvents.workspaceId, workspaceId);
  return db()
    .select({
      provider: schema.aiUsageEvents.provider,
      operation: schema.aiUsageEvents.operation,
      calls: sql<number>`count(*)::int`,
      costEur: sql<number>`coalesce(sum(${schema.aiUsageEvents.costEur}),0)::float`,
      inputTokens: sql<number>`coalesce(sum(${schema.aiUsageEvents.inputTokens}),0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiUsageEvents.outputTokens}),0)::int`,
    })
    .from(schema.aiUsageEvents)
    .where(where)
    .groupBy(schema.aiUsageEvents.provider, schema.aiUsageEvents.operation)
    .orderBy(sql`4 desc`);
}
