import { pgTable, text, uuid, jsonb, index, bigserial, uniqueIndex } from "drizzle-orm/pg-core";
import { id, createdAt, tsz, money } from "./common";
import { workspaces, users } from "./identity";
import { projects } from "./projects";

export const connectors = pgTable(
  "connectors",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status", { enum: ["active", "disabled", "error"] }).notNull().default("active"),
    config: jsonb("config").notNull().default({}),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("connector_ws_kind_uq").on(t.workspaceId, t.kind)],
);

/** AES-256-GCM encrypted secrets. Plaintext never stored nor logged. */
export const connectorCredentials = pgTable("connector_credentials", {
  id: id(),
  connectorId: uuid("connector_id").notNull().references(() => connectors.id, { onDelete: "cascade" }),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  hint: text("hint").notNull(),
  createdAt: createdAt(),
  rotatedAt: tsz("rotated_at"),
});

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    level: text("level", { enum: ["L2"] }).notNull().default("L2"),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    estimatedCostEur: money("estimated_cost_eur").notNull().default(0),
    consequences: text("consequences").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status", { enum: ["pending", "approved", "rejected", "executed", "execution_failed", "cancelled"] })
      .notNull()
      .default("pending"),
    executionNote: text("execution_note"),
    /** Idempotency: one request per (project, dedupe key). */
    dedupeKey: text("dedupe_key").notNull(),
    requestedByTaskId: uuid("requested_by_task_id"),
    createdAt: createdAt(),
    decidedAt: tsz("decided_at"),
  },
  (t) => [uniqueIndex("approval_project_dedupe_uq").on(t.projectId, t.dedupeKey), index("approval_ws_status_idx").on(t.workspaceId, t.status)],
);

export const approvalDecisions = pgTable("approval_decisions", {
  id: id(),
  approvalRequestId: uuid("approval_request_id").notNull().references(() => approvalRequests.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workspaceId: uuid("workspace_id"),
    projectId: uuid("project_id"),
    actorType: text("actor_type", { enum: ["user", "agent", "system"] }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    target: text("target"),
    outcome: text("outcome", { enum: ["allowed", "denied", "pending", "error"] }).notNull().default("allowed"),
    data: jsonb("data"),
    correlationId: text("correlation_id"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_ws_idx").on(t.workspaceId, t.id), index("audit_project_idx").on(t.projectId, t.id)],
);

/** Per-workspace/project overrides of the default governance policy for an action type. */
export const permissions = pgTable(
  "permissions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    policy: text("policy", { enum: ["ask", "deny"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("perm_ws_idx").on(t.workspaceId)],
);

export const scheduledActions = pgTable(
  "scheduled_actions",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    cron: text("cron"),
    runAt: tsz("run_at"),
    payload: jsonb("payload").notNull().default({}),
    status: text("status", { enum: ["active", "paused", "done"] }).notNull().default("active"),
    lastRunAt: tsz("last_run_at"),
    createdAt: createdAt(),
  },
  (t) => [index("sched_project_idx").on(t.projectId)],
);
