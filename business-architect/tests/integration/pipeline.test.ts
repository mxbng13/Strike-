import { describe, it, expect, afterAll, beforeAll, afterEach } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, db, schema } from "@/db/client";
import { setResearchFetch } from "@/research/http";
import { setDispatcher, noopDispatcher } from "@/orchestration/queue";
import { startRun, runUntilIdle, recoverStale, executeTask, requestNewDirection } from "@/orchestration/orchestrator";
import { ALL_SPECS } from "@/orchestration/plan";
import { REQUIRED_ARTIFACTS } from "@/agents/quality-auditor";
import { assembleContext } from "@/orchestration/context";
import { fixtureFetch } from "./fixtures";
import { makeUser, makeProfiledProject } from "./helpers";

beforeAll(() => setDispatcher(noopDispatcher));
afterEach(() => setResearchFetch(null));
afterAll(closeDb);

async function fullRun(answers?: string[], fixtureOpts = {}) {
  setResearchFetch(fixtureFetch(fixtureOpts));
  const { user, workspaceId } = await makeUser();
  const { project } = await makeProfiledProject(user.id, workspaceId, answers);
  const runId = await startRun(project.id, user.id);
  await runUntilIdle(runId);
  return { user, workspaceId, projectId: project.id, runId };
}

describe("M4–M7 — scénario central : créer un business sans idée initiale", () => {
  let r: Awaited<ReturnType<typeof fullRun>>;
  beforeAll(async () => {
    r = await fullRun();
  }, 120_000);

  it("termine l'exécution et attend les approbations humaines", async () => {
    const run = await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, r.runId) });
    const p = await db().query.projects.findFirst({ where: eq(schema.projects.id, r.projectId) });
    const failed = await db().select().from(schema.agentTasks).where(and(eq(schema.agentTasks.orchestrationRunId, r.runId), inArray(schema.agentTasks.status, ["failed", "blocked"])));
    expect(failed.map((f) => `${f.kind}: ${f.lastError}`)).toEqual([]);
    expect(run?.status).toBe("completed");
    expect(p?.status).toBe("awaiting_approval");
  });

  it("explore plusieurs directions avec des recherches enregistrées et sourcées", async () => {
    const jobs = await db().select().from(schema.researchJobs).where(eq(schema.researchJobs.projectId, r.projectId));
    expect(jobs.filter((j) => j.status === "succeeded").length).toBeGreaterThan(10);
    expect(new Set(jobs.map((j) => j.provider)).size).toBeGreaterThanOrEqual(3);
    const sources = await db().select().from(schema.researchSources).where(eq(schema.researchSources.projectId, r.projectId));
    expect(sources.every((s) => s.url.startsWith("http") && s.retrievedAt)).toBe(true);
  });

  it("génère ≥ 5 concepts distincts (≥ 3 modèles, ≥ 3 secteurs) et en sélectionne un avec justification", async () => {
    const c = await db().select().from(schema.opportunityCandidates).where(eq(schema.opportunityCandidates.projectId, r.projectId));
    expect(c.length).toBeGreaterThanOrEqual(5);
    expect(new Set(c.map((x) => x.businessModel)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(c.map((x) => x.sector)).size).toBeGreaterThanOrEqual(3);
    const selected = c.filter((x) => x.status === "selected");
    expect(selected).toHaveLength(1);
    expect(selected[0]!.totalScore).toBeGreaterThan(0);
    expect(c.every((x) => x.scores)).toBe(true);
    const p = await db().query.projects.findFirst({ where: eq(schema.projects.id, r.projectId) });
    expect(p?.selectedOpportunityId).toBe(selected[0]!.id);
    const decision = await db().query.projectDecisions.findFirst({ where: and(eq(schema.projectDecisions.projectId, r.projectId), eq(schema.projectDecisions.kind, "opportunity_selection")) });
    expect(decision?.rationale.length).toBeGreaterThan(50);
    expect((decision?.alternatives as unknown[]).length).toBeGreaterThanOrEqual(4);
  });

  it("toutes les preuves observées pointent vers des sources réellement stockées", async () => {
    const sel = (await db().query.projects.findFirst({ where: eq(schema.projects.id, r.projectId) }))!.selectedOpportunityId!;
    const ev = await db().select().from(schema.opportunityEvidence).where(eq(schema.opportunityEvidence.opportunityId, sel));
    const obs = ev.filter((e) => e.isObservation);
    expect(obs.length).toBeGreaterThan(0);
    const ids = obs.map((e) => e.sourceId).filter((x): x is string => Boolean(x));
    const found = await db().select({ id: schema.researchSources.id }).from(schema.researchSources).where(inArray(schema.researchSources.id, ids));
    expect(found.length).toBe(new Set(ids).size);
    expect(ev.some((e) => !e.isObservation && e.kind === "risk")).toBe(true);
  });

  it("produit tous les livrables obligatoires, complets et versionnés", async () => {
    const arts = await db().select().from(schema.artifacts).where(eq(schema.artifacts.projectId, r.projectId));
    for (const key of Object.keys(REQUIRED_ARTIFACTS)) {
      const a = arts.find((x) => x.key === key);
      expect(a, key).toBeDefined();
      expect(a!.currentVersion).toBeGreaterThanOrEqual(1);
      expect(a!.status, key).toBe("validated");
    }
    expect(arts.filter((a) => a.status === "incomplete").map((a) => a.key)).toEqual([]);
    expect(arts.find((a) => a.key === "launch-plan")).toBeDefined();
    expect(arts.find((a) => a.key === "qa-report")).toBeDefined();
  });

  it("calcule 3 scénarios financiers avec hypothèses étiquetées", async () => {
    const sc = await db().select().from(schema.financialScenarios).where(eq(schema.financialScenarios.projectId, r.projectId));
    expect(sc.map((s) => s.key).sort()).toEqual(["base", "optimistic", "pessimistic"]);
    const as = await db().select().from(schema.financialAssumptions).where(eq(schema.financialAssumptions.projectId, r.projectId));
    expect(as.find((a) => a.key === "starting_cash")?.value).toBe(1000);
    expect(as.filter((a) => a.origin === "assumption").length).toBeGreaterThan(5);
  });

  it("le site généré a été réellement testé en sandbox", async () => {
    const out = await db().select().from(schema.agentOutputs).where(and(eq(schema.agentOutputs.projectId, r.projectId), eq(schema.agentOutputs.kind, "build.website")));
    const tests = (out[0]!.content as { tests: Array<{ ok: boolean }> }).tests;
    expect(tests.length).toBeGreaterThanOrEqual(10);
    expect(tests.every((t) => t.ok)).toBe(true);
  });

  it("les actions externes restent en attente d'approbation (rien n'est exécuté)", async () => {
    const ap = await db().select().from(schema.approvalRequests).where(eq(schema.approvalRequests.projectId, r.projectId));
    expect(ap.map((a) => a.actionType)).toEqual(expect.arrayContaining(["publish_website", "purchase_domain", "send_external_communication", "register_company"]));
    expect(ap.every((a) => a.status === "pending")).toBe(true);
  });

  it("les jalons reflètent les tâches réellement exécutées", async () => {
    const ms = await db().select().from(schema.projectMilestones).where(eq(schema.projectMilestones.projectId, r.projectId));
    const st = Object.fromEntries(ms.map((m) => [m.phase, m.status]));
    expect(st).toMatchObject({ intake: "done", discovery: "done", evaluation: "done", charter: "done", validation: "done", design: "done", construction: "done", qa: "done", launch_prep: "done", launch: "pending", optimization: "pending" });
  });

  it("mode heuristique : aucun coût IA, tout est étiqueté", async () => {
    const usage = await db().select().from(schema.aiUsageEvents).where(eq(schema.aiUsageEvents.projectId, r.projectId));
    expect(usage).toEqual([]);
    const runs = await db().select().from(schema.agentRuns).where(eq(schema.agentRuns.projectId, r.projectId));
    expect(runs.every((x) => x.mode === "heuristic" || x.mode === "deterministic")).toBe(true);
    expect(new Set(runs.map((x) => x.agentId)).size).toBe(12);
  });
});

