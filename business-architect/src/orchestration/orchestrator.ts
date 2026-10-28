import { and, desc, eq, inArray, lt, ne, sql, max } from "drizzle-orm";
import { db, schema, type Tx } from "@/db/client";
import { AppError, isAppError, errorMessage } from "@/lib/errors";
import { logger, withCorrelation } from "@/lib/logger";
import { audit } from "@/audit/service";
import { assembleContext } from "./context";
import { ALL_SPECS, DISCOVERY_PLAN, EXECUTION_PLAN, dependentsOf, type TaskSpec } from "./plan";
import { dispatcher } from "./queue";
import { resolveMode, llmProvider } from "@/ai/registry";
import { getWorkspaceSettings } from "@/workspaces/service";
import { runResearch } from "@/research/service";
import { assertBudget, recordUsage, TASK_COST_CAP_EUR } from "@/finops/guard";
import { llmCostEur } from "@/ai/pricing";
import { saveArtifact } from "@/artifacts/service";
import { requestAction } from "@/governance/policy";
import { recordEvent, setPhase, setProjectStatus } from "@/projects/service";
import type { AgentContext, AgentResult } from "@/agents/framework";
import type { UserProfile } from "@/intake/profile";

type TaskRow = typeof schema.agentTasks.$inferSelect;
const HEARTBEAT_MS = 10_000;
const STALE_RUNNING_MS = 2 * 60_000;

/* ------------------------------------------------------------------ planning */

async function insertTasks(tx: Tx, projectId: string, runId: string, specs: TaskSpec[], generation: number, extraInput: Record<string, unknown> = {}) {
  for (const s of specs) {
    await tx
      .insert(schema.agentTasks)
      .values({
        projectId,
        orchestrationRunId: runId,
        key: `${s.kind}#${generation}`,
        kind: s.kind,
        agentId: s.agentId,
        phase: s.phase,
        label: s.label,
        dependsOn: s.deps,
        input: { generation, ...extraInput },
        maxAttempts: s.maxAttempts ?? 3,
      })
      .onConflictDoNothing({ target: [schema.agentTasks.orchestrationRunId, schema.agentTasks.key] });
  }
}

/** Starts a new orchestration run for a profiled project (Mode 1/2/3 alike). */
export async function startRun(projectId: string, userId: string | null, reason = "Lancement de la création"): Promise<string> {
  const runId = await db().transaction(async (tx) => {
    const p = await tx.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!p) throw new AppError("NOT_FOUND", "Projet introuvable.");
    const constraints = await tx.query.projectConstraints.findFirst({ where: eq(schema.projectConstraints.projectId, projectId) });
    if (!constraints) throw new AppError("CONFLICT", "Le profil doit être complété avant de lancer la création.");
    const active = await tx.query.orchestrationRuns.findFirst({ where: and(eq(schema.orchestrationRuns.projectId, projectId), inArray(schema.orchestrationRuns.status, ["running", "paused"])) });
    if (active) throw new AppError("CONFLICT", "Une exécution est déjà en cours pour ce projet.");
    const [{ m }] = (await tx.select({ m: max(schema.orchestrationRuns.discoveryIteration) }).from(schema.orchestrationRuns).where(eq(schema.orchestrationRuns.projectId, projectId))) as [{ m: number | null }];
    const iteration = (m ?? 0) + 1;
    const [run] = await tx.insert(schema.orchestrationRuns).values({ projectId, discoveryIteration: iteration, triggeredBy: userId, reason }).returning({ id: schema.orchestrationRuns.id });
    await insertTasks(tx, projectId, run!.id, DISCOVERY_PLAN, iteration, { runIterationIndex: 1 });
    await setProjectStatus(tx, projectId, "running", null);
    await recordEvent(tx, projectId, "run.started", `${reason} (itération de découverte ${iteration}).`, { runId: run!.id });
    await audit({ workspaceId: p.workspaceId, projectId, actorType: userId ? "user" : "system", actorId: userId, action: "run.start" }, tx);
    return run!.id;
  });
  await dispatchReady(runId);
  return runId;
}

