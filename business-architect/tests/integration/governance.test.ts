import { describe, it, expect, afterAll, beforeAll, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db, schema } from "@/db/client";
import { requestAction } from "@/governance/policy";
import { decideApproval, listApprovals } from "@/governance/approvals";
import { setResearchFetch } from "@/research/http";
import { setDispatcher, noopDispatcher } from "@/orchestration/queue";
import { startRun, runUntilIdle, resumeProject } from "@/orchestration/orchestrator";
import { setLlmProviderOverride } from "@/ai/registry";
import { assembleContext } from "@/orchestration/context";
import { qaHandler } from "@/agents/quality-auditor";
import { saveArtifact } from "@/artifacts/service";
import type { AgentContext } from "@/agents/framework";
import { fixtureFetch } from "./fixtures";
import { ScriptedLlm } from "./scripted-llm";
import { makeUser, makeProfiledProject } from "./helpers";

beforeAll(() => setDispatcher(noopDispatcher));
afterEach(() => {
  setResearchFetch(null);
  setLlmProviderOverride(null);
});
afterAll(closeDb);

async function profiled() {
  const { user, workspaceId } = await makeUser();
  const { project } = await makeProfiledProject(user.id, workspaceId);
  return { user, workspaceId, projectId: project.id };
}

describe("M9 — gouvernance L1/L2/L3", () => {
  it("L1 autorisé, L2 en attente (dédupliqué), L3 refusé et audité", async () => {
    const { workspaceId, projectId } = await profiled();
    const base = { workspaceId, projectId, objective: "o", consequences: "c", actor: { type: "agent" as const, id: "developer" } };
    expect(await requestAction({ ...base, actionType: "generate_document", title: "doc", dedupeKey: "d1" })).toEqual({ outcome: "allowed", level: "L1" });
    const a = await requestAction({ ...base, actionType: "publish_website", title: "pub", dedupeKey: "pub", estimatedCostEur: 0 });
    const b = await requestAction({ ...base, actionType: "publish_website", title: "pub", dedupeKey: "pub", estimatedCostEur: 0 });
    expect(a.outcome).toBe("pending_approval");
    expect(b).toEqual(a);
    await expect(requestAction({ ...base, actionType: "fabricate_evidence", title: "faux avis", dedupeKey: "x" })).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
    await expect(requestAction({ ...base, actionType: "unknown_new_action", title: "?", dedupeKey: "u" })).resolves.toMatchObject({ outcome: "pending_approval" });
    const denied = await db().select().from(schema.auditEvents).where(and(eq(schema.auditEvents.projectId, projectId), eq(schema.auditEvents.outcome, "denied")));
    expect(denied.map((d) => d.action)).toContain("action.fabricate_evidence");
  });

  it("une règle d'espace peut durcir L2 en interdiction, jamais l'assouplir", async () => {
    const { workspaceId, projectId } = await profiled();
    await db().insert(schema.permissions).values({ workspaceId, actionType: "run_ad_campaign", policy: "deny" });
    await expect(requestAction({ workspaceId, projectId, actionType: "run_ad_campaign", title: "pub", objective: "o", consequences: "c", dedupeKey: "ad", actor: { type: "agent", id: "x" } })).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });

  it("approuver une publication sans connecteur ne prétend pas l'avoir exécutée", async () => {
    const { user, workspaceId, projectId } = await profiled();
    const d = await requestAction({ workspaceId, projectId, actionType: "publish_website", title: "Publier", objective: "o", consequences: "c", dedupeKey: "p", actor: { type: "agent", id: "x" } });
    if (d.outcome !== "pending_approval") throw new Error("expected pending");
    const res = await decideApproval(user.id, d.approvalId, "approved", "ok");
    expect(res?.status).toBe("approved");
    expect(res?.executionNote).toMatch(/Aucun connecteur/);
    await expect(decideApproval(user.id, d.approvalId, "approved")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("un non-membre ne voit ni ne décide les approbations ; un simple membre ne peut pas décider", async () => {
    const { workspaceId, projectId } = await profiled();
    const other = await makeUser();
    const d = await requestAction({ workspaceId, projectId, actionType: "spend_money", title: "Achat", objective: "o", consequences: "c", dedupeKey: "s", actor: { type: "agent", id: "x" } });
    if (d.outcome !== "pending_approval") throw new Error("expected pending");
    await expect(decideApproval(other.user.id, d.approvalId, "approved")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listApprovals(other.user.id, workspaceId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db().insert(schema.workspaceMembers).values({ workspaceId, userId: other.user.id, role: "member" });
    await expect(decideApproval(other.user.id, d.approvalId, "approved")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("M9 — FinOps : budget IA", () => {
  it("le budget atteint suspend les tâches ; reprise possible après ajustement", async () => {
    setResearchFetch(fixtureFetch());
    const llm = new ScriptedLlm({}, 0.5);
    setLlmProviderOverride(llm);
    const { user, workspaceId, projectId } = await profiled();
    await db().update(schema.workspaceSettings).set({ aiMode: "llm" }).where(eq(schema.workspaceSettings.workspaceId, workspaceId));
    await db().update(schema.budgets).set({ limitEur: 0.1 }).where(eq(schema.budgets.projectId, projectId));
    const runId = await startRun(projectId, user.id);
    await runUntilIdle(runId);
    expect(llm.calls).toEqual([]); // blocked BEFORE calling the model
    const task = await db().query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.orchestrationRunId, runId), eq(schema.agentTasks.kind, "discovery.explore")) });
    expect(task?.status).toBe("paused_budget");
    const p = await db().query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    expect(p?.status).toBe("paused");
    expect(p?.statusReason).toMatch(/Budget IA atteint/);
    const alerts = await db().select().from(schema.budgetAlerts).where(eq(schema.budgetAlerts.projectId, projectId));
    expect(alerts.some((a) => a.level === "exceeded")).toBe(true);
    // Option offered to the user: switch to heuristic mode (no AI spend), then resume.
    await db().update(schema.workspaceSettings).set({ aiMode: "heuristic" }).where(eq(schema.workspaceSettings.workspaceId, workspaceId));
    await resumeProject(projectId, user.id);
    await runUntilIdle(runId);
    expect((await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.id, runId) }))?.status).toBe("completed");
  }, 120_000);
});

describe("M9 — contrôle qualité", () => {
  async function completedProject() {
    setResearchFetch(fixtureFetch());
    const r = await profiled();
    const runId = await startRun(r.projectId, r.user.id);
    await runUntilIdle(runId);
    return { ...r, runId };
  }
  async function qaCtx(r: { projectId: string; runId: string; workspaceId: string }): Promise<AgentContext> {
    const context = await assembleContext({ projectId: r.projectId, runId: r.runId, taskKind: "qa.audit", workspaceId: r.workspaceId });
    return { projectId: r.projectId, workspaceId: r.workspaceId, taskId: "00000000-0000-0000-0000-000000000000", taskKey: "qa", agentRunId: "x", runId: r.runId, iteration: 1, input: {}, profile: context.profile, mode: "heuristic", context, research: async () => { throw new Error("no"); }, llm: async () => { throw new Error("no"); }, note: async () => {} };
  }

  it("détecte un calcul financier incohérent et demande la correction", async () => {
    const r = await completedProject();
    const base = await db().query.financialScenarios.findFirst({ where: and(eq(schema.financialScenarios.projectId, r.projectId), eq(schema.financialScenarios.key, "base")) });
    await db().update(schema.financialProjections).set({ revenue: 999_999 }).where(and(eq(schema.financialProjections.scenarioId, base!.id), eq(schema.financialProjections.month, 12)));
    const res = await qaHandler(await qaCtx(r));
    expect((res.output as { verdict: string }).verdict).toBe("blocked");
    expect(res.control?.redo).toContain("finance.model");
    expect(res.evaluation?.findings.join(" ")).toMatch(/incohérent avec un recalcul indépendant/);
  }, 120_000);

  it("un livrable incomplet n'est pas présenté comme terminé et bloque l'audit", async () => {
    const r = await completedProject();
    const saved = await db().transaction((tx) =>
      saveArtifact(tx, { projectId: r.projectId, taskId: null, agentRunId: null, generationMode: "heuristic" }, { key: "product-spec", title: "Cahier des charges MVP", kind: "document", category: "product", format: "markdown", content: "# Spec\n\n## Personas\n\n[à compléter]", requiredSections: ["Personas", "Fonctionnalités"] }),
    );
    expect(saved.completeness.complete).toBe(false);
    const art = await db().query.artifacts.findFirst({ where: and(eq(schema.artifacts.projectId, r.projectId), eq(schema.artifacts.key, "product-spec")) });
    expect(art).toMatchObject({ status: "incomplete", currentVersion: 2 });
    const res = await qaHandler(await qaCtx(r));
    expect(res.control?.redo).toContain("product.spec");
  }, 120_000);
});

describe("M4 — chemin LLM (fournisseur scripté)", () => {
  it("l'inventeur rejette les références de sources inventées et exige la diversité", async () => {
    setResearchFetch(fixtureFetch());
    const directions: string[] = [];
    const llm = new ScriptedLlm({
      directions: () => ({ directions: [{ label: "cabinets dentaires", sector: "Santé", customerType: "b2b", naf: "86.23Z", problemStatement: "Les cabinets dentaires gèrent mal les rappels de soins.", problemShort: "les rappels de soins", hnQuery: "dental practice recall reminders", frQuery: "cabinet dentaire rappels", archetypes: ["vertical_saas", "productized_service"] }, { label: "fleuristes", sector: "Commerce", customerType: "b2b", naf: "47.76Z", problemStatement: "Les fleuristes perdent des fleurs invendues.", problemShort: "les invendus de fleurs", hnQuery: "florist waste", frQuery: "fleuriste invendus", archetypes: ["data_product", "info_product"] }] }),
      concepts: (req) => {
        const ids = [...req.prompt.matchAll(/<untrusted_source id="([^"]+)"/g)].map((m) => m[1]!);
        const dirIds = [...req.prompt.matchAll(/(seg:[a-z-]+|llm:\d+:\d)/g)].map((m) => m[1]!);
        directions.push(...dirIds);
        const uniq = [...new Set(dirIds)];
        const arch = ["vertical_saas", "productized_service", "info_product", "data_product", "community_membership"];
        return { concepts: arch.map((a, i) => ({ directionId: uniq[i % uniq.length], archetypeId: a, title: `Concept ${i} ${a}`, summary: "Résumé suffisamment long du concept.", targetCustomer: "Clients", problem: "Un problème réel décrit ici.", solution: "Une solution précise décrite ici.", valueProposition: "Une valeur claire et mesurable.", priceEur: 30 + i, priceUnit: "€/mois", setupCostEur: 200, monthlyFixedEur: 30, assumptions: ["hyp 1", "hyp 2"], groundingSourceIds: [ids[0] ?? "x", "00000000-0000-0000-0000-00000000dead"] })) };
      },
    });
    setLlmProviderOverride(llm);
    const { user, workspaceId, projectId } = await profiled();
    await db().update(schema.workspaceSettings).set({ aiMode: "llm" }).where(eq(schema.workspaceSettings.workspaceId, workspaceId));
    await db().update(schema.budgets).set({ limitEur: 100 }).where(eq(schema.budgets.projectId, projectId));
    const runId = await startRun(projectId, user.id);
    // Run only the discovery tasks with the scripted model.
    const { executeTask, dispatchReady } = await import("@/orchestration/orchestrator");
    for (const kind of ["discovery.explore", "discovery.invent"]) {
      await dispatchReady(runId);
      const t = await db().query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.orchestrationRunId, runId), eq(schema.agentTasks.kind, kind)) });
      await executeTask(t!.id);
      expect((await db().query.agentTasks.findFirst({ where: eq(schema.agentTasks.id, t!.id) }))?.status, kind).toBe("succeeded");
    }
    const cands = await db().select().from(schema.opportunityCandidates).where(eq(schema.opportunityCandidates.projectId, projectId));
    expect(cands.length).toBe(5);
    expect(cands.every((c) => c.generationMode === "llm")).toBe(true);
    for (const c of cands) expect((c.content as { groundingSourceIds: string[] }).groundingSourceIds).not.toContain("00000000-0000-0000-0000-00000000dead");
    const out = await db().query.agentOutputs.findFirst({ where: and(eq(schema.agentOutputs.projectId, projectId), eq(schema.agentOutputs.kind, "discovery.invent")) });
    expect((out!.content as { dropped: string[] }).dropped.join(" ")).toMatch(/inexistante/);
    const usage = await db().select().from(schema.aiUsageEvents).where(eq(schema.aiUsageEvents.projectId, projectId));
    expect(usage.length).toBe(2);
    expect(usage.every((u) => u.costEur > 0 && u.inputTokens === 1000)).toBe(true);
    expect(llm.calls).toEqual(["directions", "concepts"]);
  }, 120_000);
});
