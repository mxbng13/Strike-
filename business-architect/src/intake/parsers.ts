/** Deterministic parsers for intake answers (French free text). */
export type Parsed<T> = { ok: true; value: T; usedDefault?: boolean } | { ok: false; error: string };

const UNKNOWN = /^(je ne sais pas|je sais pas|sais pas|aucune idée|peu importe|passer|indiff[ée]rent|\?|nsp|choisis pour moi|par d[ée]faut)\b/i;
export const isUnknown = (t: string) => UNKNOWN.test(t.trim());

export function parseAmountEur(text: string): Parsed<number> {
  const t = text.trim().toLowerCase();
  if (isUnknown(t)) return { ok: true, value: 1000, usedDefault: true };
  if (/^(aucun|rien|z[ée]ro|0)\b/.test(t)) return { ok: true, value: 0 };
  const m = t.replace(/[\s  ]/g, "").match(/(\d+(?:[.,]\d+)?)(k|m)?/);
  if (!m) {
    if (/mille/.test(t)) return { ok: true, value: 1000 };
    return { ok: false, error: "Je n'ai pas compris le montant. Indique un nombre en euros (ex. 1000) ou « je ne sais pas »." };
  }
  let v = Number(m[1]!.replace(",", "."));
  if (m[2] === "k") v *= 1000;
  if (m[2] === "m") v *= 1_000_000;
  if (!Number.isFinite(v) || v < 0 || v > 10_000_000) return { ok: false, error: "Montant hors limites (0 à 10 000 000 €)." };
  return { ok: true, value: Math.round(v) };
}

export function parseWeeklyHours(text: string): Parsed<number> {
  const t = text.trim().toLowerCase();
  if (isUnknown(t)) return { ok: true, value: 10, usedDefault: true };
  if (/temps plein|full/.test(t)) return { ok: true, value: 35 };
  if (/mi-?temps/.test(t)) return { ok: true, value: 20 };
  const m = t.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return { ok: false, error: "Indique un nombre d'heures par semaine (ex. 10)." };
  let v = Number(m[1]!.replace(",", "."));
  if (/par jour|\/ ?jour|\bjour\b/.test(t)) v *= 5;
  v = Math.round(v);
  if (v < 1 || v > 80) return { ok: false, error: "Le temps hebdomadaire doit être entre 1 et 80 heures." };
  return { ok: true, value: v };
}

const COUNTRIES: Array<[RegExp, string, string]> = [
  [/france|fr\b|hexagone/, "France", "FR"],
  [/belgique|belgium/, "Belgique", "BE"],
  [/suisse|switzerland/, "Suisse", "CH"],
  [/luxembourg/, "Luxembourg", "LU"],
  [/canada|qu[ée]bec/, "Canada", "CA"],
  [/maroc/, "Maroc", "MA"],
  [/s[ée]n[ée]gal/, "Sénégal", "SN"],
  [/c[ôo]te d.?ivoire/, "Côte d'Ivoire", "CI"],
  [/allemagne|germany/, "Allemagne", "DE"],
  [/espagne|spain/, "Espagne", "ES"],
  [/italie|italy/, "Italie", "IT"],
  [/royaume.?uni|angleterre|uk\b|united kingdom/, "Royaume-Uni", "GB"],
  [/[ée]tats.?unis|usa|us\b|united states/, "États-Unis", "US"],
];

export function parseCountry(text: string): Parsed<{ name: string; code: string }> {
  const t = text.trim().toLowerCase();
  if (isUnknown(t)) return { ok: true, value: { name: "France", code: "FR" }, usedDefault: true };
  for (const [re, name, code] of COUNTRIES) if (re.test(t)) return { ok: true, value: { name, code } };
  return { ok: false, error: "Je ne connais pas encore ce marché. Pays supportés : France, Belgique, Suisse, Luxembourg, Canada, Maroc, Sénégal, Côte d'Ivoire, Allemagne, Espagne, Italie, Royaume-Uni, États-Unis." };
}

export function parseHorizon(text: string): Parsed<"quick_revenue" | "durable" | "high_growth"> {
  const t = text.trim().toLowerCase();
  if (isUnknown(t)) return { ok: true, value: "durable", usedDefault: true };
  if (/rapide|vite|court|cash|imm[ée]diat/.test(t)) return { ok: true, value: "quick_revenue" };
  if (/croissance|scale|lev[ée]e|startup|forte|ambiti/.test(t)) return { ok: true, value: "high_growth" };
  if (/durable|long|stable|p[ée]renne|rentable/.test(t)) return { ok: true, value: "durable" };
  return { ok: false, error: "Choisis : revenus rapides, entreprise durable ou forte croissance." };
}

export function parseMode(text: string): Parsed<"autonomous" | "sector" | "existing_idea"> {
  const t = text.trim().toLowerCase();
  if (isUnknown(t) || /pas d.?id[ée]e|explore|choisis|aucune|autonome|toi/.test(t)) return { ok: true, value: "autonomous" };
  if (/secteur|domaine|industrie/.test(t)) return { ok: true, value: "sector" };
  if (/(j.?ai|mon|une) (d[ée]j[àa] )?(une )?id[ée]e|existante|[ée]valuer/.test(t)) return { ok: true, value: "existing_idea" };
  return { ok: false, error: "Choisis une option : pas d'idée (l'IA explore tout), un secteur, ou une idée existante." };
}

export function parseList(text: string): string[] {
  const t = text.trim();
  if (isUnknown(t) || /^(non|rien|aucune?|rien de particulier|pas vraiment)\b/i.test(t)) return [];
  return t
    .split(/[,;\n]| et /)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 12)
    .map((s) => s.slice(0, 80));
}

export function parseFreeText(text: string, min = 3): Parsed<string> {
  const t = text.trim();
  if (t.length < min) return { ok: false, error: "Peux-tu préciser en quelques mots ?" };
  return { ok: true, value: t.slice(0, 1000) };
}
