/**
 * Assistant de rédaction LOCAL (sans IA externe) : extraction par règles à partir d'une phrase.
 * Utilisé seul si ANTHROPIC_API_KEY est absente, et toujours comme filet de sécurité.
 */

export type CategoryLite = { id: number; slug: string; name: string; groupName: string; keywords: string[]; suggestedDurationMinutes: number | null };

export type Draft = {
  title: string;
  description: string;
  categorySlug: string;
  categoryConfidence: number;
  alternativeSlugs: string[];
  timingType: "immediate" | "today" | "tomorrow" | "scheduled" | "recurring";
  /** false quand la phrase ne contient aucun indice temporel (le formulaire garde alors son choix) */
  timingDetected: boolean;
  startDate: string | null; // AAAA-MM-JJ (heure de Paris)
  startTime: string | null; // HH:MM
  durationMinutes: number | null;
  budgetEuros: number | null;
  urgency: "normal" | "high" | "urgent";
  peopleNeeded: number;
  skills: string[];
  recurrence: { freq: "daily" | "weekly" | "monthly" } | null;
  source: "local" | "claude";
};

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ");

/** Catégorisation par mots-clés pondérés. */
export function categorize(text: string, categories: CategoryLite[]) {
  const t = ` ${strip(text)} `;
  const scored = categories
    .filter((c) => c.slug !== "autre")
    .map((c) => {
      let score = 0;
      for (const kw of c.keywords) {
        const k = strip(kw);
        if (!k) continue;
        const re = new RegExp(`[^a-z0-9]${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?[^a-z0-9]`);
        if (re.test(t)) score += k.includes(" ") ? 3 : 2;
      }
      for (const w of strip(c.name).split(/\s+/)) if (w.length > 4 && t.includes(` ${w}`)) score += 1;
      return { slug: c.slug, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { slug: "autre", confidence: 0, alternatives: [] as string[] };
  const second = scored[1]?.score ?? 0;
  const confidence = Math.min(1, best.score / 6) * (best.score > second ? 1 : 0.6);
  return { slug: best.slug, confidence: Math.round(confidence * 100) / 100, alternatives: scored.slice(1, 4).map((x) => x.slug) };
}

const COMMON_FIXES: [RegExp, string][] = [
  [/\bmac ?do\b/gi, "McDonald's"],
  [/\bmcdo\b/gi, "McDonald's"],
  [/\bsvp\b/gi, "s'il vous plaît"],
  [/\bstp\b/gi, "s'il te plaît"],
  [/\bpr\b/gi, "pour"],
  [/\bbcp\b/gi, "beaucoup"],
  [/\bqlq\b/gi, "quelqu'un"],
  [/\bqqn\b/gi, "quelqu'un"],
  [/\bqq'un\b/gi, "quelqu'un"],
  [/\bqq1\b/gi, "quelqu'un"],
  [/\bjsuis\b/gi, "je suis"],
  [/\bchui\b/gi, "je suis"],
  [/\bjai\b/gi, "j'ai"],
  [/\bcherche\s+qq\b/gi, "cherche quelqu'un"],
  [/\bdemenag/gi, "déménag"],
  [/\bmenage\b/gi, "ménage"],
  [/\bpelouze\b/gi, "pelouse"],
  [/\bbaby ?siter\b/gi, "baby-sitter"],
  [/\bbabysitting\b/gi, "baby-sitting"],
  [/\bcanape\b/gi, "canapé"],
  [/\bdevoir\b/gi, "devoirs"],
  [/\bordi\b/gi, "ordinateur"],
  [/\bapres\b/gi, "après"],
  [/\betre\b/gi, "être"],
  [/\bdeja\b/gi, "déjà"],
  [/\bcolie\b/gi, "colis"],
  [/\bmeme\b/gi, "même"],
  [/\s+([,.])/g, "$1"],
  [/\s{2,}/g, " "],
];

/** Correction orthographique légère (abréviations courantes, accents fréquents, ponctuation). */
export function correctText(input: string): string {
  let s = input.trim();
  for (const [re, rep] of COMMON_FIXES) s = s.replace(re, rep);
  s = s.replace(/\s*([!?;:])/g, " $1").replace(/ {2,}/g, " ");
  s = s.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_m, p, c) => p + c.toUpperCase());
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}

function parseTime(t: string): string | null {
  const m = t.match(/\b(\d{1,2})\s?(?:h|heures?|:)\s?(\d{2})?\b/);
  if (!m) {
    if (/\bmidi\b/.test(t)) return "12:00";
    if (/\bminuit\b/.test(t)) return "00:00";
    return null;
  }
  const h = Number(m[1]);
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Date (AAAA-MM-JJ) du prochain jour de semaine donné, à partir de `now`. */
function nextWeekday(target: number, now: Date) {
  const d = new Date(now);
  const diff = (target - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function draftFromSentence(sentence: string, categories: CategoryLite[], now = new Date()): Draft {
  const raw = sentence.trim().slice(0, 600);
  const t = strip(raw);
  const cat = categorize(raw, categories);
  const category = categories.find((c) => c.slug === cat.slug);

  let timingType: Draft["timingType"] = "scheduled";
  let timingDetected = true;
  let startDate: string | null = null;
  const wd = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}s?\\b`).test(t));
  if (/\b(maintenant|tout de suite|immediatement|asap|de suite|vite)\b/.test(t)) timingType = "immediate";
  else if (/\b(ce soir|aujourd hui|cet apres-midi|cet aprem|ce midi|ce matin|cette nuit)\b/.test(t)) timingType = "today";
  else if (/\b(demain)\b/.test(t)) timingType = "tomorrow";
  else if (/\b(ce )?week-?end\b/.test(t)) startDate = nextWeekday(6, now);
  else if (wd >= 0) startDate = nextWeekday(wd, now);
  else if (/\b(semaine prochaine)\b/.test(t)) startDate = nextWeekday(1, now);
  else timingDetected = false;
  let recurrence: Draft["recurrence"] = null;
  if (/\b(tous les jours|chaque jour|quotidien)/.test(t)) recurrence = { freq: "daily" };
  else if (/\b(toutes les semaines|chaque semaine|hebdo|tous les (lundis|mardis|mercredis|jeudis|vendredis|samedis|dimanches))/.test(t)) recurrence = { freq: "weekly" };
  else if (/\b(tous les mois|chaque mois|mensuel)/.test(t)) recurrence = { freq: "monthly" };
  if (recurrence) {
    timingType = "recurring";
    timingDetected = true;
    startDate ??= wd >= 0 ? nextWeekday(wd, now) : new Date(now.getTime() + 86400_000).toISOString().slice(0, 10);
  }

  let urgency: Draft["urgency"] = "normal";
  if (/\b(urgent|urgence|au plus vite|asap)\b/.test(t) || timingType === "immediate") urgency = "urgent";
  else if (timingType === "today") urgency = "high";

  let startTime = parseTime(t);
  if (!startTime && /\bce soir\b/.test(t)) startTime = "19:00";
  if (!startTime && startDate) startTime = /\bmatin\b/.test(t) ? "09:00" : /\bsoir\b/.test(t) ? "19:00" : "10:00";

  let durationMinutes: number | null = null;
  const hRange = t.match(/\bde\s?(\d{1,2})\s?h(?:\d{2})?\s?a\s?(\d{1,2})\s?h/);
  const dH = t.match(/\b(\d+(?:[.,]\d)?)\s?(?:h|heures?)\b(?!\s?\d)/);
  const dM = t.match(/\b(\d{1,3})\s?(?:min|minutes?)\b/);
  if (hRange) {
    durationMinutes = (Number(hRange[2]) - Number(hRange[1])) * 60;
    startTime = `${hRange[1].padStart(2, "0")}:00`;
  } else if (dM) durationMinutes = Number(dM[1]);
  else if (dH && !/\b(a|vers|pour|des)\s?\d{1,2}\s?h/.test(t)) durationMinutes = Math.round(Number(dH[1].replace(",", ".")) * 60);
  if (durationMinutes != null && (durationMinutes <= 0 || durationMinutes > 24 * 60)) durationMinutes = null;
  durationMinutes ??= category?.suggestedDurationMinutes ?? null;

  const money = raw.match(/(\d{1,4}(?:[.,]\d{1,2})?)\s?(?:€|euros?|eur\b)/i);
  const budgetEuros = money ? Number(money[1].replace(",", ".")) : null;

  const people = t.match(/\b(\d|deux|trois|quatre|cinq)\s(personnes|bras|aides|gars)\b/);
  const words: Record<string, number> = { deux: 2, trois: 3, quatre: 4, cinq: 5 };
  const peopleNeeded = people ? (words[people[1]] ?? Number(people[1])) : 1;

  const corrected = correctText(raw);
  const title = buildTitle(corrected, category?.name ?? "Service", t);

  return {
    title,
    description: corrected,
    categorySlug: cat.slug,
    categoryConfidence: cat.confidence,
    alternativeSlugs: cat.alternatives,
    timingType,
    timingDetected,
    startDate,
    startTime,
    durationMinutes,
    budgetEuros,
    urgency,
    peopleNeeded: Math.max(1, Math.min(20, peopleNeeded)),
    skills: [],
    recurrence,
    source: "local",
  };
}

function buildTitle(corrected: string, categoryName: string, t: string): string {
  const intent = corrected
    .replace(/^(bonjour|salut|hello|coucou)[,!. ]*/i, "")
    .replace(/^(je cherche|je recherche|j'ai besoin d'|j'ai besoin de|besoin d'|besoin de|cherche|recherche|qui peut|quelqu'un pour|quelqu'un qui peut)\s*/i, "")
    .replace(/^(quelqu'un|une personne|qq'un)\s+(pour|qui)\s+/i, "")
    .replace(/[.!?]$/, "");
  let title = intent
    .split(/[.!?\n]/)[0]
    .replace(/[,;–-]?\s*\d{1,4}(?:[.,]\d{1,2})?\s?(?:€|euros?)/gi, "")
    .replace(/[,;]\s*$/, "")
    .trim();
  if (title.length < 6) title = categoryName;
  if (title.length > 70) title = title.slice(0, 67).replace(/\s+\S*$/, "") + "…";
  if (/\bce soir\b/.test(t) && !/ce soir/i.test(title)) title += " ce soir";
  return title.charAt(0).toUpperCase() + title.slice(1);
}
