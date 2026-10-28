import { describe, it, expect } from "vitest";
import { rechercheEntreprises } from "@/research/providers/recherche-entreprises";
import { hnAlgolia } from "@/research/providers/hn-algolia";
import { eurostat } from "@/research/providers/eurostat";
import { dataGouv } from "@/research/providers/data-gouv";

/** Real network calls to free public APIs. Run: npx vitest run tests/live (not part of `npm test`). */
const s = () => AbortSignal.timeout(20_000);
describe("live — API publiques réelles", () => {
  it("registre des entreprises", async () => {
    const r = await rechercheEntreprises.search({ query: "", purpose: "live", filters: { naf: "56.10A" }, limit: 2 }, s());
    expect(r.totalAvailable).toBeGreaterThan(1000);
  });
  it("Hacker News", async () => {
    const r = await hnAlgolia.search({ query: "invoicing software", purpose: "live" }, s());
    expect(r.items.length).toBeGreaterThan(0);
  });
  it("Eurostat", async () => {
    const r = await eurostat.search({ query: "", purpose: "live", countryCode: "FR" }, s());
    expect(r.claims?.[0]?.numericValue).toBeGreaterThan(60_000_000);
  });
  it("data.gouv.fr (peut être indisponible)", async () => {
    try {
      const r = await dataGouv.search({ query: "transport", purpose: "live" }, s());
      expect(r.totalAvailable).toBeGreaterThan(0);
    } catch (e) {
      console.warn("data.gouv.fr indisponible :", (e as Error).message);
    }
  });
});
