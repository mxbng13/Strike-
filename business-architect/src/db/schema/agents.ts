import { pgTable, text, uuid, integer, jsonb, boolean, real, index, uniqueIndex, bigserial, pgEnum } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt, tsz, microMoney } from "./common";
import { projects, generationMode } from "./projects";

export const taskStatus = pgEnum("task_status", [
  "pending", // waiting for dependencies
  "ready", // dependencies satisfied, not yet dispatched
  "queued", // dispatched to the job queue
  "running",
  "succeeded",
  "failed",
  "blocked", // blocked by QA or by a failed dependency
  "paused_budget",
  "awaiting_approval",
  "cancelled",
]);

/** Registry of agent roles (seeded from code, see src/agents/registry.ts). */
export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mission: text("mission").notNull(),
  contractVersion: integer("contract_version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orchestrationRuns = pgTable(
  "orchestration_runs",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["running", "paused", "completed", "failed", "cancelled"] }).notNull().default("running"),
    discoveryIteration: integer("discovery_iteration").notNull().default(1),
    triggeredBy: uuid("triggered_by"),
    reason: text("reason"),
    startedAt: createdAt(),
    finishedAt: tsz("finished_at"),
  },
  (t) => [index("orun_project_idx").on(t.projectId, t.startedAt)],
);

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    orchestrationRunId: uuid("orchestration_run_id").notNull().references(() => orchestrationRuns.id, { onDelete: "cascade" }),
    /** Stable key inside a run, e.g. "discovery.invent#2". Unique → idempotent planning. */
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    agentId: text("agent_id").notNull().references(() => agents.id),
    phase: text("phase").notNull(),
    label: text("label").notNull(),
    status: taskStatus("status").notNull().default("pending"),
    dependsOn: jsonb("depends_on").$type<string[]>().notNull().default([]),
    input: jsonb("input").notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    blockedReason: text("blocked_reason"),
    heartbeatAt: tsz("heartbeat_at"),
    startedAt: tsz("started_at"),
    finishedAt: tsz("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("task_run_key_uq").on(t.orchestrationRunId, t.key),
    index("task_project_status_idx").on(t.projectId, t.status),
    index("task_status_idx").on(t.status, t.updatedAt),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    taskId: uuid("task_id").notNull().references(() => agentTasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull().references(() => agents.id),
    attempt: integer("attempt").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull().default("running"),
    mode: generationMode("mode").notNull(),
    model: text("model"),
    contextDigest: jsonb("context_digest"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costEur: microMoney("cost_eur").notNull().default(0),
    error: text("error"),
    startedAt: createdAt(),
    finishedAt: tsz("finished_at"),
  },
  (t) => [index("arun_task_idx").on(t.taskId), index("arun_project_idx").on(t.projectId, t.startedAt)],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: id(),
    agentRunId: uuid("agent_run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["system", "user", "assistant", "note"] }).notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("amsg_run_idx").on(t.agentRunId)],
);

/** Exactly one accepted output per task — written in the same transaction as task success. */
export const agentOutputs = pgTable(
  "agent_outputs",
  {
    id: id(),
    taskId: uuid("task_id").notNull().references(() => agentTasks.id, { onDelete: "cascade" }),
    agentRunId: uuid("agent_run_id").notNull().references(() => agentRuns.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: jsonb("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("aout_task_uq").on(t.taskId), index("aout_project_kind_idx").on(t.projectId, t.kind)],
);

export const agentEvaluations = pgTable(
  "agent_evaluations",
  {
    id: id(),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull().references(() => agentTasks.id, { onDelete: "cascade" }),
    evaluator: text("evaluator").notNull(),
    passed: boolean("passed").notNull(),
    score: real("score"),
    findings: jsonb("findings").notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("aeval_task_idx").on(t.taskId)],
);

export const workflowEvents = pgTable(
  "workflow_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id"),
    type: text("type").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("wevent_project_idx").on(t.projectId, t.id)],
);
