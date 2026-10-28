import { z } from "zod";
import { schema } from "@/db/client";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { ExploreOutput, Direction } from "./opportunity-researcher";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import { ConceptSchema, type Concept } from "@/discovery/types";
import { scoreConcept, evidenceQualityScore } from "@/discovery/scoring";
import { slugify, table, MODE_BANNER } from "./md";

const MIN_CONCEPTS = 5;
const MAX_CONCEPTS = 7;

export function conceptFrom(d: Direction, problemIdx: number, archetypeId: ArchetypeId, iteration: number, origin: "ai" | "user" = "ai"): Concept {
  const p = d.problems[problemIdx]!;
  const a = ARCHETYPES[archetypeId];
  const title = a.title(d.label, p.short);
  const price = a.priceEur[d.customerType];
  return ConceptSchema.parse({
    slug: `${slugify(title)}-i${iteration}`,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    summary: a.solution(d.label, p.short),
    sector: d.sector,
    segmentId: d.segmentId,
    segmentLabel: d.label,
    customerType: d.customerType,
    archetypeId,
    businessModel: a.label,
    targetCustomer: d.customerType === "b2b" ? `${d.label} (TPE/PME, décideur : gérant)` : d.label,
    problem: p.statement,
    solution: a.solution(d.label, p.short),
    valueProposition: `Gagner du temps et de l'argent sur ${p.short}, avec une solution pensée pour les ${d.label}.`,
    priceHypothesis: { amountEur: price, unit: a.priceUnit },
    setupCostEur: a.setupCostEur,
    monthlyFixedEur: a.monthlyFixedEur,
    minWeeklyHours: a.minWeeklyHours,
    digital: a.digital,
    physical: a.physical,
    requiresDirectContact: a.requiresDirectContact,
    assumptions: [
      `Hypothèse : ${p.statement}`,
      `Hypothèse : les ${d.label} acceptent de payer environ ${price} (${a.priceUnit}).`,
      `Hypothèse : un client peut être acquis pour environ ${a.cacEur[d.customerType]} €.`,
    ],
    groundingSourceIds: d.sourceIds,
    origin,
    hnQuery: p.hnQuery,
    frQuery: p.frQuery,
    naf: d.naf,
  });
}

function directionQuality(d: Direction) {
  return evidenceQualityScore({
    sourceCount: d.sourceIds.length,
    officialSourceCount: d.signals.registryDensityDept != null || d.signals.population != null ? 1 : 0,
    distinctProviders: [d.signals.registryDensityDept ?? d.signals.population, d.signals.discussions, d.signals.datasets, d.signals.webResults].filter((x) => x != null).length,
    observationCount: [d.signals.registryDensityDept, d.signals.population, d.signals.discussions, d.signals.datasets].filter((x) => x != null && x > 0).length,
    webSourceCount: d.signals.webResults ?? 0,
  }).score;
}

/** Heuristic invention: combinatorial generation, constraint filtering, then greedy diversity selection. */
export function inventHeuristic(ctx: AgentContext, explore: ExploreOutput): Concept[] {
  const pool: Array<{ c: Concept; s: number }> = [];
  for (const d of explore.directions) {
    d.problems.forEach((p, pi) => {
      for (const aid of p.archetypes as ArchetypeId[]) {
        const a = ARCHETYPES[aid];
        if (!a || !a.customerTypes.includes(d.customerType)) continue;
        const c = conceptFrom(d, pi, aid, explore.iteration);
        const card = scoreConcept(c, d.signals, directionQuality(d), ctx.profile);
        if (card.hardConstraintViolations.length) continue;
        pool.push({ c, s: card.total });
      }
    });
  }
  pool.sort((x, y) => y.s - x.s);
  const chosen: Concept[] = [];
  const bySegment = new Map<string, number>();
  const byArchetype = new Map<string, number>();
  const take = (maxPerSeg: number, maxPerArch: number) => {
    for (const { c } of pool) {
      if (chosen.length >= MAX_CONCEPTS) return;
      if (chosen.some((x) => x.slug === c.slug)) continue;
      const seg = c.segmentId ?? c.segmentLabel;
      if ((bySegment.get(seg) ?? 0) >= maxPerSeg || (byArchetype.get(c.archetypeId) ?? 0) >= maxPerArch) continue;
      chosen.push(c);
      bySegment.set(seg, (bySegment.get(seg) ?? 0) + 1);
      byArchetype.set(c.archetypeId, (byArchetype.get(c.archetypeId) ?? 0) + 1);
    }
  };
  take(1, 2);
  if (chosen.length < MIN_CONCEPTS) take(2, 3);
  if (chosen.length < MIN_CONCEPTS) take(3, 7);
  return chosen;
}

