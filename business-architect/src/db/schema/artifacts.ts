import { pgTable, text, uuid, integer, jsonb, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";
import { projects } from "./projects";

export const artifacts = pgTable(
  "artifacts",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["document", "spreadsheet", "code_bundle", "website", "data"] }).notNull(),
    category: text("category", {
      enum: ["strategy", "research", "finance", "brand", "product", "marketing", "sales", "operations", "launch", "quality"],
    }).notNull(),
    status: text("status", { enum: ["draft", "in_review", "validated", "incomplete", "rejected"] }).notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("artifact_project_key_uq").on(t.projectId, t.key), index("artifact_project_idx").on(t.projectId, t.category)],
);

export type ArtifactFile = { path: string; content: string; mimeType: string };
export type Completeness = { complete: boolean; missing: string[] };

export const artifactVersions = pgTable(
  "artifact_versions",
  {
    id: id(),
    artifactId: uuid("artifact_id").notNull().references(() => artifacts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    format: text("format", { enum: ["markdown", "json", "html", "csv", "files"] }).notNull(),
    content: text("content").notNull(),
    files: jsonb("files").$type<ArtifactFile[]>(),
    producedByTaskId: uuid("produced_by_task_id"),
    agentRunId: uuid("agent_run_id"),
    generationMode: text("generation_mode").notNull(),
    completeness: jsonb("completeness").$type<Completeness>().notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("aver_artifact_version_uq").on(t.artifactId, t.version),
    // Idempotency: a retried task never creates a second version.
    uniqueIndex("aver_artifact_task_uq").on(t.artifactId, t.producedByTaskId),
  ],
);

export const artifactReviews = pgTable(
  "artifact_reviews",
  {
    id: id(),
    artifactVersionId: uuid("artifact_version_id").notNull().references(() => artifactVersions.id, { onDelete: "cascade" }),
    reviewer: text("reviewer").notNull(),
    verdict: text("verdict", { enum: ["approved", "changes_requested", "blocked"] }).notNull(),
    findings: jsonb("findings").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("areview_version_idx").on(t.artifactVersionId)],
);

export const artifactDependencies = pgTable(
  "artifact_dependencies",
  {
    artifactId: uuid("artifact_id").notNull().references(() => artifacts.id, { onDelete: "cascade" }),
    dependsOnArtifactId: uuid("depends_on_artifact_id").notNull().references(() => artifacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.artifactId, t.dependsOnArtifactId] })],
);

export const fileMetadata = pgTable(
  "file_metadata",
  {
    id: id(),
    artifactVersionId: uuid("artifact_version_id").notNull().references(() => artifactVersions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fmeta_version_path_uq").on(t.artifactVersionId, t.path)],
);
