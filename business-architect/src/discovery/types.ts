import { z } from "zod";

/** Observed market signals attached to a concept (all values come from research claims). */
export const SignalsSchema = z.object({
  registryDensityDept: z.number().nullable().default(null),
  registryDept: z.string().nullable().default(null),
  registryNational: z.number().nullable().default(null),
  registryNationalIsLowerBound: z.boolean().default(false),
  population: z.number().nullable().default(null),
  discussions: z.number().nullable().default(null),
  discussionEngagement: z.number().nullable().default(null),
  datasets: z.number().nullable().default(null),
  webResults: z.number().nullable().default(null),
  competitorsFound: z.number().nullable().default(null),
});
export type Signals = z.infer<typeof SignalsSchema>;

export const ConceptSchema = z.object({
  slug: z.string().min(3).max(80),
  title: z.string().min(5).max(160),
  summary: z.string().min(10).max(800),
  sector: z.string().min(2).max(80),
  segmentId: z.string().nullable(),
  segmentLabel: z.string().min(2).max(120),
  customerType: z.enum(["b2b", "b2c"]),
  archetypeId: z.string(),
  businessModel: z.string().min(2).max(120),
  targetCustomer: z.string().min(3).max(300),
  problem: z.string().min(10).max(600),
  solution: z.string().min(10).max(900),
  valueProposition: z.string().min(10).max(400),
  priceHypothesis: z.object({ amountEur: z.number().positive(), unit: z.string() }),
  setupCostEur: z.number().min(0),
  monthlyFixedEur: z.number().min(0),
  minWeeklyHours: z.number().min(1),
  digital: z.boolean(),
  physical: z.boolean(),
  requiresDirectContact: z.boolean(),
  /** Unverified assumptions this concept relies on. */
  assumptions: z.array(z.string()).min(1),
  /** ids of research signals (research_sources) this concept is grounded on. */
  groundingSourceIds: z.array(z.string()),
  origin: z.enum(["ai", "user"]),
  hnQuery: z.string().optional(),
  frQuery: z.string().optional(),
  naf: z.string().nullable().optional(),
});
export type Concept = z.infer<typeof ConceptSchema>;

export type CriterionKey =
  | "demand"
  | "evidenceQuality"
  | "competition"
  | "differentiation"
  | "initialCost"
  | "recurringCost"
  | "timeToFirstSale"
  | "techDifficulty"
  | "salesDifficulty"
  | "margin"
  | "resourceFit"
  | "regulatoryRisk"
  | "testability"
  | "growthPotential"
  | "platformDependency";

export type CriterionScore = { key: CriterionKey; label: string; score: number; weight: number; explanation: string; basedOn: "observed" | "assumption" | "mixed" };

export type ScoreCard = {
  total: number;
  criteria: CriterionScore[];
  hardConstraintViolations: string[];
  uncertainties: string[];
};
