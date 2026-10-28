import { z } from "zod";

/**
 * Server-side configuration. Validated once; secrets never leave this module
 * except through the explicit accessors below.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgresql://ba:ba@localhost:5432/business_architect"),
  APP_URL: z.string().url().default("http://localhost:3100"),
  APP_ENCRYPTION_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  DEFAULT_WORKSPACE_MONTHLY_AI_BUDGET_EUR: z.coerce.number().positive().default(20),
  DEFAULT_PROJECT_AI_BUDGET_EUR: z.coerce.number().positive().default(5),
  SANDBOX_DIR: z.string().default("./sandbox-runs"),
  RESEARCH_USER_AGENT: z
    .string()
    .default("BusinessArchitectAI/0.1 (+https://github.com/mxbng13/strike-; research bot)"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const raw = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Never print values: only the failing keys.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuration invalide pour : ${keys}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget cached config after mutating process.env. */
export function resetEnvCache(): void {
  cached = null;
}
