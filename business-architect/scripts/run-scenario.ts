/**
 * Runs the central scenario end-to-end against the REAL research APIs, inline
 * (no worker needed), on the database in DATABASE_URL. Prints a summary.
 *   npx tsx scripts/run-scenario.ts [budget] [hours] [country]
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { signup } from "@/auth/service";
import { createProject } from "@/projects/service";
import { answerIntake } from "@/intake/engine";
import { setDispatcher, noopDispatcher } from "@/orchestration/queue";
import { startRun, runUntilIdle } from "@/orchestration/orchestrator";
import { db, schema, closeDb } from "@/db/client";

const [budget = "1000", hours = "10", country = "France"] = process.argv.slice(2);
setDispatcher(noopDispatcher);
const t0 = Date.now();
const { user, workspaceId } = await signup({ email: `scenario-${randomUUID()}@example.test`, password: "scenario-password", displayName: "Scénario central" });
const project = await createProject(user.id, { workspaceId });
for (const a of ["Je n'ai pas d'idée : explore tout et choisis", budget, country, hours, "Entreprise durable", "Passer", "Rien de particulier"]) await answerIntake(project.id, user.id, a);
const runId = await startRun(project.id, user.id);
await runUntilIdle(runId);
const d = db();
const p = (await d.query.projects.findFirst({ where: eq(schema.projects.id, project.id) }))!;
const cands = await d.select().from(schema.opportunityCandidates).where(eq(schema.opportunityCandidates.projectId, project.id));
const jobs = await d.select().from(schema.researchJobs).where(eq(schema.researchJobs.projectId, project.id));
const arts = await d.select().from(schema.artifacts).where(eq(schema.artifacts.projectId, project.id));
const ap = await d.select().from(schema.approvalRequests).where(eq(schema.approvalRequests.projectId, project.id));
const byProvider: Record<string, string> = {};
for (const j of jobs) byProvider[j.provider] = `${jobs.filter((x) => x.provider === j.provider && x.status === "succeeded").length}/${jobs.filter((x) => x.provider === j.provider).length}`;
process.stdout.write(JSON.stringify({
  durationS: Math.round((Date.now() - t0) / 1000),
  projectId: project.id,
  login: "voir l'e-mail ci-dessous",
  status: p.status,
  statusReason: p.statusReason,
  research: byProvider,
  candidates: cands.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((c) => `${c.rank}. [${c.status}] ${c.title} — ${c.totalScore}`),
  artifacts: arts.map((a) => `${a.key}: ${a.status} v${a.currentVersion}`),
  approvals: ap.map((a) => `${a.actionType}: ${a.status}`),
}, null, 1) + "\n");
await closeDb();