/** Latest non-cancelled task of each kind in the run. */
async function latestByKind(runId: string, tx: Tx | ReturnType<typeof db> = db()): Promise<Map<string, TaskRow>> {
  const rows = await tx.select().from(schema.agentTasks).where(and(eq(schema.agentTasks.orchestrationRunId, runId), ne(schema.agentTasks.status, "cancelled"))).orderBy(desc(schema.agentTasks.createdAt));
  const map = new Map<string, TaskRow>();
  for (const r of rows) {
    const cur = map.get(r.kind);
    const gen = (r.input as { generation?: number }).generation ?? 0;
    if (!cur || gen > ((cur.input as { generation?: number }).generation ?? 0)) map.set(r.kind, r);
  }
  return map;
}

/** Promotes pending tasks whose dependencies succeeded, then enqueues ready ones exactly once. */
export async function dispatchReady(runId: string): Promise<string[]> {
  const run = await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, runId) });
  if (!run || run.status !== "running") return [];
  const latest = await latestByKind(runId);
  const pending = [...latest.values()].filter((t) => t.status === "pending");
  for (const t of pending) {
    const ok = t.dependsOn.every((k) => latest.get(k)?.status === "succeeded");
    if (ok) await db().update(schema.agentTasks).set({ status: "ready", updatedAt: new Date() }).where(and(eq(schema.agentTasks.id, t.id), eq(schema.agentTasks.status, "pending")));
  }
  const queued = await db()
    .update(schema.agentTasks)
    .set({ status: "queued", updatedAt: new Date() })
    .where(and(eq(schema.agentTasks.orchestrationRunId, runId), eq(schema.agentTasks.status, "ready")))
    .returning({ id: schema.agentTasks.id });
  const ids = queued.map((q) => q.id);
  if (ids.length) await dispatcher().enqueue(ids);
  return ids;
}

/* ----------------------------------------------------------------- execution */

