export type SourceType = "web" | "official_registry" | "public_dataset" | "statistics" | "forum" | "news" | "documentation";

export type ResearchQuery = {
  query: string;
  purpose: string;
  limit?: number;
  countryCode?: string;
  /** Provider-specific structured filters (e.g. NAF activity code for the company registry). */
  filters?: Record<string, string>;
  /** Language hint for providers with English-centric corpora. */
  lang?: "fr" | "en";
};

export type ResearchItem = {
  url: string;
  title: string;
  snippet: string;
  sourceType: SourceType;
  publishedAt?: Date | null;
  metadata?: Record<string, unknown>;
};

/** A factual statement derived mechanically from the provider response (never generated). */
export type DerivedClaim = { claim: string; numericValue?: number; unit?: string; url: string };

export type ResearchResult = {
  items: ResearchItem[];
  totalAvailable?: number;
  /** true when totalAvailable is a provider cap, i.e. a lower bound. */
  totalIsLowerBound?: boolean;
  claims?: DerivedClaim[];
};

export type ProviderCapability = "web" | "companies" | "datasets" | "statistics" | "discussions";

export interface ResearchProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: readonly ProviderCapability[];
  /** Markets the provider is meaningful for (undefined = all). */
  readonly countries?: readonly string[];
  availability(): { ok: true } | { ok: false; reason: string };
  search(q: ResearchQuery, signal: AbortSignal): Promise<ResearchResult>;
}

export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}
