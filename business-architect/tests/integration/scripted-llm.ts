import type { LlmProvider, LlmRequest, LlmResponse } from "@/ai/types";

/** Test double for the LLM layer: returns scripted data per schema name and counts calls. */
export class ScriptedLlm implements LlmProvider {
  readonly id = "scripted";
  readonly model = "claude-opus-5-5";
  calls: string[] = [];
  constructor(
    private readonly script: Record<string, (req: LlmRequest<unknown>) => unknown>,
    private readonly estimate = 0.05,
  ) {}
  available() {
    return true;
  }
  estimateCostEur() {
    return this.estimate;
  }
  async generate<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    this.calls.push(req.schemaName);
    const fn = this.script[req.schemaName];
    if (!fn) throw new Error(`no script for ${req.schemaName}`);
    return { data: req.schema.parse(fn(req as LlmRequest<unknown>)), usage: { inputTokens: 1000, outputTokens: 500 }, model: this.model, servedByFallback: false };
  }
}