/** Executes one task. Safe to call multiple times (claim is atomic; duplicates are no-ops). */
export async function executeTask(taskId: string): Promise<void> {
  return withCorrelation(async () => {
    const [task] = await db()
      .update(schema.agentTasks)
      .set({ status: "running", attempts: sql`${schema.agentTasks.attempts} + 1`, startedAt: new Date(), heartbeatAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.agentTasks.id, taskId), inArray(schema.agentTasks.status, ["queued", "ready"])))
      .returning();
    if (!task) return;
    const run = await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, task.orchestrationRunId) });
    const project = await db().query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) });
    if (!run || !project || run.status !== "running" || project.status === "paused") {
      // Paused or cancelled meanwhile: give the attempt back, keep the task ready for resume.
      await db().update(schema.agentTasks).set({ status: run?.status === "cancelled" ? "cancelled" : "ready", attempts: sql`${schema.agentTasks.attempts} - 1`, updatedAt: new Date() }).where(eq(schema.agentTasks.id, task.id));
      return;
    }
    const spec = ALL_SPECS[task.kind];
    if (!spec) throw new Error(`Type de tâche inconnu : ${task.kind}`);

    let mode: "llm" | "heuristic";
    try {
      mode = resolveMode((await getWorkspaceSettings(project.workspaceId)).aiMode);
    } catch (e) {
      await failTask(task, e, project.workspaceId);
      return;
    }
    const isGenerative = !["evaluation.select", "qa.audit"].includes(task.kind);
    const [agentRun] = await db()
      .insert(schema.agentRuns)
      .values({ taskId: task.id, projectId: task.projectId, agentId: task.agentId, attempt: task.attempts, mode: isGenerative ? mode : "deterministic", model: mode === "llm" && isGenerative ? llmProvider().model : null })
      .returning({ id: schema.agentRuns.id });
    const agentRunId = agentRun!.id;

    await db().transaction(async (tx) => {
      const ms = await tx.query.projectMilestones.findFirst({ where: and(eq(schema.projectMilestones.projectId, task.projectId), eq(schema.projectMilestones.phase, spec.phase)) });
      if (ms && ms.status !== "in_progress") await setPhase(tx, task.projectId, spec.phase, "in_progress");
      await recordEvent(tx, task.projectId, "task.started", `${spec.label} — démarré (${AGENT_LABEL(task.agentId)})`, { attempt: task.attempts, mode }, task.id);
    });

    const heartbeat = setInterval(() => {
      void db().update(schema.agentTasks).set({ heartbeatAt: new Date() }).where(eq(schema.agentTasks.id, task.id)).catch(() => undefined);
    }, HEARTBEAT_MS);
    let usage = { input: 0, output: 0, cost: 0 };
    try {
      const context = await assembleContext({ projectId: task.projectId, runId: run.id, taskKind: task.kind, workspaceId: project.workspaceId });
      await db().update(schema.agentRuns).set({ contextDigest: context.digest() }).where(eq(schema.agentRuns.id, agentRunId));
      const fin = { workspaceId: project.workspaceId, projectId: task.projectId, taskId: task.id };
      const ctx: AgentContext = {
        projectId: task.projectId,
        workspaceId: project.workspaceId,
        taskId: task.id,
        taskKey: task.key,
        agentRunId,
        runId: run.id,
        iteration: run.discoveryIteration,
        input: task.input as Record<string, unknown>,
        profile: context.profile as UserProfile,
        mode,
        context,
        research: (providerId, q) => runResearch(fin, providerId, q),
        llm: async ({ instructions, schema: s, schemaName, extra, maxTokens }) => {
          const provider = llmProvider();
          const system = context.systemPrompt(spec.agentId);
          const prompt = `${context.render()}\n\n## Tâche\n${instructions}${extra ? `\n\n${extra}` : ""}`;
          const estimate = Math.min(provider.estimateCostEur({ system, prompt, maxTokens }), TASK_COST_CAP_EUR);
          await assertBudget(fin, estimate);
          let res;
          try {
            res = await provider.generate({ system, prompt, schema: s, schemaName, maxTokens });
          } catch (e) {
            const u = isAppError(e) ? (e.details?.usage as { inputTokens: number; outputTokens: number } | undefined) : undefined;
            if (u) {
              const cost = llmCostEur(provider.model, u.inputTokens, u.outputTokens);
              await recordUsage({ ...fin, agentRunId, provider: provider.id, model: provider.model, operation: `${task.kind}.${schemaName}.failed`, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costEur: cost.eur, estimated: !cost.known });
            }
            throw e;
          }
          const cost = llmCostEur(res.model, res.usage.inputTokens, res.usage.outputTokens);
          usage = { input: usage.input + res.usage.inputTokens, output: usage.output + res.usage.outputTokens, cost: usage.cost + cost.eur };
          await recordUsage({ ...fin, agentRunId, provider: provider.id, model: res.model, operation: `${task.kind}.${schemaName}`, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, costEur: cost.eur, estimated: !cost.known });
          await db().insert(schema.agentMessages).values([
            { agentRunId, role: "user", content: `[${schemaName}] ${instructions}`.slice(0, 4000) },
            { agentRunId, role: "assistant", content: JSON.stringify(res.data).slice(0, 20_000) },
          ]);
          return res.data;
        },
        note: async (message, data) => {
          await recordEvent(db(), task.projectId, "agent.note", message, data, task.id);
        },
      };
      const result = await spec.handler(ctx);
      clearInterval(heartbeat);
      await completeTask(task, run.id, project.workspaceId, agentRunId, result, usage);
    } catch (e) {
      clearInterval(heartbeat);
      await db().update(schema.agentRuns).set({ status: "failed", error: errorMessage(e).slice(0, 1000), finishedAt: new Date(), inputTokens: usage.input, outputTokens: usage.output, costEur: usage.cost }).where(eq(schema.agentRuns.id, agentRunId));
      await failTask(task, e, project.workspaceId);
    }
  });
}

const AGENT_LABEL = (id: string) => id.replace(/_/g, " ");

