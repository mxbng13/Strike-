/** Small markdown helpers shared by agents. */
export const esc = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function table(headers: string[], rows: unknown[][]): string {
  return [`| ${headers.map(esc).join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n");
}

export const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (aucun élément)");

export const eur = (n: number | null | undefined, digits = 0) =>
  n == null ? "n/d" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;

export const pct = (n: number | null | undefined) => (n == null ? "n/d" : `${Math.round(n * 1000) / 10} %`);

export function sourcesSection(sources: Array<{ id: string; title: string; url: string; provider: string; retrievedAt?: Date | string }>): string {
  if (sources.length === 0) return "## Sources\n\nAucune source externe n'a pu être consultée pour ce livrable : les éléments ci-dessus sont des hypothèses.";
  return (
    "## Sources\n\n" +
    sources
      .map((s, i) => `${i + 1}. [${esc(s.title)}](${s.url}) — ${s.provider}${s.retrievedAt ? `, consulté le ${new Date(s.retrievedAt).toISOString().slice(0, 10)}` : ""} (réf. ${s.id.slice(0, 8)})`)
      .join("\n")
  );
}

export const MODE_BANNER = (mode: string) =>
  mode === "heuristic"
    ? "> Mode heuristique (sans modèle de langage) : contenu produit à partir des données de recherche et de règles déterministes. Configurez ANTHROPIC_API_KEY pour une génération plus riche.\n\n"
    : "";

export const FORECAST_DISCLAIMER = "Les projections sont des scénarios calculés à partir d'hypothèses explicites. Elles ne constituent en aucun cas une garantie de revenus.";

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Deterministic PRNG (mulberry32) seeded from a string: reproducible exploration diversity. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
