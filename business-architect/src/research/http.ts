import { env } from "@/config/env";
import { ProviderHttpError } from "./types";

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (...a) => fetch(...a);

/** Test seam: replace the network layer (never used in production code paths). */
export function setResearchFetch(f: FetchFn | null): void {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

export async function getJson<T>(provider: string, url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      signal,
      headers: { "User-Agent": env().RESEARCH_USER_AGENT, Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "délai dépassé" : "réseau indisponible";
    throw new ProviderHttpError(provider, 0, `${provider} : ${msg}`);
  }
  if (!res.ok) throw new ProviderHttpError(provider, res.status, `${provider} : HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ProviderHttpError(provider, 502, `${provider} : réponse non JSON`);
  }
}

/** Simple per-provider spacing to respect public API rate limits. */
const lastCall = new Map<string, number>();
export async function pace(provider: string, minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const wait = (lastCall.get(provider) ?? 0) + minIntervalMs - now;
  lastCall.set(provider, Math.max(now, now + wait));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}
