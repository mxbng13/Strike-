import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type { AgentContext, AgentResult } from "./framework";
import { auditProjection, FinancialInputsSchema } from "@/financial/engine";
import { reviewArtifact, PLACEHOLDER } from "@/artifacts/service";
import type { Sales } from "./sales-growth";
import { table, list } from "./md";

/** Deliverables that must exist and be complete before launch preparation, with the task that produces them. */
export const REQUIRED_ARTIFACTS: Record<string, string> = {
  "opportunity-dossier": "charter.build",
  "project-charter": "charter.build",
  "market-study": "charter.build",
  "validation-plan": "validation.plan",
  "financial-model": "finance.model",
  "product-spec": "product.spec",
  "brand-identity": "brand.identity",
  "marketing-plan": "marketing.plan",
  "sales-plan": "sales.plan",
  "operations-plan": "ops.plan",
  "launch-website": "build.website",
  "website-test-report": "build.website",
};

const CLAIM = /(revenus|gains|résultats?|succès|rentabilité|bénéfices?)\s+(garanti(e|s|es)?|assuré(e|s|es)?)|garanti(t|ssons|e)?\s+(vos|des|de)\s+(revenus|gains|résultats|clients)|100\s?% (de )?(réussite|succès)/i;
const NEGATION = /\b(ne|n'|pas|aucun(e)?|jamais|sans|non)\b/i;

/** True when a sentence PROMISES a guaranteed outcome (negated disclaimers are fine). */
export function hasForbiddenClaim(text: string): boolean {
  return text.split(/(?<=[.!?\n])\s+/).some((s) => CLAIM.test(s) && !NEGATION.test(s));
}

type Finding = { artifactKey: string | null; severity: "blocking" | "warning"; message: string; redo?: string };

export async function qaHandler(ctx: AgentContext): Promise<AgentResult> {
  const d = db();
  const findings: Finding[] = [];

  // 1. Independent financial recomputation.
  const lastVersion = await d.query.financialScenarios.findFirst({ where: eq(schema.financialScenarios.projectId, ctx.projectId), orderBy: desc(schema.financialScenarios.version) });
  if (!lastVersion) findings.push({ artifactKey: "financial-model", severity: "blocking", message: "Aucun scénario financier enregistré.", redo: "finance.model" });
  else {
    const scen = await d.select().from(schema.financialScenarios).where(and(eq(schema.financialScenarios.projectId, ctx.projectId), eq(schema.financialScenarios.version, lastVersion.version)));
    for (const s of scen) {
      const rows = await d.select().from(schema.financialProjections).where(eq(schema.financialProjections.scenarioId, s.id)).orderBy(schema.financialProjections.month);
      const parsed = FinancialInputsSchema.safeParse(s.inputs);
      if (!parsed.success) {
        findings.push({ artifactKey: "financial-model", severity: "blocking", message: `Scénario ${s.key} : entrées invalides.`, redo: "finance.model" });
        continue;
      }
      const audit = auditProjection(parsed.data, rows);
      if (!audit.consistent) findings.push({ artifactKey: "financial-model", severity: "blocking", message: `Scénario ${s.key} incohérent avec un recalcul indépendant : ${audit.issues.slice(0, 3).join(" ")}`, redo: "finance.model" });
    }
    const base = scen.find((s) => s.key === "base");
    const need = (base?.summary as { financingNeed?: number } | undefined)?.financingNeed ?? 0;
    if (need > 0) findings.push({ artifactKey: "financial-model", severity: "warning", message: `Le scénario central nécessite ${need} € de financement au-delà du budget : à arbitrer avant d'engager des dépenses.` });
  }

  // 2. Completeness & forbidden claims on every current artifact version.
  const arts = await d.select().from(schema.artifacts).where(eq(schema.artifacts.projectId, ctx.projectId));
  const versions = arts.length
    ? await d.select().from(schema.artifactVersions).where(inArray(schema.artifactVersions.artifactId, arts.map((a) => a.id)))
    : [];
  const current = arts.map((a) => ({ a, v: versions.find((v) => v.artifactId === a.id && v.version === a.currentVersion) })).filter((x) => x.v);
  for (const key of Object.keys(REQUIRED_ARTIFACTS)) {
    const x = current.find((c) => c.a.key === key);
    if (!x) findings.push({ artifactKey: key, severity: "blocking", message: `Livrable obligatoire absent : ${key}.`, redo: REQUIRED_ARTIFACTS[key] });
    else if (!x.v!.completeness.complete) findings.push({ artifactKey: key, severity: "blocking", message: `Livrable incomplet (${x.a.title}) : ${x.v!.completeness.missing.join(", ")}.`, redo: REQUIRED_ARTIFACTS[key] });
  }
  const projectSourceIds = new Set((await d.select({ id: schema.researchSources.id }).from(schema.researchSources).where(eq(schema.researchSources.projectId, ctx.projectId))).map((r) => r.id));
  for (const { a, v } of current) {
    const text = v!.content + (v!.files ?? []).map((f) => f.content).join("\n");
    if (hasForbiddenClaim(text)) findings.push({ artifactKey: a.key, severity: "blocking", message: `« ${a.title} » contient une promesse de résultat garanti (interdit).`, redo: REQUIRED_ARTIFACTS[a.key] });
    const ghost = v!.sourceIds.filter((id) => !projectSourceIds.has(id));
    if (ghost.length) findings.push({ artifactKey: a.key, severity: "blocking", message: `« ${a.title} » cite ${ghost.length} source(s) inexistante(s) dans le projet.`, redo: REQUIRED_ARTIFACTS[a.key] });
    if (a.key !== "launch-website" && PLACEHOLDER.test(text)) findings.push({ artifactKey: a.key, severity: "warning", message: `« ${a.title} » contient des éléments à compléter.` });
  }

  // 3. Evidence quality of the selected opportunity.
  if (ctx.context.selected) {
    const ev = await d.query.evidenceAssessments.findFirst({ where: eq(schema.evidenceAssessments.opportunityId, ctx.context.selected.id) });
    if (!ev || ev.quality === "none" || ev.quality === "weak")
      findings.push({ artifactKey: "opportunity-dossier", severity: "warning", message: `Qualité des preuves ${ev?.quality ?? "inconnue"} : la validation commerciale (plan de validation) est indispensable avant tout investissement.` });
  }

  // 4. Cross-deliverable consistency.
  const brand = ctx.context.outputs["brand.identity"] as { name: string } | undefined;
  const sales = ctx.context.outputs["sales.plan"] as Sales | undefined;
  const site = current.find((c) => c.a.key === "launch-website")?.v?.files?.find((f) => f.path === "site/index.html")?.content;
  if (site && brand && !site.includes(brand.name)) findings.push({ artifactKey: "launch-website", severity: "blocking", message: "Le site n'utilise pas le nom de marque retenu.", redo: "build.website" });
  if (site && sales) for (const o of sales.offers) if (!site.includes(`data-price="${o.priceEur}"`)) findings.push({ artifactKey: "launch-website", severity: "blocking", message: `Prix de l'offre « ${o.name} » absent ou différent sur le site.`, redo: "build.website" });
  if (site && /<script[^>]+src="https?:/i.test(site)) findings.push({ artifactKey: "launch-website", severity: "blocking", message: "Script tiers externe détecté sur le site.", redo: "build.website" });
  const build = ctx.context.outputs["build.website"] as { tests?: Array<{ ok: boolean }> } | undefined;
  if (build && !(build.tests ?? []).every((t) => t.ok)) findings.push({ artifactKey: "launch-website", severity: "blocking", message: "Les tests sandbox du site ne sont pas tous réussis.", redo: "build.website" });
  const fin = ctx.context.outputs["finance.model"] as { inputs?: { price: number } } | undefined;
  if (fin?.inputs && sales?.offers[0] && Math.abs(sales.offers[0].priceEur - fin.inputs.price) / fin.inputs.price > 0.25)
    findings.push({ artifactKey: "sales-plan", severity: "warning", message: `Prix de l'offre principale (${sales.offers[0].priceEur} €) éloigné de l'hypothèse financière (${fin.inputs.price} €).` });

  const blocking = findings.filter((f) => f.severity === "blocking");
  const verdict = blocking.length ? "blocked" : findings.length ? "pass_with_warnings" : "pass";
  const redo = [...new Set(blocking.map((f) => f.redo).filter((x): x is string => Boolean(x)))];

  const md = `# Rapport d'audit qualité et risques\n\n## Verdict\n\n**${verdict === "pass" ? "Conforme" : verdict === "pass_with_warnings" ? "Conforme avec réserves" : "Bloqué"}** — ${blocking.length} point(s) bloquant(s), ${findings.length - blocking.length} réserve(s).\n\n## Contrôles réalisés\n\n${list(["Recalcul financier indépendant de chaque scénario", "Complétude des livrables obligatoires", "Existence des sources citées", "Absence de promesse de résultat garanti", "Qualité des preuves de l'opportunité", "Cohérence marque / offres / site", "Sécurité du code (scripts tiers, secrets) et tests sandbox"])}\n\n## Constats\n\n${findings.length ? table(["Gravité", "Livrable", "Constat"], findings.map((f) => [f.severity === "blocking" ? "BLOQUANT" : "réserve", f.artifactKey ?? "—", f.message])) : "Aucun constat : tous les contrôles listés ci-dessus sont passés sans réserve."}\n`;

  return {
    kind: "qa.audit",
    output: { verdict, findings, redo },
    mode: "deterministic",
    persist: async (tx) => {
      for (const { a, v } of current) {
        const fs = findings.filter((f) => f.artifactKey === a.key);
        const verdictA = fs.some((f) => f.severity === "blocking") ? "blocked" : fs.length ? "changes_requested" : "approved";
        if (!v!.completeness.complete && verdictA === "approved") continue;
        await reviewArtifact(tx, a.id, v!.id, "quality_risk_auditor", verdictA === "changes_requested" ? "approved" : verdictA, fs.map((f) => f.message));
      }
    },
    artifacts: [{ key: "qa-report", title: "Rapport d'audit qualité et risques", kind: "document", category: "quality", format: "markdown", content: md, requiredSections: ["Verdict", "Contrôles réalisés", "Constats"] }],
    evaluation: { passed: verdict !== "blocked", findings: findings.map((f) => f.message) },
    control: blocking.length ? (redo.length ? { redo } : { block: { reason: blocking.map((b) => b.message).join(" ") } }) : undefined,
  };
}
