import type { ResearchProvider, ResearchResult } from "../types";
import { getJson, pace } from "../http";

type Resp = { value: Record<string, number>; dimension: { time: { category: { index: Record<string, number> } } }; label: string };

const EU = new Set(["FR", "BE", "LU", "DE", "ES", "IT", "NL", "PT", "AT", "IE", "CH"]);

/**
 * Eurostat dissemination API (free). Supported indicator: population on 1 January
 * (demo_pjan), used to size B2C markets. query is ignored; filters.indicator selects.
 */
export const eurostat: ResearchProvider = {
  id: "eurostat",
  label: "Eurostat (statistiques officielles UE)",
  capabilities: ["statistics"],
  countries: [...EU],
  availability: () => ({ ok: true }),
  async search(q, signal): Promise<ResearchResult> {
    await pace("eurostat", 300);
    const geo = (q.countryCode ?? "FR").toUpperCase();
    const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_pjan?${new URLSearchParams({ geo, sex: "T", age: "TOTAL", lastTimePeriod: "1" })}`;
    const data = await getJson<Resp>("eurostat", url, signal);
    const year = Object.keys(data.dimension.time.category.index)[0];
    const value = Object.values(data.value)[0];
    if (value === undefined || !year) return { items: [], claims: [] };
    const page = `https://ec.europa.eu/eurostat/databrowser/view/demo_pjan/default/table?lang=fr`;
    return {
      items: [{ url: page, title: `Eurostat — ${data.label} (${geo}, ${year})`, snippet: `Population au 1er janvier ${year} : ${value.toLocaleString("fr-FR")}`, sourceType: "statistics" }],
      claims: [{ claim: `Population de ${geo} au 1er janvier ${year} : ${value.toLocaleString("fr-FR")} habitants (Eurostat demo_pjan)`, numericValue: value, unit: "habitants", url: page }],
    };
  },
};
