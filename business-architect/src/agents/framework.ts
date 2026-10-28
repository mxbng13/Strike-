import type { z } from "zod";
import type { Tx } from "@/db/client";
import type { UserProfile } from "@/intake/profile";
import type { ResearchOutcome } from "@/research/service";
import type { ResearchQuery } from "@/research/types";
import type { ArtifactDraft } from "@/artifacts/service";
import type { AgentId } from "./registry";
import type { AssembledContext } from "@/orchestration/context";

export type Mode = "llm" | "heuristic";

export type ActionDraft = {
  actionType: string;
  title: string;
  objective: string;
  estimatedCostEur: number;
  consequences: string;
  payload?: Record<string, unknown>;
  dedupeKey: string;
};

export type AgentContext = {
  projectId: string;
  workspaceId: string;
  taskId: string;
  taskKey: string;
  agentRunId: string;
  runId: string;
  iteration: number;
  input: Record<string, unknown>;
  profile: UserProfile;
  mode: Mode;
  context: AssembledContext;
  research(providerId: string, q: ResearchQuery): Promise<ResearchOutcome>;
  /** Structured LLM generation with the assembled context; FinOps-guarded and logged. */
  llm<T>(req: { instructions: string; schema: z.ZodType<T>; schemaName: string; extra?: string; maxTokens?: number }): Promise<T>;
  note(message: string, data?: Record<string, unknown>): Promise<void>;
};

export type AgentResult = {
  kind: string;
  output: unknown;
  mode: "llm" | "heuristic" | "deterministic";
  /** Domain writes, executed in the SAME transaction that marks the task succeeded. */
  persist?: (tx: Tx) => Promise<void>;
  artifacts?: ArtifactDraft[];
  actions?: ActionDraft[];
  evaluation?: { passed: boolean; findings: string[]; score?: number };
  control?: {
    /** Restart discovery with a new iteration (weak opportunities). */
    replan?: { reason: string };
    /** Stop the run: human input required. */
    block?: { reason: string };
    /** Re-run these task keys once (QA requested corrections). */
    redo?: string[];
  };
};

export type AgentHandler = (ctx: AgentContext) => Promise<AgentResult>;

export type TaskKindDef = {
  kind: string;
  agentId: AgentId;
  phase: string;
  label: string;
  handler: AgentHandler;
};
