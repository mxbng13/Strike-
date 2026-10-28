import type { z } from "zod";

export type LlmRequest<T> = {
  /** Trusted operator instructions (rules, role, output contract). */
  system: string;
  /** User-turn content: assembled context; untrusted material is wrapped in <untrusted_source>. */
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResponse<T> = { data: T; usage: LlmUsage; model: string; servedByFallback: boolean };

export interface LlmProvider {
  readonly id: string;
  readonly model: string;
  available(): boolean;
  generate<T>(req: LlmRequest<T>): Promise<LlmResponse<T>>;
  /** Rough pre-flight estimate (EUR) used by the FinOps guard. */
  estimateCostEur(req: Pick<LlmRequest<unknown>, "system" | "prompt" | "maxTokens">): number;
}
