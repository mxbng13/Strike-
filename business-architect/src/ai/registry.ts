import { AnthropicProvider } from "./anthropic";
import type { LlmProvider } from "./types";
import { AppError } from "@/lib/errors";

let override: LlmProvider | null = null;

/** Test seam: inject a scripted provider. */
export function setLlmProviderOverride(p: LlmProvider | null): void {
  override = p;
}

export function llmProvider(): LlmProvider {
  return override ?? new AnthropicProvider();
}

export type GenerationMode = "llm" | "heuristic";

/** Resolves the workspace AI mode to the mode actually used for generative agents. */
export function resolveMode(workspaceMode: "auto" | "llm" | "heuristic"): GenerationMode {
  const available = llmProvider().available();
  if (workspaceMode === "heuristic") return "heuristic";
  if (workspaceMode === "llm") {
    if (!available) throw new AppError("DEPENDENCY_MISSING", "Mode LLM exigé mais ANTHROPIC_API_KEY n'est pas configurée.");
    return "llm";
  }
  return available ? "llm" : "heuristic";
}
