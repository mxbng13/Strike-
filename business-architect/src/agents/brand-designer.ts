import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept } from "@/discovery/types";
import { table, list, MODE_BANNER, seededRandom, sourcesSection } from "./md";

/* ---------- WCAG contrast (deterministic) ---------- */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function lum(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}
function darken(hex: string, f: number): string {
  return "#" + hexToRgb(hex).map((v) => Math.max(0, Math.round(v * f)).toString(16).padStart(2, "0")).join("");
}
/** Darkens the primary until white text reaches WCAG AA (4.5:1). */
export function accessiblePrimary(hex: string): string {
  let c = hex;
  for (let i = 0; i < 20 && contrast(c, "#ffffff") < 4.5; i++) c = darken(c, 0.9);
  return c;
}

const SECTOR_HUES: Array<[RegExp, string]> = [
  [/sant|kin|v[ée]t|bien-[êe]tre/i, "#0f766e"],
  [/b[âa]timent|artisan|[ée]nergie|habitat/i, "#c2410c"],
  [/restaur|aliment|boulang|agricul/i, "#b45309"],
  [/[ée]ducation|formation/i, "#4338ca"],
  [/sport/i, "#15803d"],
  [/immobilier|tourisme/i, "#1d4ed8"],
  [/commerce|e-commerce|mode/i, "#be185d"],
  [/animaux/i, "#7c3aed"],
];

export const BrandSchema = z.object({
  nameCandidates: z.array(z.object({ name: z.string(), rationale: z.string() })).min(3),
  tagline: z.string(),
  tone: z.array(z.string()).min(2),
  keyMessages: z.array(z.string()).min(3),
  logoBrief: z.string(),
});