async function completeTask(task: TaskRow, runId: string, workspaceId: string, agentRunId: string, result: AgentResult, usage: { input: number; output: number; cost: number }) {
  const spec = ALL_SPECS[task.kind]!;
  await db().transaction(async (tx) => {
    // Guard against a concurrent duplicate completion.
    const cur = await tx.query.agentTasks.findFirst({ where: eq(schema.agentTasks.id, task.id) });
    if (!cur || cur.status !== "running") return;
    if (result.persist) await result.persist(tx);
    for (const a of result.artifacts ?? []) await saveArtifact(tx, { projectId: task.projectId, taskId: task.id, agentRunId, generationMode: result.mode }, a);
    for (const a of result.actions ?? []) {
      const decision = await requestAction({ workspaceId, projectId: task.projectId, ...a, requestedByTaskId: task.id, actor: { type: "agent", id: task.agentId } }, tx);
      if (decision.outcome === "pending_approval") await recordEvent(tx, task.projectId, "approval.requested", `Approbation requise : ${a.title}`, { approvalId: decision.approvalId }, task.id);
    }
    await tx.insert(schema.agentOutputs).values({ taskId: task.id, agentRunId, projectId: task.projectId, kind: task.kind, content: result.output as object }).onConflictDoNothing();
    if (result.evaluation) await tx.insert(schema.agentEvaluations).values({ agentRunId, taskId: task.id, evaluator: "contract", passed: result.evaluation.passed, score: result.evaluation.score ?? null, findings: result.evaluation.findings });
    await tx.update(schema.agentRuns).set({ status: "succeeded", finishedAt: new Date(), inputTokens: usage.input, outputTokens: usage.output, costEur: usage.cost }).where(eq(schema.agentRuns.id, agentRunId));
    await tx.update(schema.agentTasks).set({ status: "succeeded", finishedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(schema.agentTasks.id, task.id));
    await recordEvent(tx, task.projectId, "task.succeeded", `${spec.label} — terminé${result.mode === "heuristic" ? " (mode heuristique)" : ""}`, { findings: result.evaluation?.findings?.slice(0, 5) }, task.id);
    await applyControl(tx, task, runId, result);
    await updatePhaseCompletion(tx, task.projectId, runId, spec.phase);
    await maybeFinishRun(tx, task.projectId, runId);
  });
  await dispatchReady(runId);
}

async function applyControl(tx: Tx, task: TaskRow, runId: string, result: AgentResult) {
  const run = (await tx.query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, runId) }))!;
  const input = task.input as { runIterationIndex?: number; generation?: number; redone?: boolean };
  if (result.control?.replan) {
    const next = run.discoveryIteration + 1;
    await tx.update(schema.orchestrationRuns).set({ discoveryIteration: next }).where(eq(schema.orchestrationRuns.id, runId));
    // Earlier-iteration tasks stay "succeeded" (true history); dependency resolution uses the highest generation.
    await insertTasks(tx, task.projectId, runId, DISCOVERY_PLAN, next, { runIterationIndex: (input.runIterationIndex ?? 1) + 1 });
    await setPhase(tx, task.projectId, "discovery", "in_progress");
    await recordEvent(tx, task.projectId, "run.replan", `Exploration relancée (itération ${next}) : ${result.control.replan.reason}`);
    return;
  }
  if (result.control?.block) {
    await tx.update(schema.orchestrationRuns).set({ status: "paused" }).where(eq(schema.orchestrationRuns.id, runId));
    await setProjectStatus(tx, task.projectId, "blocked", result.control.block.reason);
    await setPhase(tx, task.projectId, spec(task).phase, "blocked");
    await recordEvent(tx, task.projectId, "run.blocked", result.control.block.reason, undefined, task.id);
    return;
  }
  if (result.control?.redo?.length) {
    if (input.redone) {
      const reason = `Le contrôle qualité bloque toujours après une correction automatique : ${result.evaluation?.findings.join(" ") ?? ""}`;
      await tx.update(schema.orchestrationRuns).set({ status: "paused" }).where(eq(schema.orchestrationRuns.id, runId));
      await setProjectStatus(tx, task.projectId, "blocked", reason.slice(0, 1000));
      await setPhase(tx, task.projectId, "qa", "blocked");
      await recordEvent(tx, task.projectId, "run.blocked", reason, undefined, task.id);
      return;
    }
    const kinds = new Set<string>();
    for (const k of result.control.redo) {
      kinds.add(k);
      for (const dep of dependentsOf(k)) kinds.add(dep);
    }
    kinds.add("qa.audit");
    kinds.add("launch.plan");
    const latest = await latestByKind(runId, tx);
    const specs = EXECUTION_PLAN.filter((s) => kinds.has(s.kind));
    for (const s of specs) {
      const old = latest.get(s.kind);
      if (old && old.id !== task.id) await tx.update(schema.agentTasks).set({ status: "cancelled", blockedReason: "Remplacée : correction demandée par le contrôle qualité" }).where(eq(schema.agentTasks.id, old.id));
    }
    const gen = Math.max(...specs.map((s) => ((latest.get(s.kind)?.input as { generation?: number } | undefined)?.generation ?? 1))) + 1;
    await insertTasks(tx, task.projectId, runId, specs, gen, { redone: true });
    await recordEvent(tx, task.projectId, "qa.redo", `Le contrôle qualité demande la correction de : ${result.control.redo.join(", ")}`, { kinds: [...kinds] }, task.id);
    return;
  }
  if (task.kind === "evaluation.select") {
    const out = result.output as { outcome: string };
    if (out.outcome === "selected") {
      await insertTasks(tx, task.projectId, runId, EXECUTION_PLAN, 1);
      await recordEvent(tx, task.projectId, "handoff", "Dossier d'opportunité transmis au moteur d'exécution.", undefined, task.id);
    }
  }
}

