import type { ResearchProvider, ProviderCapability } from "../types";
import { rechercheEntreprises } from "./recherche-entreprises";
import { dataGouv } from "./data-gouv";
import { hnAlgolia } from "./hn-algolia";
import { eurostat } from "./eurostat";
import { brave, tavily, exa } from "./web-search";

export const PROVIDERS: ResearchProvider[] = [rechercheEntreprises, dataGouv, hnAlgolia, eurostat, brave, tavily, exa];

export function getProvider(id: string): ResearchProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Providers with a capability, usable for a market (configured + relevant). */
export function providersFor(cap: ProviderCapability, countryCode?: string): ResearchProvider[] {
  return PROVIDERS.filter(
    (p) => p.capabilities.includes(cap) && p.availability().ok && (!p.countries || !countryCode || p.countries.includes(countryCode)),
  );
}

export function providerStatus() {
  return PROVIDERS.map((p) => {
    const a = p.availability();
    return { id: p.id, label: p.label, capabilities: p.capabilities, countries: p.countries ?? null, available: a.ok, reason: a.ok ? null : a.reason };
  });
}