describe("autres scénarios obligatoires", () => {
  it("secteur imposé : l'IA invente les concepts dans ce secteur", async () => {
    const r = await fullRun(["J'ai un secteur en tête", "Éducation", "1500", "France", "10", "durable", "passer", "rien"]);
    const c = await db().select().from(schema.opportunityCandidates).where(eq(schema.opportunityCandidates.projectId, r.projectId));
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c.every((x) => /éducation|formation/i.test(x.sector))).toBe(true);
    expect(c.every((x) => x.generationMode !== "user")).toBe(true);
  }, 120_000);

  it("idée existante : évaluée et challengée face à des alternatives de l'IA", async () => {
    const r = await fullRun(["J'ai déjà une idée à évaluer", "Une application pour gérer les adhésions des clubs de sport amateurs", "1000", "France", "10", "durable", "passer", "rien"]);
    const c = await db().select().from(schema.opportunityCandidates).where(eq(schema.opportunityCandidates.projectId, r.projectId));
    const user = c.find((x) => x.generationMode === "user");
    expect(user).toBeDefined();
    expect(user!.rank).toBeGreaterThanOrEqual(1);
    expect(c.filter((x) => x.generationMode !== "user").length).toBeGreaterThanOrEqual(4);
    const decision = await db().select().from(schema.agentOutputs).where(and(eq(schema.agentOutputs.projectId, r.projectId), eq(schema.agentOutputs.kind, "evaluation.select")));
    expect((decision[0]!.content as { userIdea: { recommendation: string } }).userIdea.recommendation).toMatch(/idée/);
  }, 120_000);

  it("un connecteur en échec est signalé et le processus continue", async () => {
    const r = await fullRun(undefined, { failProviders: ["hn-algolia"] });
    const run = await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, r.runId) });
    expect(run?.status).toBe("completed");
    const ev = await db().select().from(schema.workflowEvents).where(and(eq(schema.workflowEvents.projectId, r.projectId), eq(schema.workflowEvents.type, "agent.note")));
    expect(ev.some((e) => /Connecteurs en échec : .*hn-algolia/.test(e.message))).toBe(true);
    const jobs = await db().select().from(schema.researchJobs).where(and(eq(schema.researchJobs.projectId, r.projectId), eq(schema.researchJobs.provider, "hn-algolia")));
    expect(jobs.every((j) => j.status === "failed")).toBe(true);
  }, 120_000);

  it("une page Web malveillante ne modifie ni les règles ni les permissions", async () => {
    const r = await fullRun(undefined, { injectHn: true });
    const flagged = await db().select().from(schema.researchSources).where(and(eq(schema.researchSources.projectId, r.projectId), eq(schema.researchSources.injectionFlag, true)));
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((s) => !/ignore all previous instructions/i.test(s.snippet ?? ""))).toBe(true);
    const ap = await db().select().from(schema.approvalRequests).where(eq(schema.approvalRequests.projectId, r.projectId));
    expect(ap.every((a) => a.status === "pending")).toBe(true);
    const ctx = await assembleContext({ projectId: r.projectId, runId: r.runId, taskKind: "evaluation.market", workspaceId: r.workspaceId });
    const text = ctx.render();
    expect(text).toContain("<untrusted_source");
    expect(text).not.toMatch(/IGNORE ALL PREVIOUS INSTRUCTIONS/);
    expect(ctx.systemPrompt("market_analyst")).toMatch(/aucune autorité/);
  }, 120_000);

  it("une tâche qui échoue est reprise sans dupliquer les résultats", async () => {
    setResearchFetch(fixtureFetch());
    const { user, workspaceId } = await makeUser();
    const { project } = await makeProfiledProject(user.id, workspaceId);
    const spec = ALL_SPECS["brand.identity"]!;
    const original = spec.handler;
    let calls = 0;
    spec.handler = async (ctx) => {
      calls++;
      if (calls === 1) throw new Error("panne simulée du fournisseur");
      return original(ctx);
    };
    try {
      const runId = await startRun(project.id, user.id);
      await runUntilIdle(runId);
    } finally {
      spec.handler = original;
    }
    const tasks = await db().select().from(schema.agentTasks).where(and(eq(schema.agentTasks.projectId, project.id), eq(schema.agentTasks.kind, "brand.identity")));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ status: "succeeded", attempts: 2 });
    const outs = await db().select().from(schema.agentOutputs).where(and(eq(schema.agentOutputs.projectId, project.id), eq(schema.agentOutputs.kind, "brand.identity")));
    expect(outs).toHaveLength(1);
    const art = await db().query.artifacts.findFirst({ where: and(eq(schema.artifacts.projectId, project.id), eq(schema.artifacts.key, "brand-identity")) });
    expect(art?.currentVersion).toBe(1);
  }, 120_000);

  it("après un redémarrage, une tâche interrompue est récupérée et menée à terme", async () => {
    setResearchFetch(fixtureFetch());
    const { user, workspaceId } = await makeUser();
    const { project } = await makeProfiledProject(user.id, workspaceId);
    const runId = await startRun(project.id, user.id);
    // Simulate a worker crash in the middle of the first task.
    const [t] = await db().update(schema.agentTasks).set({ status: "running", attempts: 1, heartbeatAt: new Date(Date.now() - 10 * 60_000) }).where(and(eq(schema.agentTasks.orchestrationRunId, runId), eq(schema.agentTasks.kind, "discovery.explore"))).returning();
    await executeTask(t!.id); // a duplicate delivery must be a no-op while "running"
    expect((await db().query.agentTasks.findFirst({ where: eq(schema.agentTasks.id, t!.id) }))?.status).toBe("running");
    const rec = await recoverStale();
    expect(rec.requeued).toBeGreaterThanOrEqual(1);
    await runUntilIdle(runId);
    expect((await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, runId) }))?.status).toBe("completed");
    const events = await db().select().from(schema.workflowEvents).where(and(eq(schema.workflowEvents.projectId, project.id), eq(schema.workflowEvents.type, "task.recovered")));
    expect(events.length).toBe(1);
  }, 120_000);

  it("demander une nouvelle piste rejette le choix et relance une exploration différente", async () => {
    const r = await fullRun();
    const first = (await db().query.projects.findFirst({ where: eq(schema.projects.id, r.projectId) }))!.selectedOpportunityId!;
    const firstCand = await db().query.opportunityCandidates.findFirst({ where: eq(schema.opportunityCandidates.id, first) });
    const run2 = await requestNewDirection(r.projectId, r.user.id, "Je préfère éviter ce secteur.");
    await runUntilIdle(run2);
    const p = await db().query.projects.findFirst({ where: eq(schema.projects.id, r.projectId) });
    expect(p?.selectedOpportunityId).not.toBe(first);
    const second = await db().query.opportunityCandidates.findFirst({ where: eq(schema.opportunityCandidates.id, p!.selectedOpportunityId!) });
    expect(second?.iteration).toBeGreaterThan(firstCand!.iteration);
    expect((await db().query.opportunityCandidates.findFirst({ where: eq(schema.opportunityCandidates.id, first) }))?.status).toBe("rejected");
  }, 180_000);
});