const spec = (t: TaskRow) => ALL_SPECS[t.kind]!;

async function updatePhaseCompletion(tx: Tx, projectId: string, runId: string, phase: string) {
  const latest = await latestByKind(runId, tx);
  const tasks = [...latest.values()].filter((t) => t.phase === phase);
  if (tasks.length && tasks.every((t) => t.status === "succeeded")) {
    // Discovery only completes once a selection exists; evaluation completes with the selection.
    if (phase === "discovery" && !latest.get("evaluation.select")) return;
    await setPhase(tx, projectId, phase as Parameters<typeof setPhase>[2], "done");
  }
}

async function maybeFinishRun(tx: Tx, projectId: string, runId: string) {
  const run = await tx.query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, runId) });
  if (!run || run.status !== "running") return;
  const latest = await latestByKind(runId, tx);
  const launch = latest.get("launch.plan");
  if (!launch || launch.status !== "succeeded") return;
  if (![...latest.values()].every((t) => t.status === "succeeded")) return;
  await tx.update(schema.orchestrationRuns).set({ status: "completed", finishedAt: new Date() }).where(eq(schema.orchestrationRuns.id, runId));
  const pending = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.approvalRequests).where(and(eq(schema.approvalRequests.projectId, projectId), eq(schema.approvalRequests.status, "pending")));
  const waiting = (pending[0]?.n ?? 0) > 0;
  await setProjectStatus(tx, projectId, waiting ? "awaiting_approval" : "completed", waiting ? "Des actions externes attendent ton approbation." : null);
  await recordEvent(tx, projectId, "run.completed", "Création terminée : livrables prêts, lancement préparé. Les actions externes attendent les approbations.");
}

async function failTask(task: TaskRow, e: unknown, workspaceId: string) {
  const msg = errorMessage(e).slice(0, 1000);
  const code = isAppError(e) ? e.code : "INTERNAL";
  const retryable = isAppError(e) ? e.retryable : true;
  let delaySeconds = 0;
  await db().transaction(async (tx) => {
    if (code === "BUDGET_EXCEEDED") {
      await tx.update(schema.agentTasks).set({ status: "paused_budget", lastError: msg, attempts: sql`greatest(${schema.agentTasks.attempts} - 1, 0)`, updatedAt: new Date() }).where(eq(schema.agentTasks.id, task.id));
      await tx.update(schema.orchestrationRuns).set({ status: "paused" }).where(eq(schema.orchestrationRuns.id, task.orchestrationRunId));
      await setProjectStatus(tx, task.projectId, "paused", `Budget IA atteint : ${msg} Augmente le budget ou passe en mode heuristique, puis reprends le projet.`);
      await recordEvent(tx, task.projectId, "budget.exceeded", msg, undefined, task.id);
      return;
    }
    if (code === "DEPENDENCY_MISSING" || code === "ACTION_FORBIDDEN") {
      await tx.update(schema.agentTasks).set({ status: code === "ACTION_FORBIDDEN" ? "failed" : "blocked", lastError: msg, blockedReason: msg, updatedAt: new Date() }).where(eq(schema.agentTasks.id, task.id));
      await tx.update(schema.orchestrationRuns).set({ status: "paused" }).where(eq(schema.orchestrationRuns.id, task.orchestrationRunId));
      await setProjectStatus(tx, task.projectId, "blocked", msg);
      await recordEvent(tx, task.projectId, "task.blocked", `${ALL_SPECS[task.kind]?.label ?? task.kind} : ${msg}`, undefined, task.id);
      return;
    }
    if (retryable && task.attempts < task.maxAttempts) {
      delaySeconds = Math.min(60, 5 * 2 ** (task.attempts - 1));
      await tx.update(schema.agentTasks).set({ status: "queued", lastError: msg, updatedAt: new Date() }).where(eq(schema.agentTasks.id, task.id));
      await recordEvent(tx, task.projectId, "task.retry", `${ALL_SPECS[task.kind]?.label ?? task.kind} : échec (tentative ${task.attempts}/${task.maxAttempts}), nouvel essai dans ${delaySeconds} s. ${msg}`, undefined, task.id);
      return;
    }
    await tx.update(schema.agentTasks).set({ status: "failed", lastError: msg, finishedAt: new Date(), updatedAt: new Date() }).where(eq(schema.agentTasks.id, task.id));
    await tx.update(schema.orchestrationRuns).set({ status: "paused" }).where(eq(schema.orchestrationRuns.id, task.orchestrationRunId));
    await setProjectStatus(tx, task.projectId, "blocked", `Échec de « ${ALL_SPECS[task.kind]?.label ?? task.kind} » : ${msg}`);
    await recordEvent(tx, task.projectId, "task.failed", `${ALL_SPECS[task.kind]?.label ?? task.kind} : échec définitif. ${msg}`, undefined, task.id);
    await audit({ workspaceId, projectId: task.projectId, actorType: "system", action: "task.failed", target: task.kind, outcome: "error", data: { error: msg } }, tx);
  });
  logger.warn("task failed", { taskId: task.id, kind: task.kind, code, error: msg });
  if (delaySeconds > 0) await dispatcher().enqueue([task.id], { delaySeconds });
}