export function userIdeaConcept(ctx: AgentContext, explore: ExploreOutput): Concept | null {
  const idea = ctx.profile.existingIdea;
  if (!idea) return null;
  const t = idea.toLowerCase();
  const archetypeId: ArchetypeId = /appli|application|logiciel|plateforme saas|outil/.test(t)
    ? /mise en relation|plateforme|marketplace|covoiturage|entre particuliers/.test(t) ? "local_marketplace" : "vertical_saas"
    : /boutique|produit|fabriqu|vendre des/.test(t) ? "d2c_physical" : /formation|cours|guide/.test(t) ? "info_product" : /service|accompagn|conseil/.test(t) ? "productized_service" : "vertical_saas";
  const d = explore.directions[0];
  const a = ARCHETYPES[archetypeId];
  const customerType = d?.customerType ?? (a.customerTypes[0] as "b2b" | "b2c");
  return ConceptSchema.parse({
    slug: `idee-utilisateur-i${explore.iteration}`,
    title: idea.length > 120 ? idea.slice(0, 117) + "…" : idea,
    summary: idea,
    sector: d?.sector ?? "Non déterminé",
    segmentId: d?.segmentId ?? null,
    segmentLabel: d?.label ?? "clientèle à préciser",
    customerType,
    archetypeId,
    businessModel: a.label,
    targetCustomer: d?.label ?? "à préciser",
    problem: `Problème supposé par l'utilisateur : ${idea}`,
    solution: idea,
    valueProposition: "À préciser : proposition de valeur formulée par l'utilisateur, non encore validée.",
    priceHypothesis: { amountEur: a.priceEur[customerType], unit: a.priceUnit },
    setupCostEur: a.setupCostEur,
    monthlyFixedEur: a.monthlyFixedEur,
    minWeeklyHours: a.minWeeklyHours,
    digital: a.digital,
    physical: a.physical,
    requiresDirectContact: a.requiresDirectContact,
    assumptions: ["Hypothèse : le problème décrit par l'utilisateur existe et est assez douloureux pour être payé.", `Hypothèse : modèle « ${a.label} » adapté (déduit automatiquement de la description).`],
    groundingSourceIds: d?.sourceIds ?? [],
    origin: "user",
    hnQuery: idea.slice(0, 80),
    frQuery: idea.slice(0, 80),
    naf: d?.naf ?? null,
  });
}

const LlmConcepts = z.object({
  concepts: z
    .array(
      z.object({
        directionId: z.string(),
        archetypeId: z.enum(Object.keys(ARCHETYPES) as [string, ...string[]]),
        title: z.string(),
        summary: z.string(),
        targetCustomer: z.string(),
        problem: z.string(),
        solution: z.string(),
        valueProposition: z.string(),
        priceEur: z.number().positive(),
        priceUnit: z.string(),
        setupCostEur: z.number().min(0),
        monthlyFixedEur: z.number().min(0),
        assumptions: z.array(z.string()).min(2),
        groundingSourceIds: z.array(z.string()),
      }),
    )
    .min(MIN_CONCEPTS)
    .max(MAX_CONCEPTS),
});

async function inventLlm(ctx: AgentContext, explore: ExploreOutput): Promise<{ concepts: Concept[]; dropped: string[] }> {
  const known = new Set(ctx.context.sources.map((s) => s.id));
  const out = await ctx.llm({
    instructions: `Invente ${MIN_CONCEPTS} à ${MAX_CONCEPTS} concepts de business RÉELLEMENT DIFFÉRENTS (au moins 3 archétypes et 3 directions distincts), adaptés aux contraintes. Chaque concept doit être assez précis pour être évalué (client, problème, solution, prix). Ancre chaque concept sur des sources fournies via groundingSourceIds (identifiants exacts). Pas de dropshipping ni de SaaS générique sans justification par les signaux. Directions disponibles : ${explore.directions.map((d) => `${d.id} = ${d.label}`).join(" ; ")}.`,
    schema: LlmConcepts,
    schemaName: "concepts",
    maxTokens: 12_000,
  });
  const dropped: string[] = [];
  const concepts: Concept[] = [];
  for (const c of out.concepts) {
    const d = explore.directions.find((x) => x.id === c.directionId);
    if (!d) {
      dropped.push(`Concept « ${c.title} » ignoré : direction inconnue ${c.directionId}.`);
      continue;
    }
    const unknownIds = c.groundingSourceIds.filter((id) => !known.has(id));
    if (unknownIds.length) dropped.push(`« ${c.title} » : ${unknownIds.length} référence(s) de source inexistante(s) retirée(s).`);
    const a = ARCHETYPES[c.archetypeId as ArchetypeId];
    concepts.push(
      ConceptSchema.parse({
        slug: `${slugify(c.title)}-i${explore.iteration}`,
        title: c.title,
        summary: c.summary,
        sector: d.sector,
        segmentId: d.segmentId,
        segmentLabel: d.label,
        customerType: d.customerType,
        archetypeId: c.archetypeId,
        businessModel: a.label,
        targetCustomer: c.targetCustomer,
        problem: c.problem,
        solution: c.solution,
        valueProposition: c.valueProposition,
        priceHypothesis: { amountEur: c.priceEur, unit: c.priceUnit },
        setupCostEur: c.setupCostEur,
        monthlyFixedEur: c.monthlyFixedEur,
        minWeeklyHours: a.minWeeklyHours,
        digital: a.digital,
        physical: a.physical,
        requiresDirectContact: a.requiresDirectContact,
        assumptions: c.assumptions.map((x) => (x.toLowerCase().startsWith("hypothèse") ? x : `Hypothèse : ${x}`)),
        groundingSourceIds: c.groundingSourceIds.filter((id) => known.has(id)).concat(d.sourceIds).filter((v, i, arr) => arr.indexOf(v) === i),
        origin: "ai",
        hnQuery: d.problems[0]?.hnQuery,
        frQuery: d.problems[0]?.frQuery,
        naf: d.naf,
      }),
    );
  }
  const archetypes = new Set(concepts.map((c) => c.archetypeId)).size;
  const dirs = new Set(concepts.map((c) => c.segmentLabel)).size;
  if (concepts.length < MIN_CONCEPTS || archetypes < 3 || dirs < Math.min(3, explore.directions.length)) {
    throw new AppError("PROVIDER_ERROR", `Concepts insuffisamment diversifiés (${concepts.length} concepts, ${archetypes} archétypes, ${dirs} directions).`, { retryable: true });
  }
  return { concepts, dropped };
}

