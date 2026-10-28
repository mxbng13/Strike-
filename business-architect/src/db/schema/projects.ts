import { pgTable, text, uuid, integer, jsonb, boolean, real, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt, tsz, money } from "./common";
import { workspaces, users } from "./identity";

export const projectMode = pgEnum("project_mode", ["autonomous", "sector", "existing_idea"]);
export const projectStatus = pgEnum("project_status", [
  "intake",
  "ready",
  "running",
  "paused",
  "awaiting_approval",
  "blocked",
  "completed",
  "failed",
]);
export const lifecyclePhase = pgEnum("lifecycle_phase", [
  "intake",
  "discovery",
  "evaluation",
  "charter",
  "validation",
  "design",
  "construction",
  "qa",
  "launch_prep",
  "launch",
  "optimization",
]);
export const milestoneStatus = pgEnum("milestone_status", ["pending", "in_progress", "done", "blocked", "skipped"]);
export const generationMode = pgEnum("generation_mode", ["llm", "heuristic", "deterministic", "user"]);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    mode: projectMode("mode").notNull().default("autonomous"),
    status: projectStatus("status").notNull().default("intake"),
    phase: lifecyclePhase("phase").notNull().default("intake"),
    selectedOpportunityId: uuid("selected_opportunity_id"),
    statusReason: text("status_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: tsz("archived_at"),
  },
  (t) => [index("projects_ws_idx").on(t.workspaceId, t.updatedAt)],
);

export const intakeMessages = pgTable(
  "intake_messages",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["assistant", "user"] }).notNull(),
    questionKey: text("question_key"),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("intake_project_idx").on(t.projectId, t.createdAt)],
);

/** The structured UserProfile (constraints & goals). One row per project, versioned. */
export const projectConstraints = pgTable("project_constraints", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  country: text("country").notNull(),
  budgetEur: money("budget_eur").notNull(),
  weeklyHours: integer("weekly_hours").notNull(),
  horizon: text("horizon", { enum: ["quick_revenue", "durable", "high_growth"] }).notNull(),
  sectorPreference: text("sector_preference"),
  existingIdea: text("existing_idea"),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  exclusions: jsonb("exclusions").$type<string[]>().notNull().default([]),
  riskTolerance: text("risk_tolerance", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  profile: jsonb("profile").notNull(),
  defaultsUsed: jsonb("defaults_used").$type<string[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

export const opportunityCandidates = pgTable(
  "opportunity_candidates",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    iteration: integer("iteration").notNull().default(1),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    sector: text("sector").notNull(),
    businessModel: text("business_model").notNull(),
    targetCustomer: text("target_customer").notNull(),
    problem: text("problem").notNull(),
    solution: text("solution").notNull(),
    content: jsonb("content").notNull(),
    scores: jsonb("scores"),
    totalScore: real("total_score"),
    rank: integer("rank"),
    status: text("status", { enum: ["proposed", "shortlisted", "rejected", "selected"] }).notNull().default("proposed"),
    generationMode: generationMode("generation_mode").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("opp_project_slug_uq").on(t.projectId, t.slug), index("opp_project_idx").on(t.projectId, t.iteration)],
);

export const opportunityEvidence = pgTable(
  "opportunity_evidence",
  {
    id: id(),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunityCandidates.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id"),
    kind: text("kind", { enum: ["demand", "competition", "pricing", "regulation", "trend", "risk", "market_size"] }).notNull(),
    stance: text("stance", { enum: ["supports", "contradicts", "neutral"] }).notNull(),
    statement: text("statement").notNull(),
    /** true = observed in a source; false = hypothesis/inference by an agent. */
    isObservation: boolean("is_observation").notNull(),
    confidence: real("confidence").notNull().default(0.5),
    createdAt: createdAt(),
  },
  (t) => [index("evidence_opp_idx").on(t.opportunityId)],
);

export const marketResearch = pgTable("market_research", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").references(() => opportunityCandidates.id, { onDelete: "cascade" }),
  content: jsonb("content").notNull(),
  createdAt: createdAt(),
});

export const competitorProfiles = pgTable(
  "competitor_profiles",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunityCandidates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url"),
    sourceId: uuid("source_id"),
    registryId: text("registry_id"),
    description: text("description"),
    kind: text("kind", { enum: ["direct", "indirect", "alternative"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("competitors_opp_idx").on(t.opportunityId)],
);

export const businessModels = pgTable(
  "business_models",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("bm_project_version_uq").on(t.projectId, t.version)],
);

export const projectCharters = pgTable(
  "project_charters",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    opportunityId: uuid("opportunity_id").references(() => opportunityCandidates.id, { onDelete: "set null" }),
    content: jsonb("content").notNull(),
    status: text("status", { enum: ["draft", "validated", "superseded"] }).notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("charter_project_version_uq").on(t.projectId, t.version)],
);

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    phase: lifecyclePhase("phase").notNull(),
    status: milestoneStatus("status").notNull().default("pending"),
    entryCriteria: jsonb("entry_criteria").$type<string[]>().notNull().default([]),
    exitCriteria: jsonb("exit_criteria").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    startedAt: tsz("started_at"),
    completedAt: tsz("completed_at"),
  },
  (t) => [uniqueIndex("milestone_project_phase_uq").on(t.projectId, t.phase)],
);

export const projectDecisions = pgTable(
  "project_decisions",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    rationale: text("rationale").notNull(),
    alternatives: jsonb("alternatives").notNull().default([]),
    uncertainties: jsonb("uncertainties").$type<string[]>().notNull().default([]),
    decidedBy: text("decided_by", { enum: ["ai", "user"] }).notNull(),
    taskId: uuid("task_id"),
    supersededById: uuid("superseded_by_id"),
    createdAt: createdAt(),
  },
  (t) => [index("decisions_project_idx").on(t.projectId, t.createdAt)],
);

export const projectRisks = pgTable(
  "project_risks",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category", { enum: ["market", "financial", "technical", "regulatory", "operational", "dependency", "legal"] }).notNull(),
    likelihood: integer("likelihood").notNull(),
    impact: integer("impact").notNull(),
    mitigation: text("mitigation").notNull(),
    status: text("status", { enum: ["open", "mitigated", "accepted", "closed"] }).notNull().default("open"),
    taskId: uuid("task_id"),
    createdAt: createdAt(),
  },
  (t) => [index("risks_project_idx").on(t.projectId)],
);

/** Entrepreneurial budget lines are stored in finance; this keeps the business-side launch budget alongside the charter. */
export const projectBudgetSnapshot = pgTable("project_budget_snapshot", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  plannedSetupEur: money("planned_setup_eur").notNull().default(0),
  plannedMonthlyEur: money("planned_monthly_eur").notNull().default(0),
  updatedAt: updatedAt(),
});
