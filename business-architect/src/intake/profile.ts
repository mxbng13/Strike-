import { z } from "zod";

/** Structured output of Phase 1 (Intake). Consumed by the Opportunity Engine. */
export const UserProfileSchema = z.object({
  mode: z.enum(["autonomous", "sector", "existing_idea"]),
  country: z.string().min(2),
  countryCode: z.string().length(2),
  budgetEur: z.number().min(0).max(10_000_000),
  weeklyHours: z.number().int().min(1).max(80),
  horizon: z.enum(["quick_revenue", "durable", "high_growth"]),
  sector: z.string().nullable(),
  existingIdea: z.string().nullable(),
  skills: z.array(z.string()),
  exclusions: z.array(z.string()),
  customerPreference: z.enum(["b2b", "b2c", "any"]),
  allowPhysicalProducts: z.boolean(),
  allowDirectCustomerContact: z.boolean(),
  riskTolerance: z.enum(["low", "medium", "high"]),
  defaultsUsed: z.array(z.string()),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const HORIZON_LABEL: Record<UserProfile["horizon"], string> = {
  quick_revenue: "Revenus rapides",
  durable: "Entreprise durable",
  high_growth: "Forte croissance",
};
export const MODE_LABEL: Record<UserProfile["mode"], string> = {
  autonomous: "Création autonome (aucune idée fournie)",
  sector: "Secteur imposé, concept inventé par l'IA",
  existing_idea: "Idée existante à évaluer et challenger",
};
