import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept, ScoreCard, Signals } from "@/discovery/types";
import { scoreConcept, explainRanking, SELECTION_MIN_SCORE } from "@/discovery/scoring";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import { table, list, MODE_BANNER, sourcesSection, eur } from "./md";
import type { UserProfile } from "@/intake/profile";

export const MAX_DISCOVERY_ITERATIONS = 2;

type MarketOut = { iteration: number; analyses: Array<{ slug: string; signals: Signals; quality: { score: number; quality: string; observationCount: number }; failureReasons: string[] }> };

export type OpportunityDecision = {
  iteration: number;
  outcome: "selected" | "replan" | "blocked";
  selectedSlug: string | null;
  lowConfidence: boolean;
  ranking: Array<{ slug: string; title: string; total: number; status: string; violations: string[]; evidenceQuality: string }>;
  rationale: string;
  decisiveFactors: string[];
  couldChangeDecision: string[];
  userIdea: { rank: number; total: number; recommendation: string } | null;
};

export async function selectHandler(ctx: AgentContext): Promise<AgentResult> {
  const market = ctx.context.outputs["evaluation.market"] as MarketOut | undefined;
  if (!market) throw new AppError("INTERNAL", "Analyse de marché absente.");
  const scored = ctx.context.candidates.map((cand) => {
    const c = cand.content as Concept;
    const a = market.analyses.find((x) => x.slug === cand.slug);
    const card: ScoreCard = scoreConcept(c, a?.signals ?? ({} as Signals), a?.quality.score ?? 0, ctx.profile);
    const observed = (a?.quality.observationCount ?? 0) > 0;
    return { cand, c, card, observed, quality: a?.quality.quality ?? "none" };
  });
  scored.sort((x, y) => y.card.total - x.card.total);
  const eligible = scored.filter((s) => s.card.hardConstraintViolations.length === 0);
  const passing = eligible.filter((s) => s.card.total >= SELECTION_MIN_SCORE && s.observed);

  let outcome: OpportunityDecision["outcome"];
  let winner: (typeof scored)[number] | undefined;
  let lowConfidence = false;
  if (passing.length) {
    outcome = "selected";
    winner = passing[0];
  } else if (Number(ctx.input.runIterationIndex ?? 1) < MAX_DISCOVERY_ITERATIONS) {
    outcome = "replan";
  } else if (eligible.length) {
    outcome = "selected";
    winner = eligible[0];
    lowConfidence = true;
  } else {
    outcome = "blocked";
  }

  const runnerUp = winner ? eligible.find((s) => s !== winner) : undefined;
  const expl = winner ? explainRanking({ title: winner.c.title, card: winner.card }, runnerUp ? { title: runnerUp.c.title, card: runnerUp.card } : undefined) : null;
  const userIdx = scored.findIndex((s) => s.c.origin === "user");
  const userIdea =
    userIdx >= 0
      ? {
          rank: userIdx + 1,
          total: scored[userIdx]!.card.total,
          recommendation:
            winner && winner.c.origin === "user"
              ? "Ton idée ressort en tête de la comparaison : elle est retenue, avec les réserves listées."
              : `Ton idée est classée ${userIdx + 1}e sur ${scored.length}. Les preuves disponibles favorisent une autre option ; tu peux contester ce choix depuis le projet.`,
        }
      : null;

  const rationale =
    outcome === "selected"
      ? `« ${winner!.c.title} » obtient ${winner!.card.total}/100 sur la grille pondérée selon tes objectifs (${ctx.profile.horizon}), respecte toutes tes contraintes${lowConfidence ? ", mais reste sous le seuil de confiance : sélection à faible confiance après " + ctx.iteration + " itérations d'exploration" : ""}. Facteurs décisifs : ${expl!.decisiveFactors.join(", ") || "écart global"}.`
      : outcome === "replan"
        ? `Aucune opportunité n'atteint le seuil (${SELECTION_MIN_SCORE}/100 avec au moins une preuve observée). Nouvelle exploration sur d'autres directions.`
        : "Aucune opportunité ne respecte tes contraintes dures (budget, temps, exclusions). Une décision humaine est nécessaire : augmenter le budget ou le temps disponible, ou retirer une exclusion.";

  const decision: OpportunityDecision = {
    iteration: ctx.iteration,
    outcome,
    selectedSlug: winner?.cand.slug ?? null,
    lowConfidence,
    ranking: scored.map((s) => ({ slug: s.cand.slug, title: s.c.title, total: s.card.total, status: s === winner ? "selected" : s.card.hardConstraintViolations.length ? "rejected" : "shortlisted", violations: s.card.hardConstraintViolations, evidenceQuality: s.quality })),
    rationale,
    decisiveFactors: expl?.decisiveFactors ?? [],
    couldChangeDecision: expl?.couldChangeDecision ?? [],
    userIdea,
  };

  const crit = winner?.card.criteria ?? [];
  const md =
    `# Comparaison des opportunités et décision — itération ${ctx.iteration}\n\n> Le score est un outil de comparaison explicable, pas une vérité mathématique.\n\n## Classement\n\n` +
    table(["#", "Concept", "Score /100", "Preuves", "Statut", "Contraintes non respectées"], scored.map((s, i) => [i + 1, s.c.title, s.card.total, s.quality, decision.ranking[i]!.status, s.card.hardConstraintViolations.join(" ; ") || "—"])) +
    `\n\n## Décision\n\n${rationale}\n\n` +
    (winner
      ? `## Détail du score retenu\n\n${table(["Critère", "Note /10", "Poids", "Base", "Explication"], crit.map((k) => [k.label, k.score, k.weight, k.basedOn === "observed" ? "observé" : "hypothèse", k.explanation]))}\n\n## Ce qui pourrait changer la décision\n\n${list(decision.couldChangeDecision)}\n\n`
      : "") +
    (userIdea ? `## Ton idée\n\n${userIdea.recommendation}\n\n` : "");

  return {
    kind: "evaluation.select",
    output: decision,
    mode: "deterministic",
    persist: async (tx) => {
      for (const [i, s] of scored.entries()) {
        await tx
          .update(schema.opportunityCandidates)
          .set({ scores: s.card, totalScore: s.card.total, rank: i + 1, status: outcome === "replan" ? "rejected" : (decision.ranking[i]!.status as "selected" | "rejected" | "shortlisted") })
          .where(eq(schema.opportunityCandidates.id, s.cand.id));
      }
      if (winner) await tx.update(schema.projects).set({ selectedOpportunityId: winner.cand.id, name: winner.c.title.slice(0, 120), updatedAt: new Date() }).where(eq(schema.projects.id, ctx.projectId));
      await tx.insert(schema.projectDecisions).values({
        projectId: ctx.projectId,
        kind: "opportunity_selection",
        title: outcome === "selected" ? `Opportunité retenue : ${winner!.c.title}` : outcome === "replan" ? `Itération ${ctx.iteration} : relance de l'exploration` : "Aucune opportunité compatible",
        rationale,
        alternatives: scored.filter((s) => s !== winner).map((s) => ({ title: s.c.title, total: s.card.total, violations: s.card.hardConstraintViolations })),
        uncertainties: decision.couldChangeDecision,
        decidedBy: "ai",
        taskId: ctx.taskId,
      });
    },
    artifacts: [{ key: `opportunity-decision-${ctx.iteration}`, title: `Comparaison et décision (itération ${ctx.iteration})`, kind: "document", category: "strategy", format: "markdown", content: md }],
    control: outcome === "replan" ? { replan: { reason: rationale } } : outcome === "blocked" ? { block: { reason: rationale } } : undefined,
    evaluation: { passed: outcome === "selected", findings: [rationale] },
  };
}

