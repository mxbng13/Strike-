import { z } from "zod";
import { inArray, eq, and, lt } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { AgentContext, AgentResult } from "./framework";
import { SEGMENTS, segmentsForSector, segmentsForIdea, type Segment } from "@/discovery/segments";
import { ARCHETYPES } from "@/discovery/archetypes";
import { providersFor } from "@/research/providers";
import { seededRandom, table, list, MODE_BANNER } from "./md";
import type { Signals } from "@/discovery/types";

/** Reference département for the company-density index (Rhône, a large mixed urban/rural market). */
export const DENSITY_DEPT = "69";

export type Direction = {
  id: string;
  segmentId: string | null;
  label: string;
  sector: string;
  customerType: "b2b" | "b2c";
  naf: string | null;
  problems: Array<{ id: string; short: string; statement: string; hnQuery: string; frQuery: string; archetypes: string[] }>;
  signals: Signals;
  sourceIds: string[];
  origin: "catalogue" | "llm";
};

export type ExploreOutput = {
  iteration: number;
  directions: Direction[];
  connectorReport: Array<{ provider: string; ok: boolean; calls: number; failures: number; lastError: string | null }>;
  coverageWarning: string | null;
};

const LlmDirections = z.object({
  directions: z
    .array(
      z.object({
        label: z.string().describe("segment de clientèle au pluriel, ex. « cabinets dentaires »"),
        sector: z.string(),
        customerType: z.enum(["b2b", "b2c"]),
        naf: z.string().nullable().describe("code NAF rév. 2 si clientèle B2B française, sinon null"),
        problemStatement: z.string().describe("hypothèse de problème à vérifier"),
        problemShort: z.string(),
        hnQuery: z.string().describe("requête en anglais pour trouver des discussions sur ce problème"),
        frQuery: z.string().describe("mots-clés français"),
        archetypes: z.array(z.enum(Object.keys(ARCHETYPES) as [string, ...string[]])).min(1),
      }),
    )
    .min(2)
    .max(4),
});

function fits(seg: Segment, ctx: AgentContext): boolean {
  const p = ctx.profile;
  if (p.customerPreference !== "any" && seg.customerType !== p.customerPreference) return false;
  return seg.problems.some((pr) =>
    pr.archetypes.some((aid) => {
      const a = ARCHETYPES[aid];
      return (p.allowPhysicalProducts || !a.physical) && (p.allowDirectCustomerContact || !a.requiresDirectContact) && a.setupCostEur <= Math.max(p.budgetEur, 50);
    }),
  );
}

