import type { UserProfile } from "@/intake/profile";
import { ARCHETYPES, type ArchetypeId } from "./archetypes";
import type { Concept, CriterionKey, CriterionScore, ScoreCard, Signals } from "./types";

/**
 * Explainable comparison grid. Scores are 0–10 per criterion (10 = favourable),
 * weighted by the user's goals. The total (0–100) is a COMPARISON TOOL, not a
 * truth: every score carries its basis (observed vs assumption) and the card
 * lists the uncertainties that could change the decision.
 */
export const SELECTION_MIN_SCORE = 55;

const LABELS: Record<CriterionKey, string> = {
  demand: "Demande potentielle",
  evidenceQuality: "Qualité des preuves",
  competition: "Intensité concurrentielle (inversée)",
  differentiation: "Capacité de différenciation",
  initialCost: "Coût initial",
  recurringCost: "Coûts récurrents",
  timeToFirstSale: "Délai avant premières ventes",
  techDifficulty: "Difficulté technique (inversée)",
  salesDifficulty: "Difficulté commerciale (inversée)",
  margin: "Marge potentielle",
  resourceFit: "Adéquation avec tes ressources",
  regulatoryRisk: "Risque réglementaire (inversé)",
  testability: "Facilité de test",
  growthPotential: "Potentiel de croissance",
  platformDependency: "Dépendance aux plateformes (inversée)",
};

export function weightsFor(profile: UserProfile): Record<CriterionKey, number> {
  const w: Record<CriterionKey, number> = {
    demand: 2,
    evidenceQuality: 1.5,
    competition: 1.2,
    differentiation: 1,
    initialCost: 1,
    recurringCost: 1,
    timeToFirstSale: 1,
    techDifficulty: 1,
    salesDifficulty: 1,
    margin: 1.2,
    resourceFit: 1.5,
    regulatoryRisk: 1,
    testability: 1,
    growthPotential: 1,
    platformDependency: 0.8,
  };
  if (profile.horizon === "quick_revenue") Object.assign(w, { timeToFirstSale: 3, testability: 2, initialCost: 1.8, growthPotential: 0.5, salesDifficulty: 1.5 });
  if (profile.horizon === "durable") Object.assign(w, { margin: 2, recurringCost: 1.5, platformDependency: 1.3, competition: 1.5 });
  if (profile.horizon === "high_growth") Object.assign(w, { growthPotential: 3, differentiation: 2, demand: 2.5, initialCost: 0.6, timeToFirstSale: 0.6 });
  if (profile.riskTolerance === "low") w.regulatoryRisk += 0.5;
  if (profile.budgetEur < 1500) w.initialCost += 0.7;
  return w;
}

const clamp = (x: number) => Math.max(0, Math.min(10, Math.round(x * 10) / 10));
const hasSkill = (p: UserProfile, re: RegExp) => p.skills.some((s) => re.test(s.toLowerCase()));
const REGULATED = /(santé|médical|kiné|vétérinaire|finance|banque|assurance|enfant|crèche|aide à domicile|immobilier|alimentation)/i;

