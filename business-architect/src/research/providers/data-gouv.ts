import type { ResearchProvider, ResearchResult } from "../types";
import { getJson, pace } from "../http";
import { sanitizeUntrusted } from "../sanitize";

type Resp = {
  total: number;
  data: Array<{ title: string; page: string; description?: string; last_modified?: string; organization?: { name?: string } | null }>;
};

/** data.gouv.fr open-data catalogue (free, no key). Signals public-data based opportunities. */
export const dataGouv: ResearchProvider = {
  id: "data-gouv",
  label: "data.gouv.fr (jeux de données publics)",
  capabilities: ["datasets"],
  countries: ["FR"],
  availability: () => ({ ok: true }),
  async search(q, signal): Promise<ResearchResult> {
    await pace("data-gouv", 300);
    const url = `https://www.data.gouv.fr/api/1/datasets/?${new URLSearchParams({ q: q.query, page_size: String(Math.min(q.limit ?? 5, 20)) })}`;
    const data = await getJson<Resp>("data-gouv", url, signal);
    return {
      totalAvailable: data.total,
      items: data.data.map((d) => ({
        url: d.page,
        title: sanitizeUntrusted(d.title, 200).text,
        snippet: sanitizeUntrusted(`${d.organization?.name ? d.organization.name + " — " : ""}${d.description ?? ""}`, 400).text,
        sourceType: "public_dataset" as const,
        publishedAt: d.last_modified ? new Date(d.last_modified) : null,
      })),
      claims: [{ claim: `${data.total} jeu(x) de données publics trouvés pour « ${q.query} » sur data.gouv.fr`, numericValue: data.total, unit: "jeux de données", url }],
    };
  },
};
