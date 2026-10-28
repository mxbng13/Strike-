import { createHash } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db/client";
import type { ArtifactFile, Completeness } from "@/db/schema/artifacts";

export type ArtifactCategory = (typeof schema.artifacts.$inferInsert)["category"];
export type ArtifactKind = (typeof schema.artifacts.$inferInsert)["kind"];

export type ArtifactDraft = {
  key: string;
  title: string;
  kind: ArtifactKind;
  category: ArtifactCategory;
  format: "markdown" | "json" | "html" | "csv" | "files";
  content: string;
  files?: ArtifactFile[];
  /** Markdown headings (## …) that must exist with a non-empty body. */
  requiredSections?: string[];
  requiredFiles?: string[];
  sourceIds?: string[];
  dependsOn?: string[];
};

export const PLACEHOLDER = /\[(?:à compléter|a completer|todo|tbd)\]|lorem ipsum/i;

/** Completeness is computed from the content, never self-declared by the producing agent. */
export function checkCompleteness(d: Pick<ArtifactDraft, "format" | "content" | "files" | "requiredSections" | "requiredFiles">): Completeness {
  const missing: string[] = [];
  if (!d.content.trim() && !(d.files && d.files.length)) missing.push("contenu vide");
  if (d.format === "markdown" && d.requiredSections) {
    for (const h of d.requiredSections) {
      const re = new RegExp(`^##\\s+${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "mi");
      const m = d.content.match(re);
      if (!m) missing.push(`section « ${h} » absente`);
      else if (m[1]!.replace(/\s+/g, "").length < 20) missing.push(`section « ${h} » vide`);
    }
  }
  for (const f of d.requiredFiles ?? []) if (!d.files?.some((x) => x.path === f && x.content.length > 0)) missing.push(`fichier ${f} manquant`);
  if (PLACEHOLDER.test(d.content) || d.files?.some((f) => PLACEHOLDER.test(f.content))) missing.push("contient des marqueurs « à compléter »");
  return { complete: missing.length === 0, missing };
}

export async function saveArtifact(
  tx: DbOrTx,
  ctx: { projectId: string; taskId: string | null; agentRunId: string | null; generationMode: string },
  d: ArtifactDraft,
): Promise<{ artifactId: string; version: number; completeness: Completeness; created: boolean }> {
  const completeness = checkCompleteness(d);
  const [art] = await tx
    .insert(schema.artifacts)
    .values({ projectId: ctx.projectId, key: d.key, title: d.title, kind: d.kind, category: d.category })
    .onConflictDoUpdate({ target: [schema.artifacts.projectId, schema.artifacts.key], set: { title: d.title, updatedAt: new Date() } })
    .returning({ id: schema.artifacts.id, currentVersion: schema.artifacts.currentVersion });

  if (ctx.taskId) {
    const existing = await tx.query.artifactVersions.findFirst({
      where: and(eq(schema.artifactVersions.artifactId, art!.id), eq(schema.artifactVersions.producedByTaskId, ctx.taskId)),
    });
    if (existing) return { artifactId: art!.id, version: existing.version, completeness: existing.completeness, created: false };
  }
  // Lock the artifact row to allocate the next version number safely.
  const [locked] = await tx.execute<{ current_version: number }>(sql`SELECT current_version FROM artifacts WHERE id = ${art!.id} FOR UPDATE`).then((r) => r.rows);
  const version = Number(locked?.current_version ?? 0) + 1;
  const [ver] = await tx
    .insert(schema.artifactVersions)
    .values({
      artifactId: art!.id,
      version,
      format: d.format,
      content: d.content,
      files: d.files ?? null,
      producedByTaskId: ctx.taskId,
      agentRunId: ctx.agentRunId,
      generationMode: ctx.generationMode,
      completeness,
      sourceIds: d.sourceIds ?? [],
    })
    .returning({ id: schema.artifactVersions.id });
  for (const f of d.files ?? []) {
    await tx.insert(schema.fileMetadata).values({
      artifactVersionId: ver!.id,
      path: f.path,
      mimeType: f.mimeType,
      sizeBytes: Buffer.byteLength(f.content),
      sha256: createHash("sha256").update(f.content).digest("hex"),
    });
  }
  await tx
    .update(schema.artifacts)
    .set({ currentVersion: version, status: completeness.complete ? "in_review" : "incomplete", updatedAt: new Date() })
    .where(eq(schema.artifacts.id, art!.id));
  for (const depKey of d.dependsOn ?? []) {
    const dep = await tx.query.artifacts.findFirst({ where: and(eq(schema.artifacts.projectId, ctx.projectId), eq(schema.artifacts.key, depKey)) });
    if (dep) await tx.insert(schema.artifactDependencies).values({ artifactId: art!.id, dependsOnArtifactId: dep.id }).onConflictDoNothing();
  }
  return { artifactId: art!.id, version, completeness, created: true };
}

export async function latestVersion(projectId: string, key: string, tx: DbOrTx = db()) {
  const art = await tx.query.artifacts.findFirst({ where: and(eq(schema.artifacts.projectId, projectId), eq(schema.artifacts.key, key)) });
  if (!art || art.currentVersion === 0) return null;
  const ver = await tx.query.artifactVersions.findFirst({
    where: and(eq(schema.artifactVersions.artifactId, art.id), eq(schema.artifactVersions.version, art.currentVersion)),
  });
  return ver ? { artifact: art, version: ver } : null;
}

export async function listArtifacts(projectId: string) {
  return db().select().from(schema.artifacts).where(eq(schema.artifacts.projectId, projectId)).orderBy(schema.artifacts.category, schema.artifacts.title);
}

export async function artifactVersions(artifactId: string) {
  return db()
    .select({
      id: schema.artifactVersions.id,
      version: schema.artifactVersions.version,
      format: schema.artifactVersions.format,
      generationMode: schema.artifactVersions.generationMode,
      completeness: schema.artifactVersions.completeness,
      createdAt: schema.artifactVersions.createdAt,
      producedByTaskId: schema.artifactVersions.producedByTaskId,
    })
    .from(schema.artifactVersions)
    .where(eq(schema.artifactVersions.artifactId, artifactId))
    .orderBy(desc(schema.artifactVersions.version));
}

export async function reviewArtifact(tx: DbOrTx, artifactId: string, versionId: string, reviewer: string, verdict: "approved" | "changes_requested" | "blocked", findings: string[]) {
  await tx.insert(schema.artifactReviews).values({ artifactVersionId: versionId, reviewer, verdict, findings });
  const status = verdict === "approved" ? "validated" : verdict === "blocked" ? "rejected" : "incomplete";
  await tx.update(schema.artifacts).set({ status, updatedAt: new Date() }).where(eq(schema.artifacts.id, artifactId));
}
