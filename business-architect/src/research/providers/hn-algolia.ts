import type { ResearchProvider, ResearchResult } from "../types";
import { getJson, pace } from "../http";
import { sanitizeUntrusted, safeUrl } from "../sanitize";

type Resp = {
  nbHits: number;
  hits: Array<{ objectID: string; title?: string | null; url?: string | null; points?: number | null; num_comments?: number | null; created_at?: string; story_text?: string | null }>;
};

/**
 * Hacker News search (Algolia public API, free, no key). English-language tech
 * discussions: used as demand/pain signals ("Ask HN", tools people look for).
 */
export const hnAlgolia: ResearchProvider = {
  id: "hn-algolia",
  label: "Hacker News (discussions tech, EN)",
  capabilities: ["discussions"],
  availability: () => ({ ok: true }),
  async search(q, signal): Promise<ResearchResult> {
    await pace("hn-algolia", 250);
    const params = new URLSearchParams({ query: q.query, tags: "(story,ask_hn)", hitsPerPage: String(Math.min(q.limit ?? 8, 20)) });
    // Recent signal only (last ~3 years).
    params.set("numericFilters", `created_at_i>${Math.floor(Date.now() / 1000) - 3 * 365 * 86400}`);
    const url = `https://hn.algolia.com/api/v1/search?${params}`;
    const data = await getJson<Resp>("hn-algolia", url, signal);
    const items = data.hits
      .filter((h) => h.title)
      .map((h) => {
        const discussion = `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`;
        return {
          url: discussion,
          title: sanitizeUntrusted(h.title ?? "", 200).text,
          snippet: sanitizeUntrusted(`${h.points ?? 0} points, ${h.num_comments ?? 0} commentaires. ${h.story_text ?? ""}`, 400).text,
          sourceType: "forum" as const,
          publishedAt: h.created_at ? new Date(h.created_at) : null,
          metadata: { points: h.points ?? 0, comments: h.num_comments ?? 0, link: h.url ? safeUrl(h.url) : null },
        };
      });
    const engagement = items.reduce((s, i) => s + Number(i.metadata.points) + Number(i.metadata.comments), 0);
    return {
      items,
      totalAvailable: data.nbHits,
      claims: [
        { claim: `${data.nbHits} discussion(s) Hacker News des 3 dernières années pour « ${q.query} » (engagement cumulé des ${items.length} premières : ${engagement})`, numericValue: data.nbHits, unit: "discussions", url },
      ],
    };
  },
};