/* ------------------------------------------------------------- user controls */

export async function pauseProject(projectId: string, userId: string) {
  await db().transaction(async (tx) => {
    await tx.update(schema.orchestrationRuns).set({ status: "paused" }).where(and(eq(schema.orchestrationRuns.projectId, projectId), eq(schema.orchestrationRuns.status, "running")));
    await setProjectStatus(tx, projectId, "paused", "Mis en pause par l'utilisateur.");
    await recordEvent(tx, projectId, "run.paused", "Projet mis en pause. Les tâches en cours terminent leur étape, aucune nouvelle tâche ne démarre.");
    await audit({ projectId, actorType: "user", actorId: userId, action: "project.pause" }, tx);
  });
}

/** Resumes a paused/blocked run: budget-paused, blocked and failed tasks become ready again. */
export async function resumeProject(projectId: string, userId: string): Promise<string | null> {
  const run = await db().query.orchestrationRuns.findFirst({ where: and(eq(schema.orchestrationRuns.projectId, projectId), inArray(schema.orchestrationRuns.status, ["paused", "running"])), orderBy: desc(schema.orchestrationRuns.startedAt) });
  if (!run) throw new AppError("CONFLICT", "Aucune exécution à reprendre. Lance une nouvelle création.");
  await db().transaction(async (tx) => {
    await tx.update(schema.orchestrationRuns).set({ status: "running" }).where(eq(schema.orchestrationRuns.id, run.id));
    await tx.update(schema.agentTasks).set({ status: "ready", attempts: 0, lastError: null, blockedReason: null, updatedAt: new Date() }).where(and(eq(schema.agentTasks.orchestrationRunId, run.id), inArray(schema.agentTasks.status, ["paused_budget", "blocked", "failed"])));
    await tx.update(schema.agentTasks).set({ status: "ready", updatedAt: new Date() }).where(and(eq(schema.agentTasks.orchestrationRunId, run.id), eq(schema.agentTasks.status, "queued")));
    await setProjectStatus(tx, projectId, "running", null);
    await recordEvent(tx, projectId, "run.resumed", "Projet repris.");
    await audit({ projectId, actorType: "user", actorId: userId, action: "project.resume" }, tx);
  });
  await dispatchReady(run.id);
  return run.id;
}

