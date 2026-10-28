import { createHash } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { logger } from "@/lib/logger";
import { getProvider } from "./providers";
import { ProviderHttpError, type ResearchQuery } from "./types";
import { sanitizeUntrusted, safeUrl } from "./sanitize";
import { assertBudget, recordUsage } from "@/finops/guard";
import { researchCostEur } from "@/ai/pricing";
import { isAppError } from "@/lib/errors";

export type ResearchContext = { workspaceId: string; projectId: string; taskId?: string | null };

export type StoredSource = {
  id: string;
  url: string;
  title: string;
  snippet: string | null;
  provider: string;
  sourceType: string;
  injectionFlag: boolean;
};

export type ResearchOutcome =
  | { ok: true; jobId: string; provider: string; sources: StoredSource[]; totalAvailable?: number; totalIsLowerBound?: boolean; claims: Array<{ claim: string; numericValue?: number; sourceId: string }> }
  | { ok: false; jobId: string | null; provider: string; error: string; reason: "unavailable" | "budget" | "provider_error" };

const TIMEOUT_MS = 15_000;

/**
 * Runs ONE real query against ONE provider and persists everything that came
 * back (sources, snapshots, mechanically-derived claims). Never throws for
 * provider failures: the outcome says what happened so engines can report it.
 */
export async function runResearch(ctx: ResearchContext, providerId: string, q: ResearchQuery): Promise<ResearchOutcome> {
  const provider = getProvider(providerId);
  if (!provider) return { ok: false, jobId: null, provider: providerId, error: "Fournisseur inconnu", reason: "unavailable" };
  const avail = provider.availability();
  const d = db();
  if (!avail.ok) {
    const [job] = await d
      .insert(schema.researchJobs)
      .values({ projectId: ctx.projectId, taskId: ctx.taskId ?? null, provider: providerId, query: q.query, purpose: q.purpose, status: "skipped", error: avail.reason, finishedAt: new Date() })
      .returning({ id: schema.researchJobs.id });
    return { ok: false, jobId: job!.id, provider: providerId, error: avail.reason, reason: "unavailable" };
  }

  const cost = researchCostEur(providerId);
  try {
    await assertBudget(ctx, cost);
  } catch (e) {
    if (isAppError(e) && e.code === "BUDGET_EXCEEDED") {
      return { ok: false, jobId: null, provider: providerId, error: e.message, reason: "budget" };
    }
    throw e;
  }

  const [job] = await d
    .insert(schema.researchJobs)
    .values({ projectId: ctx.projectId, taskId: ctx.taskId ?? null, provider: providerId, query: q.query || JSON.stringify(q.filters ?? {}), purpose: q.purpose, status: "running" })
    .returning({ id: schema.researchJobs.id });
  const jobId = job!.id;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await provider.search(q, ac.signal);
      clearTimeout(timer);
      const retrievedAt = new Date();
      return await d.transaction(async (tx) => {
        const sources: StoredSource[] = [];
        for (const item of res.items) {
          const url = safeUrl(item.url);
          if (!url) continue;
          const s = sanitizeUntrusted(item.snippet, 600);
          const t = sanitizeUntrusted(item.title, 200);
          const injectionFlag = s.injectionFlag || t.injectionFlag;
          const [row] = await tx
            .insert(schema.researchSources)
            .values({
              projectId: ctx.projectId,
              researchJobId: jobId,
              provider: providerId,
              url,
              title: t.text || url,
              sourceType: item.sourceType,
              publishedAt: item.publishedAt ?? null,
              retrievedAt,
              snippet: s.text,
              injectionFlag,
              metadata: item.metadata ?? null,
            })
            .onConflictDoUpdate({
              target: [schema.researchSources.projectId, schema.researchSources.url],
              set: { retrievedAt, snippet: s.text, injectionFlag },
            })
            .returning();
          await tx.insert(schema.sourceSnapshots).values({
            sourceId: row!.id,
            contentHash: createHash("sha256").update(s.text).digest("hex"),
            excerpt: s.text,
            retrievedAt,
          });
          if (injectionFlag) logger.warn("possible prompt injection neutralised", { provider: providerId, url, matches: [...s.matches, ...t.matches] });
          sources.push({ id: row!.id, url, title: row!.title, snippet: row!.snippet, provider: providerId, sourceType: row!.sourceType, injectionFlag });
        }
        // Claims are attached to a source row representing the API query itself.
        const claims: Array<{ claim: string; numericValue?: number; sourceId: string }> = [];
        for (const c of res.claims ?? []) {
          const url = safeUrl(c.url);
          if (!url) continue;
          const [src] = await tx
            .insert(schema.researchSources)
            .values({
              projectId: ctx.projectId,
              researchJobId: jobId,
              provider: providerId,
              url,
              title: `${provider.label} — requête`,
              sourceType: provider.capabilities.includes("companies") ? "official_registry" : provider.capabilities.includes("statistics") ? "statistics" : provider.capabilities.includes("datasets") ? "public_dataset" : provider.capabilities.includes("discussions") ? "forum" : "web",
              retrievedAt,
              snippet: c.claim,
              metadata: { query: q.query, filters: q.filters ?? null, apiQuery: true },
            })
            .onConflictDoUpdate({ target: [schema.researchSources.projectId, schema.researchSources.url], set: { retrievedAt, snippet: c.claim } })
            .returning({ id: schema.researchSources.id });
          await tx.insert(schema.sourceClaims).values({ sourceId: src!.id, projectId: ctx.projectId, claim: c.claim, numericValue: c.numericValue ?? null, unit: c.unit ?? null });
          claims.push({ claim: c.claim, numericValue: c.numericValue, sourceId: src!.id });
        }
        await tx
          .update(schema.researchJobs)
          .set({ status: "succeeded", resultCount: sources.length, totalAvailable: res.totalAvailable ?? null, costEur: cost, finishedAt: new Date() })
          .where(eq(schema.researchJobs.id, jobId));
        if (cost > 0) await recordUsage({ ...ctx, provider: providerId, operation: "research.search", costEur: cost, estimated: true }, tx);
        return { ok: true as const, jobId, provider: providerId, sources, totalAvailable: res.totalAvailable, totalIsLowerBound: res.totalIsLowerBound, claims };
      });
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (e instanceof ProviderHttpError && e.retryable && attempt < 2) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      break;
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  await d.update(schema.researchJobs).set({ status: "failed", error: message.slice(0, 500), finishedAt: new Date() }).where(eq(schema.researchJobs.id, jobId));
  logger.warn("research provider failed", { provider: providerId, error: message });
  return { ok: false, jobId, provider: providerId, error: message, reason: "provider_error" };
}

export async function sourcesByIds(projectId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db().select().from(schema.researchSources).where(and(eq(schema.researchSources.projectId, projectId), inArray(schema.researchSources.id, ids)));
}
