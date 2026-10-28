import { sql } from "drizzle-orm";
import { db, closeDb, schema } from "./client";
import { AGENTS } from "@/agents/registry";
import { MODEL_PRICES, RESEARCH_PRICES_USD } from "@/ai/pricing";

/** Idempotent reference data: agent registry + provider price table. */
export async function seedReferenceData(): Promise<void> {
  const d = db();
  for (const a of Object.values(AGENTS)) {
    await d
      .insert(schema.agents)
      .values({ id: a.id, name: a.name, mission: a.mission })
      .onConflictDoUpdate({ target: schema.agents.id, set: { name: a.name, mission: a.mission, updatedAt: sql`now()` } });
  }
  const validFrom = new Date("2026-10-01T00:00:00Z");
  for (const [model, p] of Object.entries(MODEL_PRICES)) {
    await d
      .insert(schema.providerCosts)
      .values({ provider: "anthropic", model, inputPerMTokUsd: p.inputPerMTokUsd, outputPerMTokUsd: p.outputPerMTokUsd, validFrom, sourceNote: "Tarifs publics Anthropic" })
      .onConflictDoNothing();
  }
  for (const [provider, p] of Object.entries(RESEARCH_PRICES_USD)) {
    await d
      .insert(schema.providerCosts)
      .values({ provider, model: "search", perRequestUsd: p.perRequestUsd, validFrom, sourceNote: p.note })
      .onConflictDoNothing();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedReferenceData().then(closeDb).catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
}
