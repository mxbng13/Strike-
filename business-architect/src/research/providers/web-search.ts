import { env } from "@/config/env";
import type { ResearchProvider, ResearchResult, ResearchItem } from "../types";
import { getJson, pace } from "../http";
import { sanitizeUntrusted, safeUrl } from "../sanitize";

function toItems(rows: Array<{ url?: string; title?: string; text?: string; date?: string | null }>): ResearchItem[] {
  const out: ResearchItem[] = [];
  for (const r of rows) {
    const url = r.url ? safeUrl(r.url) : null;
    if (!url) continue;
    const d = r.date ? new Date(r.date) : null;
    out.push({
      url,
      title: sanitizeUntrusted(r.title ?? url, 200).text,
      snippet: sanitizeUntrusted(r.text ?? "", 600).text,
      sourceType: "web",
      publishedAt: d && !Number.isNaN(d.getTime()) ? d : null,
    });
  }
  return out;
}

/** Brave Search API — requires BRAVE_SEARCH_API_KEY (paid plans; check current terms). */
export const brave: ResearchProvider = {
  id: "brave",
  label: "Brave Search API",
  capabilities: ["web"],
  availability: () => (env().BRAVE_SEARCH_API_KEY ? { ok: true } : { ok: false, reason: "BRAVE_SEARCH_API_KEY non configurée" }),
  async search(q, signal): Promise<ResearchResult> {
    await pace("brave", 1100);
    const params = new URLSearchParams({ q: q.query, count: String(Math.min(q.limit ?? 8, 20)) });
    if (q.countryCode) params.set("country", q.countryCode.toLowerCase());
    if (q.lang) params.set("search_lang", q.lang);
    type R = { web?: { results?: Array<{ url: string; title: string; description?: string; page_age?: string }> } };
    const data = await getJson<R>("brave", `https://api.search.brave.com/res/v1/web/search?${params}`, signal, {
      headers: { "X-Subscription-Token": env().BRAVE_SEARCH_API_KEY! },
    });
    return { items: toItems((data.web?.results ?? []).map((r) => ({ url: r.url, title: r.title, text: r.description, date: r.page_age }))) };
  },
};

/** Tavily Search API — requires TAVILY_API_KEY. */
export const tavily: ResearchProvider = {
  id: "tavily",
  label: "Tavily Search API",
  capabilities: ["web"],
  availability: () => (env().TAVILY_API_KEY ? { ok: true } : { ok: false, reason: "TAVILY_API_KEY non configurée" }),
  async search(q, signal): Promise<ResearchResult> {
    await pace("tavily", 500);
    type R = { results?: Array<{ url: string; title: string; content?: string; published_date?: string }> };
    const data = await getJson<R>("tavily", "https://api.tavily.com/search", signal, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env().TAVILY_API_KEY!}` },
      body: JSON.stringify({ query: q.query, max_results: Math.min(q.limit ?? 8, 20), search_depth: "basic" }),
    });
    return { items: toItems((data.results ?? []).map((r) => ({ url: r.url, title: r.title, text: r.content, date: r.published_date }))) };
  },
};

/** Exa Search API — requires EXA_API_KEY. */
export const exa: ResearchProvider = {
  id: "exa",
  label: "Exa Search API",
  capabilities: ["web"],
  availability: () => (env().EXA_API_KEY ? { ok: true } : { ok: false, reason: "EXA_API_KEY non configurée" }),
  async search(q, signal): Promise<ResearchResult> {
    await pace("exa", 500);
    type R = { results?: Array<{ url: string; title?: string; text?: string; publishedDate?: string }> };
    const data = await getJson<R>("exa", "https://api.exa.ai/search", signal, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env().EXA_API_KEY! },
      body: JSON.stringify({ query: q.query, numResults: Math.min(q.limit ?? 8, 20), contents: { text: { maxCharacters: 600 } } }),
    });
    return { items: toItems((data.results ?? []).map((r) => ({ url: r.url, title: r.title, text: r.text, date: r.publishedDate }))) };
  },
};