export async function inventHandler(ctx: AgentContext): Promise<AgentResult> {
  const explore = ctx.context.outputs["discovery.explore"] as ExploreOutput | undefined;
  if (!explore) throw new AppError("INTERNAL", "Exploration absente.");
  let concepts: Concept[];
  let dropped: string[] = [];
  if (ctx.mode === "llm") ({ concepts, dropped } = await inventLlm(ctx, explore));
  else concepts = inventHeuristic(ctx, explore);
  const user = ctx.profile.mode === "existing_idea" ? userIdeaConcept(ctx, explore) : null;
  if (user) concepts = [user, ...concepts];

  const sectors = new Set(concepts.map((c) => c.sector)).size;
  const models = new Set(concepts.map((c) => c.archetypeId)).size;
  const md =
    MODE_BANNER(ctx.mode) +
    `# Concepts imaginés — itération ${explore.iteration}\n\n${concepts.length} concepts, ${sectors} secteurs, ${models} modèles économiques.\n\n` +
    table(["Concept", "Secteur", "Modèle", "Client", "Prix (hypothèse)", "Origine"], concepts.map((c) => [c.title, c.sector, c.businessModel, c.targetCustomer, `${c.priceHypothesis.amountEur} ${c.priceHypothesis.unit}`, c.origin === "user" ? "Idée utilisateur" : "IA"])) +
    "\n\n" +
    concepts.map((c) => `## ${c.title}\n\n**Problème (hypothèse)** : ${c.problem}\n\n**Solution** : ${c.solution}\n\n**Proposition de valeur** : ${c.valueProposition}\n\n**Hypothèses à vérifier** :\n${c.assumptions.map((a) => `- ${a}`).join("\n")}`).join("\n\n") +
    (dropped.length ? `\n\n## Contrôles anti-invention\n\n${dropped.map((x) => `- ${x}`).join("\n")}` : "");

  return {
    kind: "discovery.invent",
    output: { iteration: explore.iteration, conceptSlugs: concepts.map((c) => c.slug), sectors, models, dropped },
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    persist: async (tx) => {
      for (const c of concepts) {
        await tx
          .insert(schema.opportunityCandidates)
          .values({
            projectId: ctx.projectId,
            iteration: explore.iteration,
            slug: c.slug,
            title: c.title,
            summary: c.summary,
            sector: c.sector,
            businessModel: c.businessModel,
            targetCustomer: c.targetCustomer,
            problem: c.problem,
            solution: c.solution,
            content: c,
            generationMode: c.origin === "user" ? "user" : ctx.mode,
          })
          .onConflictDoNothing({ target: [schema.opportunityCandidates.projectId, schema.opportunityCandidates.slug] });
      }
    },
    artifacts: [{ key: `concepts-${explore.iteration}`, title: `Concepts imaginés (itération ${explore.iteration})`, kind: "document", category: "strategy", format: "markdown", content: md, sourceIds: [...new Set(concepts.flatMap((c) => c.groundingSourceIds))] }],
    evaluation: {
      passed: concepts.length >= MIN_CONCEPTS && models >= 3,
      findings: [`${concepts.length} concepts, ${sectors} secteurs, ${models} modèles.`, ...dropped],
    },
  };
}
