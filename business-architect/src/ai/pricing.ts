/**
 * Reference prices used to ESTIMATE costs. Sources: Anthropic public pricing
 * (cached 2026-10) for models; research providers are estimates that must be
 * checked against each provider's current plan (marked as such in the UI).
 */
export const USD_TO_EUR = Number(process.env.USD_TO_EUR ?? 0.92);

export type ModelPrice = { inputPerMTokUsd: number; outputPerMTokUsd: number };

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { inputPerMTokUsd: 4, outputPerMTokUsd: 20 },
  "claude-sonnet-5-5": { inputPerMTokUsd: 2, outputPerMTokUsd: 10 },
  "claude-haiku-5-5": { inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.5 },
  "claude-fable-5-1": { inputPerMTokUsd: 10, outputPerMTokUsd: 50 },
};

export const RESEARCH_PRICES_USD: Record<string, { perRequestUsd: number; note: string }> = {
  "recherche-entreprises": { perRequestUsd: 0, note: "API publique gratuite (api.gouv.fr)" },
  "data-gouv": { perRequestUsd: 0, note: "API publique gratuite (data.gouv.fr)" },
  eurostat: { perRequestUsd: 0, note: "API publique gratuite (Eurostat)" },
  "hn-algolia": { perRequestUsd: 0, note: "API publique gratuite (HN Search by Algolia)" },
  brave: { perRequestUsd: 0.005, note: "Estimation — vérifier l'offre Brave Search API souscrite" },
  tavily: { perRequestUsd: 0.008, note: "Estimation — vérifier l'offre Tavily souscrite" },
  exa: { perRequestUsd: 0.005, note: "Estimation — vérifier l'offre Exa souscrite" },
};

export function llmCostEur(model: string, inputTokens: number, outputTokens: number): { eur: number; known: boolean } {
  const p = MODEL_PRICES[model];
  if (!p) {
    // Unknown model: price as the most expensive tier so budgets stay conservative.
    const worst = MODEL_PRICES["claude-fable-5-1"]!;
    return { eur: ((inputTokens * worst.inputPerMTokUsd + outputTokens * worst.outputPerMTokUsd) / 1e6) * USD_TO_EUR, known: false };
  }
  return { eur: ((inputTokens * p.inputPerMTokUsd + outputTokens * p.outputPerMTokUsd) / 1e6) * USD_TO_EUR, known: true };
}

export function researchCostEur(provider: string): number {
  return (RESEARCH_PRICES_USD[provider]?.perRequestUsd ?? 0) * USD_TO_EUR;
}