export function scoreConcept(c: Concept, s: Signals, evidenceQuality: number, profile: UserProfile): ScoreCard {
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const w = weightsFor(profile);
  const criteria: CriterionScore[] = [];
  const uncertainties: string[] = [];
  const add = (key: CriterionKey, score: number, explanation: string, basedOn: CriterionScore["basedOn"]) =>
    criteria.push({ key, label: LABELS[key], score: clamp(score), weight: w[key], explanation, basedOn });

  // Demand (observed signals only; absence = low score + uncertainty, never invented).
  let demand = 2;
  const parts: string[] = [];
  if (c.customerType === "b2b" && s.registryDensityDept != null) {
    demand += Math.min(4, Math.log10(Math.max(1, s.registryDensityDept)) * 1.3);
    parts.push(`${s.registryDensityDept} entreprises cibles actives dans le département ${s.registryDept}`);
  }
  if (c.customerType === "b2c" && s.population != null) {
    demand += 2.5;
    parts.push(`marché de ${Math.round(s.population / 1e6)} M d'habitants (part ciblée non mesurée)`);
  }
  if (s.discussions != null && s.discussions > 0) {
    demand += Math.min(2.5, Math.log10(1 + s.discussions) * 0.9 + Math.log10(1 + (s.discussionEngagement ?? 0)) * 0.4);
    parts.push(`${s.discussions} discussions en ligne sur ce problème`);
  }
  if (s.webResults != null && s.webResults > 0) demand += 0.5;
  if (parts.length === 0) uncertainties.push("Aucun signal de demande observé : la demande reste une hypothèse.");
  add("demand", demand, parts.length ? `Signaux observés : ${parts.join(" ; ")}.` : "Aucun signal observé.", parts.length ? "observed" : "assumption");

  add("evidenceQuality", evidenceQuality, `Indice de qualité des preuves : ${evidenceQuality.toFixed(1)}/10.`, "observed");
  if (evidenceQuality < 4) uncertainties.push("Preuves faibles : le classement peut changer avec davantage de recherche.");

  if (s.competitorsFound == null) {
    add("competition", 5, "Concurrence non mesurée (aucun moteur de recherche Web configuré ou résultats insuffisants).", "assumption");
    uncertainties.push("Intensité concurrentielle inconnue.");
  } else {
    add("competition", 9 - Math.min(7, s.competitorsFound * 0.9), `${s.competitorsFound} concurrent(s) ou alternative(s) identifié(s) dans les sources consultées.`, "observed");
  }

  const niche = c.customerType === "b2b" && c.segmentId ? 2 : 0;
  add("differentiation", 4 + niche + (a.digital ? 1 : 0) + (a.growthPotential >= 4 ? 1 : 0), niche ? "Positionnement vertical sur une niche précise." : "Positionnement générique : différenciation à construire.", "assumption");

  const budget = Math.max(1, profile.budgetEur);
  add("initialCost", 10 - (c.setupCostEur / budget) * 8, `Coût de lancement estimé ${c.setupCostEur} € pour un budget de ${profile.budgetEur} €.`, "assumption");
  add("recurringCost", 10 - (c.monthlyFixedEur * 12 / budget) * 5, `Coûts fixes estimés ${c.monthlyFixedEur} €/mois.`, "assumption");

  const horizonMonths = profile.horizon === "quick_revenue" ? 2 : profile.horizon === "durable" ? 4 : 6;
  add("timeToFirstSale", 10 - Math.max(0, a.monthsToFirstSale - 1) * (10 / (horizonMonths + 3)), `Premières ventes estimées après ~${a.monthsToFirstSale} mois.`, "assumption");

  const dev = hasSkill(profile, /d[ée]v|code|program|informati|tech/);
  add("techDifficulty", 10 - a.techDifficulty * 2 + (dev ? 2 : 0), `Difficulté technique ${a.techDifficulty}/5${dev ? ", compensée par tes compétences en développement" : ""}.`, "assumption");

  const sales = hasSkill(profile, /vente|commercial|sales|n[ée]goc/);
  let salesScore = 10 - a.salesDifficulty * 2 + (sales ? 2 : 0);
  if (a.requiresDirectContact && !profile.allowDirectCustomerContact) salesScore -= 4;
  add("salesDifficulty", salesScore, `Difficulté commerciale ${a.salesDifficulty}/5${sales ? ", compensée par tes compétences commerciales" : ""}.`, "assumption");

  add("margin", (1 - a.variableCostRate) * 10, `Coûts variables estimés à ${Math.round(a.variableCostRate * 100)} % du chiffre d'affaires.`, "assumption");

  const hoursRatio = profile.weeklyHours / c.minWeeklyHours;
  add("resourceFit", Math.min(10, hoursRatio * 6) + (c.setupCostEur <= profile.budgetEur * 0.5 ? 2 : 0), `${profile.weeklyHours} h/semaine disponibles pour ~${c.minWeeklyHours} h nécessaires.`, "assumption");

  const regulated = REGULATED.test(`${c.sector} ${c.segmentLabel}`);
  add("regulatoryRisk", regulated ? 5 : 8, regulated ? "Secteur réglementé : obligations spécifiques à vérifier." : "Pas de réglementation sectorielle lourde identifiée (à confirmer).", "assumption");
  if (regulated) uncertainties.push("Obligations réglementaires sectorielles à vérifier auprès de sources officielles.");

  add("testability", a.testability * 2, `Testabilité ${a.testability}/5 (page de pré-vente, entretiens, précommandes).`, "assumption");
  add("growthPotential", a.growthPotential * 2, `Potentiel de croissance ${a.growthPotential}/5 pour ce modèle.`, "assumption");
  add("platformDependency", 10 - a.platformDependency * 2, `Dépendance aux plateformes ${a.platformDependency}/5.`, "assumption");

  const totalW = criteria.reduce((x, k) => x + k.weight, 0);
  const total = Math.round((criteria.reduce((x, k) => x + k.score * k.weight, 0) / totalW) * 10 * 10) / 10;

  const violations: string[] = [];
  if (c.setupCostEur > profile.budgetEur && profile.budgetEur >= 0) violations.push(`Coût de lancement (${c.setupCostEur} €) supérieur au budget (${profile.budgetEur} €).`);
  if (profile.weeklyHours < c.minWeeklyHours * 0.8) violations.push(`Temps nécessaire (${c.minWeeklyHours} h/sem.) incompatible avec ${profile.weeklyHours} h/sem.`);
  if (c.physical && !profile.allowPhysicalProducts) violations.push("Produit physique exclu par tes contraintes.");
  if (c.requiresDirectContact && !profile.allowDirectCustomerContact) violations.push("Démarchage direct exclu par tes contraintes.");
  if (profile.customerPreference !== "any" && c.customerType !== profile.customerPreference) violations.push(`Clientèle ${c.customerType.toUpperCase()} hors de ta préférence ${profile.customerPreference.toUpperCase()}.`);
  for (const ex of profile.exclusions) {
    const word = ex.toLowerCase().replace(/^(pas de|aucun|sans)\s+/, "").trim();
    if (word.length > 3 && !/uniquement|stock|physique|d[ée]marchage|contact/.test(word) && `${c.title} ${c.summary}`.toLowerCase().includes(word)) violations.push(`Contient un élément exclu : « ${ex} ».`);
  }
  return { total, criteria, hardConstraintViolations: violations, uncertainties };
}