/* ------------------------------ charter.build ------------------------------ */

export const CharterSchema = z.object({
  workingName: z.string(),
  problem: z.string(),
  targetCustomer: z.string(),
  valueProposition: z.string(),
  productOrService: z.string(),
  businessModel: z.string(),
  positioning: z.string(),
  assumptions: z.array(z.string()).min(2),
  risks: z.array(z.object({ title: z.string(), category: z.enum(["market", "financial", "technical", "regulatory", "operational", "dependency", "legal"]), likelihood: z.number().int().min(1).max(5), impact: z.number().int().min(1).max(5), mitigation: z.string() })).min(3),
  objectives: z.array(z.object({ objective: z.string(), metric: z.string(), target: z.string(), deadline: z.string() })).min(3),
  kpis: z.array(z.string()).min(3),
});
export type Charter = z.infer<typeof CharterSchema>;

export function charterHeuristic(c: Concept, profile: UserProfile, failureReasons: string[]): Charter {
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const first = Math.max(1, a.monthsToFirstSale);
  return {
    workingName: c.title,
    problem: c.problem,
    targetCustomer: c.targetCustomer,
    valueProposition: c.valueProposition,
    productOrService: c.solution,
    businessModel: `${a.label} — ${c.priceHypothesis.amountEur} ${c.priceHypothesis.unit} (prix à tester)`,
    positioning: `Solution spécialisée pour les ${c.segmentLabel}, plus simple et moins chère que les outils généralistes, avec un accompagnement en français.`,
    assumptions: c.assumptions,
    risks: [
      ...failureReasons.slice(0, 3).map((f, i) => ({ title: f, category: (i === 0 ? "market" : "operational") as Charter["risks"][number]["category"], likelihood: 3, impact: 4, mitigation: "Tester tôt via le plan de validation ; ajuster l'offre selon les retours." })),
      { title: "Demande non confirmée par des clients payants", category: "market", likelihood: 3, impact: 5, mitigation: "Ne pas investir au-delà du budget de test avant d'atteindre les seuils du plan de validation." },
      { title: "Obligations légales et fiscales non vérifiées", category: "legal", likelihood: 2, impact: 4, mitigation: "Vérifier statut, assurances, mentions légales et RGPD sur les sources officielles avant le lancement." },
    ],
    objectives: [
      { objective: "Valider le problème", metric: "Entretiens de découverte réalisés", target: "15 entretiens, ≥ 40 % confirmant le problème", deadline: "Semaine 3" },
      { objective: "Mesurer l'intérêt", metric: "Inscrits sur la liste d'attente", target: c.customerType === "b2b" ? "30 inscrits qualifiés" : "150 inscrits", deadline: "Semaine 6" },
      { objective: "Premières ventes", metric: "Clients payants", target: c.customerType === "b2b" ? "3 clients" : "20 clients", deadline: `Mois ${first + 1}` },
      { objective: "Tenir le budget", metric: "Dépenses réelles cumulées", target: `≤ ${profile.budgetEur} €`, deadline: "Mois 6" },
    ],
    kpis: ["Taux d'inscription de la page de lancement", "Taux de conversion inscrit → client", "Coût d'acquisition par client", "Revenu mensuel", "Attrition mensuelle"],
  };
}

