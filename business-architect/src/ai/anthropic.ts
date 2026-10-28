import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { env } from "@/config/env";
import { AppError } from "@/lib/errors";
import { llmCostEur } from "./pricing";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types";

/**
 * Primary LLM provider (Anthropic Messages API).
 * - Structured outputs: `output_config.format` built from the Zod contract, then
 *   re-validated with Zod (a successful API call is not proof of a valid output).
 * - Server-side refusal fallbacks enabled (`fallbacks: "default"`), so a
 *   safety decline on the primary model is retried on a routed fallback model.
 * - SDK retries (429/5xx/connection) + explicit timeout.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  readonly model: string;
  private client: Anthropic | null = null;

  constructor(model = env().AI_MODEL) {
    this.model = model;
  }

  available(): boolean {
    return Boolean(env().ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.available()) throw new AppError("DEPENDENCY_MISSING", "ANTHROPIC_API_KEY non configurée.");
    this.client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 5 * 60_000 });
    return this.client;
  }

  estimateCostEur(req: Pick<LlmRequest<unknown>, "system" | "prompt" | "maxTokens">): number {
    // ~4 chars/token for input; assume half of max output is used (thinking included).
    const inTok = Math.ceil((req.system.length + req.prompt.length) / 3.5);
    const outTok = Math.ceil((req.maxTokens ?? 16_000) / 2);
    return llmCostEur(this.model, inTok, outTok).eur;
  }

  async generate<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    const client = this.getClient();
    let lastIssue = "";
    let usage = { inputTokens: 0, outputTokens: 0 };
    // One repair attempt if the model's output fails our own validation.
    for (let attempt = 1; attempt <= 2; attempt++) {
      let res;
      try {
        res = await client.beta.messages.parse({
          model: this.model,
          max_tokens: req.maxTokens ?? 16_000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: req.effort ?? env().AI_EFFORT, format: betaZodOutputFormat(req.schema) },
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [
            {
              role: "user",
              content: attempt === 1 ? req.prompt : `${req.prompt}\n\nTa réponse précédente était invalide (${lastIssue}). Respecte strictement le schéma.`,
            },
          ],
        });
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new AppError("DEPENDENCY_MISSING", "Clé Anthropic invalide.", { cause: e });
        if (e instanceof Anthropic.RateLimitError) throw new AppError("RATE_LIMITED", "Limite de débit du fournisseur IA atteinte.", { cause: e, retryable: true });
        if (e instanceof Anthropic.BadRequestError) throw new AppError("PROVIDER_ERROR", `Requête IA refusée : ${e.message}`, { cause: e, retryable: false });
        if (e instanceof Anthropic.APIError) throw new AppError("PROVIDER_ERROR", `Erreur du fournisseur IA (${e.status ?? "réseau"}).`, { cause: e, retryable: true });
        throw new AppError("PROVIDER_ERROR", "Fournisseur IA injoignable.", { cause: e, retryable: true });
      }
      usage = {
        inputTokens: usage.inputTokens + (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.outputTokens + (res.usage.output_tokens ?? 0),
      };
      if (res.stop_reason === "refusal") {
        throw new AppError("PROVIDER_ERROR", "Le modèle a refusé la requête.", { retryable: false, details: { category: res.stop_details?.category ?? null } });
      }
      if (res.stop_reason === "max_tokens") {
        lastIssue = "sortie tronquée (max_tokens)";
        continue;
      }
      const checked = req.schema.safeParse(res.parsed_output);
      if (checked.success) {
        const servedByFallback = res.model !== this.model;
        return { data: checked.data, usage, model: res.model, servedByFallback };
      }
      lastIssue = checked.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    }
    throw new AppError("PROVIDER_ERROR", `Sortie IA invalide après réparation : ${lastIssue}`, { retryable: true, details: { usage } });
  }
}
