import { pgTable, text, uuid, integer, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { id, createdAt, tsz, money, microMoney } from "./common";
import { projects } from "./projects";
import { workspaces, users } from "./identity";

/**
 * Two distinct budget kinds:
 *  - ai_operations: what this application may spend on LLM/research for the user (FinOps).
 *  - entrepreneurial: the user's own money for the business (planning only, never spent by the AI).
 */
export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["ai_operations", "entrepreneurial"] }).notNull(),
    period: text("period", { enum: ["monthly", "total", "per_task"] }).notNull(),
    limitEur: money("limit_eur").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("budgets_ws_idx").on(t.workspaceId), index("budgets_project_idx").on(t.projectId)],
);

export const financialAssumptions = pgTable(
  "financial_assumptions",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: money("value").notNull(),
    unit: text("unit").notNull(),
    origin: text("origin", { enum: ["observed", "assumption", "user"] }).notNull(),
    sourceId: uuid("source_id"),
    rationale: text("rationale").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fassump_project_version_key_uq").on(t.projectId, t.version, t.key)],
);

export const financialScenarios = pgTable(
  "financial_scenarios",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    key: text("key", { enum: ["pessimistic", "base", "optimistic"] }).notNull(),
    inputs: jsonb("inputs").notNull(),
    summary: jsonb("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fscen_project_version_key_uq").on(t.projectId, t.version, t.key)],
);

export const financialProjections = pgTable(
  "financial_projections",
  {
    id: id(),
    scenarioId: uuid("scenario_id").notNull().references(() => financialScenarios.id, { onDelete: "cascade" }),
    month: integer("month").notNull(),
    customers: money("customers").notNull(),
    revenue: money("revenue").notNull(),
    variableCosts: money("variable_costs").notNull(),
    paymentFees: money("payment_fees").notNull(),
    grossMargin: money("gross_margin").notNull(),
    fixedCosts: money("fixed_costs").notNull(),
    acquisition: money("acquisition").notNull(),
    netCashFlow: money("net_cash_flow").notNull(),
    cashBalance: money("cash_balance").notNull(),
  },
  (t) => [uniqueIndex("fproj_scenario_month_uq").on(t.scenarioId, t.month)],
);

export const actualExpenses = pgTable("actual_expenses", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  category: text("category").notNull(),
  amountEur: money("amount_eur").notNull(),
  incurredAt: tsz("incurred_at").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id"),
    agentRunId: uuid("agent_run_id"),
    provider: text("provider").notNull(),
    model: text("model"),
    operation: text("operation").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costEur: microMoney("cost_eur").notNull(),
    /** true when tokens were not reported and the cost is an estimate. */
    estimated: boolean("estimated").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("usage_ws_time_idx").on(t.workspaceId, t.createdAt), index("usage_project_idx").on(t.projectId, t.createdAt)],
);

export const providerCosts = pgTable(
  "provider_costs",
  {
    id: id(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputPerMTokUsd: microMoney("input_per_mtok_usd").notNull().default(0),
    outputPerMTokUsd: microMoney("output_per_mtok_usd").notNull().default(0),
    perRequestUsd: microMoney("per_request_usd").notNull().default(0),
    validFrom: tsz("valid_from").notNull(),
    sourceNote: text("source_note").notNull(),
  },
  (t) => [uniqueIndex("pcost_provider_model_from_uq").on(t.provider, t.model, t.validFrom)],
);

export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id").references(() => budgets.id, { onDelete: "cascade" }),
    level: text("level", { enum: ["warning", "exceeded"] }).notNull(),
    message: text("message").notNull(),
    acknowledgedAt: tsz("acknowledged_at"),
    createdAt: createdAt(),
  },
  (t) => [index("balert_ws_idx").on(t.workspaceId, t.createdAt)],
);
