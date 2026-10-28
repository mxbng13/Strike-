import { pgTable, text, uuid, integer, jsonb, boolean, real, index, uniqueIndex } from "drizzle-orm/pg-core";
import { id, createdAt, tsz, microMoney } from "./common";
import { projects, opportunityCandidates } from "./projects";

export const researchJobs = pgTable(
  "research_jobs",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id"),
    provider: text("provider").notNull(),
    query: text("query").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed", "skipped"] }).notNull(),
    resultCount: integer("result_count").notNull().default(0),
    totalAvailable: integer("total_available"),
    error: text("error"),
    costEur: microMoney("cost_eur").notNull().default(0),
    createdAt: createdAt(),
    finishedAt: tsz("finished_at"),
  },
  (t) => [index("rjob_project_idx").on(t.projectId, t.createdAt)],
);

export const researchSources = pgTable(
  "research_sources",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    researchJobId: uuid("research_job_id").references(() => researchJobs.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: text("source_type", {
      enum: ["web", "official_registry", "public_dataset", "statistics", "forum", "news", "documentation"],
    }).notNull(),
    publishedAt: tsz("published_at"),
    retrievedAt: tsz("retrieved_at").notNull(),
    snippet: text("snippet"),
    /** Set when the content contained instruction-like text (possible prompt injection). */
    injectionFlag: boolean("injection_flag").notNull().default(false),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rsource_project_url_uq").on(t.projectId, t.url), index("rsource_project_idx").on(t.projectId)],
);

export const sourceSnapshots = pgTable("source_snapshots", {
  id: id(),
  sourceId: uuid("source_id").notNull().references(() => researchSources.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(),
  excerpt: text("excerpt").notNull(),
  retrievedAt: tsz("retrieved_at").notNull(),
});

export const sourceClaims = pgTable(
  "source_claims",
  {
    id: id(),
    sourceId: uuid("source_id").notNull().references(() => researchSources.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    quote: text("quote"),
    numericValue: real("numeric_value"),
    unit: text("unit"),
    createdAt: createdAt(),
  },
  (t) => [index("sclaim_project_idx").on(t.projectId)],
);

export const evidenceAssessments = pgTable("evidence_assessments", {
  id: id(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunityCandidates.id, { onDelete: "cascade" }),
  sourceCount: integer("source_count").notNull(),
  officialSourceCount: integer("official_source_count").notNull(),
  distinctProviders: integer("distinct_providers").notNull(),
  observationCount: integer("observation_count").notNull(),
  hypothesisCount: integer("hypothesis_count").notNull(),
  quality: text("quality", { enum: ["none", "weak", "moderate", "strong"] }).notNull(),
  qualityScore: real("quality_score").notNull(),
  notes: jsonb("notes").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});