/** Picks diverse directions (≥ 4 sectors when possible), excluding those explored in earlier iterations. */
export function pickDirections(ctx: AgentContext, exclude: Set<string>, count = 6): { segments: Segment[]; warning: string | null } {
  const p = ctx.profile;
  let pool = SEGMENTS;
  let warning: string | null = null;
  if (p.mode === "sector" && p.sector) {
    const matched = segmentsForSector(p.sector);
    if (matched.length === 0) warning = `Le secteur « ${p.sector} » n'est pas couvert par le catalogue d'exploration heuristique ; exploration élargie. Un modèle de langage (ANTHROPIC_API_KEY) permet d'explorer n'importe quel secteur.`;
    else pool = matched;
  }
  if (p.mode === "existing_idea" && p.existingIdea) {
    const related = segmentsForIdea(p.existingIdea);
    pool = [...related, ...SEGMENTS.filter((s) => !related.includes(s))];
  }
  const rnd = seededRandom(`${ctx.projectId}:${ctx.iteration}`);
  const candidates = pool.filter((s) => !exclude.has(s.id) && fits(s, ctx));
  const shuffled = candidates.map((s) => ({ s, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.s);
  if (p.mode === "existing_idea") shuffled.sort((a, b) => Number(segmentsForIdea(p.existingIdea ?? "").includes(b)) - Number(segmentsForIdea(p.existingIdea ?? "").includes(a)));
  const picked: Segment[] = [];
  const sectors = new Set<string>();
  for (const s of shuffled) if (picked.length < count && !sectors.has(s.sector)) { picked.push(s); sectors.add(s.sector); }
  for (const s of shuffled) if (picked.length < count && !picked.includes(s)) picked.push(s);
  if (picked.length === 0) warning = (warning ? warning + " " : "") + "Aucune direction compatible avec toutes tes contraintes dans le catalogue.";
  return { segments: picked, warning };
}

async function previouslyExplored(ctx: AgentContext): Promise<Set<string>> {
  const rows = await db()
    .select({ content: schema.agentOutputs.content })
    .from(schema.agentOutputs)
    .innerJoin(schema.agentTasks, eq(schema.agentTasks.id, schema.agentOutputs.taskId))
    .innerJoin(schema.orchestrationRuns, eq(schema.orchestrationRuns.id, schema.agentTasks.orchestrationRunId))
    .where(and(eq(schema.agentOutputs.projectId, ctx.projectId), eq(schema.agentOutputs.kind, "discovery.explore"), lt(schema.orchestrationRuns.discoveryIteration, ctx.iteration)));
  const ids = new Set<string>();
  for (const r of rows) for (const d of (r.content as ExploreOutput).directions) if (d.segmentId) ids.add(d.segmentId);
  const rejected = await db().select({ c: schema.opportunityCandidates.content }).from(schema.opportunityCandidates).where(and(eq(schema.opportunityCandidates.projectId, ctx.projectId), inArray(schema.opportunityCandidates.status, ["rejected"])));
  for (const r of rejected) {
    const sid = (r.c as { segmentId?: string | null }).segmentId;
    if (sid) ids.add(sid);
  }
  return ids;
}

export async function exploreHandler(ctx: AgentContext): Promise<AgentResult> {
  const exclude = await previouslyExplored(ctx);
  const { segments, warning } = pickDirections(ctx, exclude);
  const directions: Direction[] = segments.map((s) => ({
    id: `seg:${s.id}`,
    segmentId: s.id,
    label: s.label,
    sector: s.sector,
    customerType: s.customerType,
    naf: s.naf ?? null,
    problems: s.problems.map((p) => ({ ...p, archetypes: [...p.archetypes] })),
    signals: emptySignals(),
    sourceIds: [],
    origin: "catalogue",
  }));

  // LLM mode: let the model propose extra directions beyond the catalogue (verified by research below).
  if (ctx.mode === "llm") {
    const out = await ctx.llm({
      instructions: `Propose 2 à 4 directions d'exploration SUPPLÉMENTAIRES, réellement différentes de celles-ci : ${directions.map((d) => d.label).join(", ") || "aucune"}. Elles doivent respecter les contraintes de l'utilisateur et viser des besoins concrets. Ce sont des hypothèses : elles seront vérifiées par la recherche.`,
      schema: LlmDirections,
      schemaName: "directions",
      maxTokens: 6000,
    });
    for (const [i, d] of out.directions.entries()) {
      directions.push({
        id: `llm:${ctx.iteration}:${i}`,
        segmentId: null,
        label: d.label,
        sector: d.sector,
        customerType: d.customerType,
        naf: d.naf && /^\d{2}\.\d{2}[A-Z]$/.test(d.naf) ? d.naf : null,
        problems: [{ id: `p${i}`, short: d.problemShort, statement: d.problemStatement, hnQuery: d.hnQuery, frQuery: d.frQuery, archetypes: d.archetypes }],
        signals: emptySignals(),
        sourceIds: [],
        origin: "llm",
      });
    }
  }

  const report = new Map<string, { provider: string; ok: boolean; calls: number; failures: number; lastError: string | null }>();
  const track = (provider: string, ok: boolean, err?: string) => {
    const r = report.get(provider) ?? { provider, ok: true, calls: 0, failures: 0, lastError: null };
    r.calls++;
    if (!ok) {
      r.failures++;
      r.lastError = err ?? null;
    }
    r.ok = r.failures < r.calls;
    report.set(provider, r);
  };
  const cc = ctx.profile.countryCode;
  const has = (cap: Parameters<typeof providersFor>[0]) => providersFor(cap, cc);

  let population: { value: number; sourceId: string } | null = null;
  if (directions.some((d) => d.customerType === "b2c") && has("statistics").length) {
    const r = await ctx.research("eurostat", { query: "", purpose: "Taille du marché B2C (population)", countryCode: cc });
    track("eurostat", r.ok, r.ok ? undefined : r.error);
    if (r.ok && r.claims[0]?.numericValue) population = { value: r.claims[0].numericValue, sourceId: r.claims[0].sourceId };
  }

  for (const d of directions) {
    if (d.customerType === "b2b" && d.naf && has("companies").length) {
      const r = await ctx.research("recherche-entreprises", { query: "", purpose: `Densité de ${d.label} (département ${DENSITY_DEPT})`, filters: { naf: d.naf, departement: DENSITY_DEPT }, limit: 3 });
      track("recherche-entreprises", r.ok, r.ok ? undefined : r.error);
      if (r.ok) {
        d.signals.registryDensityDept = r.totalAvailable ?? null;
        d.signals.registryDept = DENSITY_DEPT;
        d.sourceIds.push(...r.claims.map((c) => c.sourceId));
      }
    }
    if (d.customerType === "b2c" && population) {
      d.signals.population = population.value;
      d.sourceIds.push(population.sourceId);
    }
    for (const pr of d.problems.slice(0, 2)) {
      if (has("discussions").length) {
        const r = await ctx.research("hn-algolia", { query: pr.hnQuery, purpose: `Signaux de demande : ${pr.short}`, limit: 5, lang: "en" });
        track("hn-algolia", r.ok, r.ok ? undefined : r.error);
        if (r.ok) {
          d.signals.discussions = (d.signals.discussions ?? 0) + (r.totalAvailable ?? 0);
          d.signals.discussionEngagement = (d.signals.discussionEngagement ?? 0) + r.sources.reduce((s, x) => s + Number(/(\d+) points/.exec(x.snippet ?? "")?.[1] ?? 0), 0);
          d.sourceIds.push(...r.claims.map((c) => c.sourceId), ...r.sources.slice(0, 3).map((s) => s.id));
        }
      }
      for (const web of has("web").slice(0, 1)) {
        const r = await ctx.research(web.id, { query: `${pr.frQuery} ${d.label}`, purpose: `Recherche Web : ${pr.short}`, limit: 6, countryCode: cc, lang: "fr" });
        track(web.id, r.ok, r.ok ? undefined : r.error);
        if (r.ok) {
          d.signals.webResults = (d.signals.webResults ?? 0) + r.sources.length;
          d.sourceIds.push(...r.sources.slice(0, 4).map((s) => s.id));
        }
      }
    }
    if (has("datasets").length) {
      const r = await ctx.research("data-gouv", { query: d.problems[0]?.frQuery ?? d.label, purpose: `Données publiques : ${d.label}`, limit: 3 });
      track("data-gouv", r.ok, r.ok ? undefined : r.error);
      if (r.ok) {
        d.signals.datasets = r.totalAvailable ?? 0;
        d.sourceIds.push(...r.claims.map((c) => c.sourceId), ...r.sources.slice(0, 2).map((s) => s.id));
      }
    }
    d.sourceIds = [...new Set(d.sourceIds)];
  }

  const output: ExploreOutput = { iteration: ctx.iteration, directions, connectorReport: [...report.values()], coverageWarning: warning };
  const failed = output.connectorReport.filter((r) => r.failures > 0);
  if (failed.length) await ctx.note(`Connecteurs en échec : ${failed.map((f) => `${f.provider} (${f.failures}/${f.calls})`).join(", ")}`, { failed });

  const md =
    MODE_BANNER(ctx.mode) +
    `# Journal d'exploration — itération ${ctx.iteration}\n\n${warning ? `> ${warning}\n\n` : ""}## Directions explorées\n\n` +
    table(
      ["Direction", "Secteur", "Client", "Densité (registre, dép. 69)", "Discussions", "Jeux de données"],
      directions.map((d) => [d.label, d.sector, d.customerType.toUpperCase(), d.signals.registryDensityDept ?? "n/d", d.signals.discussions ?? "n/d", d.signals.datasets ?? "n/d"]),
    ) +
    `\n\n## Hypothèses de problèmes (non vérifiées)\n\n${list(directions.flatMap((d) => d.problems.map((p) => `${d.label} : ${p.statement}`)))}\n\n## État des connecteurs\n\n` +
    table(["Connecteur", "Appels", "Échecs", "Dernière erreur"], output.connectorReport.map((r) => [r.provider, r.calls, r.failures, r.lastError ?? "—"])) +
    `\n\nConnecteurs non configurés : ${(await import("@/research/providers")).providerStatus().filter((p) => !p.available).map((p) => `${p.label} (${p.reason})`).join(", ") || "aucun"}.\n`;

  return {
    kind: "discovery.explore",
    output,
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [{ key: `research-log-${ctx.iteration}`, title: `Journal d'exploration (itération ${ctx.iteration})`, kind: "document", category: "research", format: "markdown", content: md, sourceIds: [...new Set(directions.flatMap((d) => d.sourceIds))] }],
    evaluation: {
      passed: directions.length >= 3 && output.connectorReport.some((r) => r.ok),
      findings: [
        `${directions.length} directions explorées sur ${new Set(directions.map((d) => d.sector)).size} secteurs.`,
        ...(output.connectorReport.some((r) => r.ok) ? [] : ["Aucun connecteur de recherche n'a répondu : aucune donnée observée."]),
      ],
    },
  };
}

function emptySignals(): Signals {
  return { registryDensityDept: null, registryDept: null, registryNational: null, registryNationalIsLowerBound: false, population: null, discussions: null, discussionEngagement: null, datasets: null, webResults: null, competitorsFound: null };
}