function nameIdeas(c: Concept, seed: string): Array<{ name: string; rationale: string }> {
  const words = `${c.title} ${c.segmentLabel}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 5 && !["pour", "logiciel", "service", "forfait", "gestion", "independants", "plateforme", "pratique", "dedie", "relation"].includes(w));
  const roots = [...new Set(words.map((w) => w.slice(0, Math.min(6, w.length - 1))))].slice(0, 4);
  const suffixes = ["io", "ly", "a", "eo", "ix", "up", "ia", "o", "eva"];
  const rnd = seededRandom(seed);
  const out: Array<{ name: string; rationale: string }> = [];
  for (const r of roots) {
    for (let k = 0; k < 2; k++) {
      const s = suffixes[Math.floor(rnd() * suffixes.length)]!;
      const n = (r + s).replace(/(.)\1\1/, "$1$1");
      const name = n.charAt(0).toUpperCase() + n.slice(1);
      if (!out.some((x) => x.name === name)) out.push({ name, rationale: `Construit sur « ${r} » (évoque ${c.segmentLabel} / le problème traité), court et prononçable.` });
    }
  }
  if (roots[0]) out.push({ name: `Mon${roots[0].charAt(0).toUpperCase()}${roots[0].slice(1)}`, rationale: "Formule possessive rassurante, orientée client." });
  return out.slice(0, 6);
}

export async function brandHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const c = sel.content as Concept;
  const gen = ctx.mode === "llm"
    ? await ctx.llm({ instructions: "Propose au moins 5 noms de marque courts, prononçables en français, distinctifs (évite les termes génériques), une signature, le ton, 3 messages clés et un brief de logo.", schema: BrandSchema, schemaName: "brand", maxTokens: 4000 })
    : {
        nameCandidates: nameIdeas(c, ctx.projectId),
        tagline: `${c.valueProposition.split(",")[0]}.`,
        tone: c.customerType === "b2b" ? ["Professionnel", "Direct", "Rassurant"] : ["Chaleureux", "Simple", "Encourageant"],
        keyMessages: [c.valueProposition, `Conçu spécifiquement pour les ${c.segmentLabel}.`, "Sans engagement : essayez, mesurez, décidez."],
        logoBrief: `Logotype typographique simple sur la base du nom, pictogramme évoquant ${c.segmentLabel}, lisible en 32 px, déclinable en monochrome.`,
      };

  // Collision check against the official company register (exact-name matches).
  const checks: Array<{ name: string; matches: number | null; sourceId: string | null }> = [];
  for (const n of gen.nameCandidates.slice(0, 6)) {
    if (ctx.profile.countryCode !== "FR") {
      checks.push({ name: n.name, matches: null, sourceId: null });
      continue;
    }
    const r = await ctx.research("recherche-entreprises", { query: n.name, purpose: `Vérification d'homonymes : ${n.name}`, limit: 5 });
    if (!r.ok) {
      checks.push({ name: n.name, matches: null, sourceId: null });
      continue;
    }
    const exact = r.sources.filter((s) => s.title.toLowerCase().split(/[^a-z0-9àâçéèêëîïôûùüÿñæœ]+/).includes(n.name.toLowerCase())).length;
    checks.push({ name: n.name, matches: exact, sourceId: r.claims[0]?.sourceId ?? null });
  }
  const ranked = [...checks].sort((a, b) => (a.matches ?? 99) - (b.matches ?? 99) || a.name.length - b.name.length);
  const chosen = ranked[0]!;
  const base = SECTOR_HUES.find(([re]) => re.test(c.sector))?.[1] ?? "#2563eb";
  const primary = accessiblePrimary(base);
  const palette = { primary, primaryText: "#ffffff", ink: "#111827", surface: "#ffffff", muted: "#f3f4f6", accent: accessiblePrimary(darken(base, 0.75)) };
  const typography = { headings: "Poppins", body: "Inter" };
  const brand = { name: chosen.name, tagline: gen.tagline, tone: gen.tone, keyMessages: gen.keyMessages, palette, typography, logoBrief: gen.logoBrief };

  const md =
    MODE_BANNER(ctx.mode) +
    `# Identité de marque — ${chosen.name}\n\n## Propositions de noms\n\n${table(["Nom", "Justification", "Homonymes exacts au registre des entreprises"], gen.nameCandidates.slice(0, 6).map((n) => [n.name, n.rationale, checks.find((x) => x.name === n.name)?.matches ?? "non vérifié"]))}\n\n## Nom retenu\n\n**${chosen.name}** — ${chosen.matches === 0 ? "aucun homonyme exact trouvé dans le registre français des entreprises" : chosen.matches == null ? "vérification d'homonymes non disponible pour ce marché" : `${chosen.matches} homonyme(s) exact(s) trouvé(s) : choix par défaut le moins exposé`}. Cette vérification ne remplace pas une recherche d'antériorité de marque (INPI, EUIPO) ni la vérification de disponibilité du nom de domaine, qui restent à faire.\n\n## Signature\n\n${gen.tagline}\n\n## Ton\n\n${list(gen.tone)}\n\n## Messages clés\n\n${list(gen.keyMessages)}\n\n## Palette et typographie\n\n${table(["Rôle", "Couleur", "Contraste avec le texte"], [["Primaire", palette.primary, `${contrast(palette.primary, "#ffffff")}:1 avec blanc`], ["Accent", palette.accent, `${contrast(palette.accent, "#ffffff")}:1 avec blanc`], ["Texte", palette.ink, `${contrast(palette.ink, "#ffffff")}:1 sur fond blanc`], ["Fond secondaire", palette.muted, "—"]])}\n\nTypographies : titres ${typography.headings}, texte ${typography.body} (Google Fonts, licence libre).\n\n## Brief de logo\n\n${gen.logoBrief}\n\n${sourcesSection(ctx.context.sources.filter((s) => checks.some((x) => x.sourceId === s.id)))}\n`;
  return {
    kind: "brand.identity",
    output: { ...brand, nameChecks: checks },
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [{ key: "brand-identity", title: "Identité de marque", kind: "document", category: "brand", format: "markdown", content: md, requiredSections: ["Propositions de noms", "Nom retenu", "Messages clés", "Palette et typographie", "Brief de logo"], dependsOn: ["project-charter"], sourceIds: checks.map((x) => x.sourceId).filter((x): x is string => Boolean(x)) }],
    evaluation: { passed: contrast(primary, "#ffffff") >= 4.5, findings: [`Nom retenu : ${chosen.name}.`, `Contraste primaire/blanc : ${contrast(primary, "#ffffff")}:1.`] },
  };
}
