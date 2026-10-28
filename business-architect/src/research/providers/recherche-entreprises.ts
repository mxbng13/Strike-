import type { ResearchProvider, ResearchQuery, ResearchResult } from "../types";
import { getJson, pace } from "../http";
import { sanitizeUntrusted } from "../sanitize";

type Resp = {
  total_results: number;
  results: Array<{
    siren: string;
    nom_complet: string;
    date_creation?: string | null;
    tranche_effectif_salarie?: string | null;
    nombre_etablissements_ouverts?: number | null;
    activite_principale?: string | null;
  }>;
};

const CAP = 10_000;

/**
 * French official company register (API Recherche d'entreprises, api.gouv.fr — free,
 * no key, ~7 req/s). Used for market density (number of active companies for a NAF
 * activity code = potential B2B customers or competitors) and name collision checks.
 */
export const rechercheEntreprises: ResearchProvider = {
  id: "recherche-entreprises",
  label: "Registre des entreprises (api.gouv.fr)",
  capabilities: ["companies"],
  countries: ["FR"],
  availability: () => ({ ok: true }),
  async search(q: ResearchQuery, signal): Promise<ResearchResult> {
    await pace("recherche-entreprises", 200);
    const params = new URLSearchParams({ per_page: String(Math.min(q.limit ?? 5, 25)), etat_administratif: "A" });
    if (q.query) params.set("q", q.query);
    if (q.filters?.naf) params.set("activite_principale", q.filters.naf);
    const url = `https://recherche-entreprises.api.gouv.fr/search?${params}`;
    const data = await getJson<Resp>("recherche-entreprises", url, signal);
    const items = data.results.map((r) => ({
      url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${encodeURIComponent(r.siren)}`,
      title: sanitizeUntrusted(r.nom_complet, 160).text,
      snippet: [
        r.activite_principale ? `Activité NAF ${r.activite_principale}` : null,
        r.date_creation ? `créée le ${r.date_creation}` : null,
        r.nombre_etablissements_ouverts != null ? `${r.nombre_etablissements_ouverts} établissement(s) ouvert(s)` : null,
        r.tranche_effectif_salarie ? `tranche d'effectif INSEE ${r.tranche_effectif_salarie}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      sourceType: "official_registry" as const,
      metadata: { siren: r.siren, naf: r.activite_principale ?? null },
    }));
    const lowerBound = data.total_results >= CAP;
    const label = q.filters?.naf ? `code NAF ${q.filters.naf}` : `« ${q.query} »`;
    return {
      items,
      totalAvailable: data.total_results,
      totalIsLowerBound: lowerBound,
      claims: [
        {
          claim: `${lowerBound ? "Au moins " : ""}${data.total_results.toLocaleString("fr-FR")} entreprises actives correspondant à ${label} dans le registre français`,
          numericValue: data.total_results,
          unit: "entreprises",
          url,
        },
      ],
    };
  },
};