/** "Demander une nouvelle piste" / contest the selection: rejects the current choice and explores again. */
export async function requestNewDirection(projectId: string, userId: string, reason: string): Promise<string> {
  await db().transaction(async (tx) => {
    const p = await tx.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const runs = await tx.select({ id: schema.orchestrationRuns.id }).from(schema.orchestrationRuns).where(and(eq(schema.orchestrationRuns.projectId, projectId), inArray(schema.orchestrationRuns.status, ["running", "paused"])));
    for (const r of runs) {
      await tx.update(schema.orchestrationRuns).set({ status: "cancelled", finishedAt: new Date(), reason: "Nouvelle piste demandée" }).where(eq(schema.orchestrationRuns.id, r.id));
      await tx.update(schema.agentTasks).set({ status: "cancelled", blockedReason: "Nouvelle piste demandée par l'utilisateur" }).where(and(eq(schema.agentTasks.orchestrationRunId, r.id), inArray(schema.agentTasks.status, ["pending", "ready", "queued", "paused_budget", "blocked", "failed"])));
    }
    if (p?.selectedOpportunityId) {
      const sel = await tx.query.opportunityCandidates.findFirst({ where: eq(schema.opportunityCandidates.id, p.selectedOpportunityId) });
      await tx.update(schema.opportunityCandidates).set({ status: "rejected" }).where(eq(schema.opportunityCandidates.id, p.selectedOpportunityId));
      await tx.insert(schema.projectDecisions).values({ projectId, kind: "user_contest", title: `Choix contesté : ${sel?.title ?? "opportunité"}`, rationale: reason.slice(0, 2000) || "Nouvelle piste demandée par l'utilisateur.", decidedBy: "user" });
      await tx.update(schema.projects).set({ selectedOpportunityId: null }).where(eq(schema.projects.id, projectId));
    }
    await audit({ workspaceId: p?.workspaceId, projectId, actorType: "user", actorId: userId, action: "project.new_direction", data: { reason } }, tx);
  });
  return startRun(projectId, userId, "Nouvelle piste demandée");
}

export async function cancelRun(projectId: string, userId: string) {
  await db().transaction(async (tx) => {
    const runs = await tx.select({ id: schema.orchestrationRuns.id }).from(schema.orchestrationRuns).where(and(eq(schema.orchestrationRuns.projectId, projectId), inArray(schema.orchestrationRuns.status, ["running", "paused"])));
    for (const r of runs) {
      await tx.update(schema.orchestrationRuns).set({ status: "cancelled", finishedAt: new Date() }).where(eq(schema.orchestrationRuns.id, r.id));
      await tx.update(schema.agentTasks).set({ status: "cancelled" }).where(and(eq(schema.agentTasks.orchestrationRunId, r.id), inArray(schema.agentTasks.status, ["pending", "ready", "queued", "paused_budget", "blocked"])));
    }
    await setProjectStatus(tx, projectId, "ready", "Exécution annulée par l'utilisateur.");
    await audit({ projectId, actorType: "user", actorId: userId, action: "run.cancel" }, tx);
  });
}

/* ----------------------------------------------------------------- recovery */

/** Recovers work interrupted by a crash/restart: stale running tasks and orphan queued tasks. */
export async function recoverStale(): Promise<{ requeued: number }> {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MS);
  const stale = await db()
    .update(schema.agentTasks)
    .set({ status: "ready", lastError: "Interrompue (redémarrage ou perte du worker) : reprise automatique.", updatedAt: new Date() })
    .where(and(eq(schema.agentTasks.status, "running"), lt(schema.agentTasks.heartbeatAt, staleBefore)))
    .returning({ id: schema.agentTasks.id, runId: schema.agentTasks.orchestrationRunId, projectId: schema.agentTasks.projectId });
  for (const s of stale) await recordEvent(db(), s.projectId, "task.recovered", "Tâche interrompue reprise automatiquement.", undefined, s.id);
  const orphans = await db()
    .select({ id: schema.agentTasks.id })
    .from(schema.agentTasks)
    .innerJoin(schema.orchestrationRuns, eq(schema.orchestrationRuns.id, schema.agentTasks.orchestrationRunId))
    .where(and(eq(schema.agentTasks.status, "queued"), eq(schema.orchestrationRuns.status, "running"), lt(schema.agentTasks.updatedAt, new Date(Date.now() - 60_000))));
  if (orphans.length) await dispatcher().enqueue(orphans.map((o) => o.id));
  const runs = new Set(stale.map((s) => s.runId));
  for (const r of runs) await dispatchReady(r);
  return { requeued: stale.length + orphans.length };
}

/** Inline executor (tests, CLI): runs ready/queued tasks of a run until nothing is runnable. */
export async function runUntilIdle(runId: string, maxSteps = 200): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    await dispatchReady(runId);
    const next = await db().query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.orchestrationRunId, runId), inArray(schema.agentTasks.status, ["queued", "ready"])), orderBy: schema.agentTasks.createdAt });
    if (!next) return;
    await executeTask(next.id);
  }
  throw new Error("runUntilIdle : nombre maximal d'étapes atteint");
}