/** Compares the winner with the runner-up: what drives the gap and what could flip it. */
export function explainRanking(top: { title: string; card: ScoreCard }, runnerUp?: { title: string; card: ScoreCard }) {
  if (!runnerUp) return { gap: null as number | null, decisiveFactors: [] as string[], couldChangeDecision: top.card.uncertainties };
  const gap = Math.round((top.card.total - runnerUp.card.total) * 10) / 10;
  const diffs = top.card.criteria
    .map((c) => {
      const o = runnerUp.card.criteria.find((x) => x.key === c.key)!;
      return { label: c.label, delta: (c.score - o.score) * c.weight, basedOn: c.basedOn };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const decisiveFactors = diffs
    .filter((d) => d.delta > 0)
    .slice(0, 3)
    .map((d) => `${d.label} (${d.basedOn === "observed" ? "donnée observée" : "hypothèse"})`);
  const couldChangeDecision = [
    ...diffs.filter((d) => d.delta < 0).slice(0, 2).map((d) => `« ${runnerUp.title} » est meilleur sur : ${d.label}.`),
    ...(gap < 5 ? [`Écart faible (${gap} pts) : une preuve de demande supplémentaire pourrait inverser le classement.`] : []),
    ...top.card.uncertainties,
  ];
  return { gap, decisiveFactors, couldChangeDecision };
}

export function evidenceQualityScore(e: { sourceCount: number; officialSourceCount: number; distinctProviders: number; observationCount: number; webSourceCount: number }) {
  let q = 0;
  if (e.officialSourceCount > 0) q += 3;
  q += Math.min(3, e.distinctProviders * 1.2);
  q += Math.min(2, e.observationCount * 0.5);
  if (e.webSourceCount > 0) q += 2;
  q = Math.min(10, Math.round(q * 10) / 10);
  const quality = q >= 7 ? "strong" : q >= 4.5 ? "moderate" : q > 0 ? "weak" : "none";
  return { score: q, quality: quality as "strong" | "moderate" | "weak" | "none" };
}