export async function charterHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  const decision = ctx.context.outputs["evaluation.select"] as OpportunityDecision | undefined;
  if (!sel || !decision) throw new AppError("INTERNAL", "Décision d'opportunité absente.");
  const c = sel.content as Concept;
  const market = (ctx.context.outputs["evaluation.market"] as MarketOut | undefined)?.analyses.find((a) => a.slug === sel.slug);
  const failure = market?.failureReasons ?? [];
  const charter: Charter = ctx.mode === "llm"
    ? await ctx.llm({ instructions: "Rédige le dossier directeur (Project Charter) du concept sélectionné : problème, client cible, proposition de valeur, produit/service, modèle, positionnement, hypothèses (étiquetées), au moins 3 risques, au moins 3 objectifs mesurables avec échéance, KPI. Reste cohérent avec le budget et le temps disponibles.", schema: CharterSchema, schemaName: "project_charter", maxTokens: 8000 })
    : charterHeuristic(c, ctx.profile, failure);

  const d = db();
  const evidence = await d.select().from(schema.opportunityEvidence).where(eq(schema.opportunityEvidence.opportunityId, sel.id));
  const competitors = await d.select().from(schema.competitorProfiles).where(eq(schema.competitorProfiles.opportunityId, sel.id));
  const usedSourceIds = [...new Set([...evidence.map((e) => e.sourceId), ...competitors.map((x) => x.sourceId)].filter((x): x is string => Boolean(x)))];
  const sources = ctx.context.sources.filter((s) => usedSourceIds.includes(s.id));
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const budget = { entrepreneurialBudgetEur: ctx.profile.budgetEur, plannedSetupEur: c.setupCostEur, plannedMonthlyEur: c.monthlyFixedEur, aiOperationsBudgetEur: ctx.context.budget.projectLimitEur };

  /** OpportunityDossier: the structured contract handed to the Business Execution Engine. */
  const dossier = {
    contractVersion: 1,
    concept: c,
    decision: { rationale: decision.rationale, lowConfidence: decision.lowConfidence, decisiveFactors: decision.decisiveFactors, couldChangeDecision: decision.couldChangeDecision, score: sel.totalScore },
    evidence: evidence.map((e) => ({ kind: e.kind, stance: e.stance, statement: e.statement, isObservation: e.isObservation, sourceId: e.sourceId })),
    assumptions: charter.assumptions,
    constraints: ctx.profile,
    objectives: charter.objectives,
    risks: charter.risks,
  };

  const obs = evidence.filter((e) => e.isObservation);
  const hyp = evidence.filter((e) => !e.isObservation);
  const dossierMd =
    MODE_BANNER(ctx.mode) +
    `# Dossier d'opportunité — ${sel.title}\n\n${decision.lowConfidence ? "> Sélection à FAIBLE CONFIANCE : les preuves sont insuffisantes ; la validation commerciale est prioritaire.\n\n" : ""}## Problème\n\n${charter.problem}\n\n## Client cible\n\n${charter.targetCustomer}\n\n## Proposition de valeur\n\n${charter.valueProposition}\n\n## Preuves\n\n### Observations (sourcées)\n\n${list(obs.map((e) => `${e.statement} (réf. ${e.sourceId?.slice(0, 8)})`))}\n\n### Hypothèses et raisons d'échec possibles\n\n${list(hyp.map((e) => e.statement))}\n\n## Hypothèses\n\n${list(charter.assumptions)}\n\n## Risques\n\n${table(["Risque", "Catégorie", "Probabilité", "Impact", "Mitigation"], charter.risks.map((r) => [r.title, r.category, `${r.likelihood}/5`, `${r.impact}/5`, r.mitigation]))}\n\n## Justification de la sélection\n\n${decision.rationale}\n\n${sourcesSection(sources)}\n`;

  const charterMd =
    MODE_BANNER(ctx.mode) +
    `# Dossier directeur (Project Charter) — ${charter.workingName}\n\n## Problème\n\n${charter.problem}\n\n## Client cible\n\n${charter.targetCustomer}\n\n## Proposition de valeur\n\n${charter.valueProposition}\n\n## Produit ou service\n\n${charter.productOrService}\n\n## Modèle économique\n\n${charter.businessModel}\n\n## Positionnement\n\n${charter.positioning}\n\n## Hypothèses\n\n${list(charter.assumptions)}\n\n## Risques\n\n${list(charter.risks.map((r) => `${r.title} (${r.category}, P${r.likelihood}/I${r.impact}) — ${r.mitigation}`))}\n\n## Objectifs\n\n${table(["Objectif", "Indicateur", "Cible", "Échéance"], charter.objectives.map((o) => [o.objective, o.metric, o.target, o.deadline]))}\n\n## Budget\n\n${table(["Poste", "Montant"], [["Budget entrepreneurial (utilisateur)", eur(budget.entrepreneurialBudgetEur)], ["Coût de lancement estimé", eur(budget.plannedSetupEur)], ["Coûts fixes mensuels estimés", eur(budget.plannedMonthlyEur)], ["Budget d'exploitation IA du projet (distinct)", eur(budget.aiOperationsBudgetEur)]])}\n\n## Indicateurs de réussite\n\n${list(charter.kpis)}\n`;

  const marketMd =
    MODE_BANNER(ctx.mode) +
    `# Étude de marché — ${sel.title}\n\n## Clientèle\n\n${charter.targetCustomer}. Modèle : ${a.label}.\n\n## Taille et signaux de marché\n\n${list(obs.filter((e) => e.kind === "demand" || e.kind === "market_size" || e.kind === "trend").map((e) => `${e.statement} (réf. ${e.sourceId?.slice(0, 8)})`))}\n\nLimite : ces signaux mesurent l'existence de la cible et des discussions, pas une demande solvable. La part de marché atteignable n'est pas mesurée.\n\n## Concurrence\n\n${competitors.length ? table(["Acteur", "Type", "Source"], competitors.map((x) => [x.name, x.kind, x.url ?? "—"])) : "Aucun concurrent n'a pu être identifié dans les sources consultées. Cela ne signifie pas qu'il n'en existe pas : une recherche Web (connecteur à configurer) ou manuelle est nécessaire."}\n\n## Barrières et risques\n\n${list(failure)}\n\n${sourcesSection(sources)}\n`;

  const compMd = `# Analyse concurrentielle — ${sel.title}\n\n## Acteurs identifiés\n\n${competitors.length ? table(["Acteur", "Type", "Description", "Lien"], competitors.map((x) => [x.name, x.kind, x.description ?? "", x.url ?? ""])) : "Aucun acteur identifié dans les sources consultées (couverture limitée des connecteurs actifs)."}\n\n## Alternatives actuelles des clients\n\n- Outils généralistes (tableur, logiciels de gestion existants).\n- Faire soi-même ou ne rien faire (statu quo).\n\n## Différenciation visée\n\n${charter.positioning}\n\n${sourcesSection(sources)}\n`;

  return {
    kind: "charter.build",
    output: { charter, budget, dossierContractVersion: 1 },
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    persist: async (tx) => {
      const last = await tx.query.projectCharters.findFirst({ where: eq(schema.projectCharters.projectId, ctx.projectId), orderBy: desc(schema.projectCharters.version) });
      if (last) await tx.update(schema.projectCharters).set({ status: "superseded" }).where(and(eq(schema.projectCharters.projectId, ctx.projectId), eq(schema.projectCharters.status, "validated")));
      await tx.insert(schema.projectCharters).values({ projectId: ctx.projectId, version: (last?.version ?? 0) + 1, opportunityId: sel.id, content: { ...charter, budget, dossier }, status: "validated" });
      const lastBm = await tx.query.businessModels.findFirst({ where: eq(schema.businessModels.projectId, ctx.projectId), orderBy: desc(schema.businessModels.version) });
      await tx.insert(schema.businessModels).values({ projectId: ctx.projectId, version: (lastBm?.version ?? 0) + 1, content: { archetype: a.id, label: a.label, revenueModel: a.revenueModel, price: c.priceHypothesis, customerType: c.customerType } });
      await tx.delete(schema.projectRisks).where(eq(schema.projectRisks.projectId, ctx.projectId));
      await tx.insert(schema.projectRisks).values(charter.risks.map((r) => ({ projectId: ctx.projectId, title: r.title, category: r.category, likelihood: r.likelihood, impact: r.impact, mitigation: r.mitigation, taskId: ctx.taskId })));
      await tx
        .insert(schema.projectBudgetSnapshot)
        .values({ projectId: ctx.projectId, plannedSetupEur: c.setupCostEur, plannedMonthlyEur: c.monthlyFixedEur })
        .onConflictDoUpdate({ target: schema.projectBudgetSnapshot.projectId, set: { plannedSetupEur: c.setupCostEur, plannedMonthlyEur: c.monthlyFixedEur, updatedAt: new Date() } });
    },
    artifacts: [
      { key: "opportunity-dossier", title: "Dossier d'opportunité", kind: "document", category: "strategy", format: "markdown", content: dossierMd, requiredSections: ["Problème", "Client cible", "Proposition de valeur", "Preuves", "Hypothèses", "Risques"], sourceIds: sources.map((s) => s.id) },
      { key: "project-charter", title: "Dossier directeur (Project Charter)", kind: "document", category: "strategy", format: "markdown", content: charterMd, requiredSections: ["Problème", "Client cible", "Proposition de valeur", "Produit ou service", "Modèle économique", "Positionnement", "Hypothèses", "Risques", "Objectifs", "Budget", "Indicateurs de réussite"], dependsOn: ["opportunity-dossier"] },
      { key: "market-study", title: "Étude de marché sourcée", kind: "document", category: "research", format: "markdown", content: marketMd, requiredSections: ["Clientèle", "Taille et signaux de marché", "Concurrence"], sourceIds: sources.map((s) => s.id) },
      { key: "competitive-analysis", title: "Analyse concurrentielle", kind: "document", category: "research", format: "markdown", content: compMd, requiredSections: ["Acteurs identifiés", "Différenciation visée"], sourceIds: sources.map((s) => s.id) },
    ],
    evaluation: { passed: true, findings: [`Charter v. ${charter.workingName} ; ${obs.length} observations, ${hyp.length} hypothèses.`] },
  };
}
