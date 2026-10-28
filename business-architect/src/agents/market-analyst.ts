import { z } from "zod";
import { eq } from "drizzle-orm";
import { schema } from "@/db/client";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { ExploreOutput, Direction } from "./opportunity-researcher";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import type { Concept, Signals } from "@/discovery/types";
import { evidenceQualityScore } from "@/discovery/scoring";
import { providersFor } from "@/research/providers";
import { table, list, MODE_BANNER, sourcesSection } from "./md";

const FAILURE_REASONS: Record<ArchetypeId, string[]> = {
  vertical_saas: ["Les clients utilisent déjà un logiciel généraliste (caisse, ERP, tableur) jugé « suffisant ».", "Cycle de vente long et faible propension des TPE à souscrire un abonnement de plus.", "Temps de développement du MVP sous-estimé au regard du temps disponible."],
  productized_service: ["Le temps passé par client limite la croissance (activité peu scalable).", "Difficulté à standardiser : chaque client demande du sur-mesure.", "Prospection directe chronophage et taux de réponse faible."],
  ai_automation_service: ["Méfiance envers l'IA et exigence de fiabilité élevée.", "Dépendance aux API de modèles (coûts, conditions d'utilisation).", "Les éditeurs de logiciels du secteur intègrent des fonctions similaires."],
  local_marketplace: ["Problème de l'œuf et de la poule : sans offre pas de demande et inversement.", "Contournement de la plateforme après la première mise en relation.", "Liquidité locale insuffisante dans la zone de lancement."],
  info_product: ["Abondance de contenus gratuits sur le sujet.", "Dépendance aux plateformes d'audience (réseaux sociaux, SEO).", "Faible récurrence des revenus."],
  d2c_physical: ["Besoin de trésorerie pour le stock et risque d'invendus.", "Marges réduites par la logistique et les retours.", "Concurrence de marques établies et de marketplaces."],
  local_service: ["Revenus plafonnés par le temps disponible.", "Zone de chalandise limitée.", "Concurrence d'indépendants et de plateformes existantes."],
  niche_media: ["Constitution de l'audience lente avant monétisation.", "Taux de conversion gratuit → payant faible.", "Dépendance aux plateformes de diffusion."],
  data_product: ["Qualité et fraîcheur des données publiques variables.", "Valeur perçue difficile à démontrer sans cas d'usage concret.", "Réutilisation possible par des acteurs plus gros."],
  community_membership: ["Animation chronophage pour maintenir l'engagement.", "Attrition élevée après les premiers mois.", "Difficulté à atteindre la masse critique."],
};

const BARRIERS = (c: Concept) =>
  [
    c.requiresDirectContact ? "Accès aux décideurs (prospection directe nécessaire)." : null,
    c.digital ? "Confiance et sécurité des données à démontrer." : null,
    c.physical ? "Logistique, stock et normes produit." : null,
    c.customerType === "b2b" ? "Habitudes d'outils existants chez les professionnels." : "Coût d'acquisition des particuliers.",
  ].filter((x): x is string => Boolean(x));

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const LlmMarket = z.object({
  analyses: z.array(
    z.object({
      slug: z.string(),
      customerInsight: z.string(),
      barriers: z.array(z.string()).min(1),
      failureReasons: z.array(z.string()).min(2),
      competitors: z.array(z.object({ name: z.string(), sourceId: z.string(), kind: z.enum(["direct", "indirect", "alternative"]), note: z.string() })),
    }),
  ),
});

type Analysis = {
  slug: string;
  signals: Signals;
  competitors: Array<{ name: string; url: string; sourceId: string; kind: "direct" | "indirect" | "alternative"; note: string }>;
  failureReasons: string[];
  barriers: string[];
  customerInsight: string;
  evidence: Array<{ kind: "demand" | "competition" | "risk" | "market_size" | "trend"; stance: "supports" | "contradicts" | "neutral"; statement: string; isObservation: boolean; sourceId: string | null; confidence: number }>;
  quality: ReturnType<typeof evidenceQualityScore> & { sourceCount: number; officialSourceCount: number; distinctProviders: number; observationCount: number; hypothesisCount: number };
};

export async function marketHandler(ctx: AgentContext): Promise<AgentResult> {
  const explore = ctx.context.outputs["discovery.explore"] as ExploreOutput | undefined;
  const candidates = ctx.context.candidates;
  if (!explore || candidates.length === 0) throw new AppError("INTERNAL", "Aucun concept à analyser.");
  const web = providersFor("web", ctx.profile.countryCode)[0];
  const analyses: Analysis[] = [];

  for (const cand of candidates) {
    const c = cand.content as Concept;
    const d: Direction | undefined = explore.directions.find((x) => (c.segmentId && x.segmentId === c.segmentId) || x.label === c.segmentLabel);
    const signals: Signals = { ...(d?.signals ?? ({} as Signals)), competitorsFound: null };
    const competitors: Analysis["competitors"] = [];
    const evidence: Analysis["evidence"] = [];

    // Demand evidence: only claims that research actually returned.
    const claimSources = ctx.context.sources.filter((s) => d?.sourceIds.includes(s.id));
    for (const s of claimSources.filter((s) => s.title.endsWith("— requête"))) {
      evidence.push({ kind: s.provider === "eurostat" ? "market_size" : "demand", stance: /^0 /.test(s.snippet ?? "") ? "contradicts" : "supports", statement: s.snippet ?? s.title, isObservation: true, sourceId: s.id, confidence: s.provider === "recherche-entreprises" || s.provider === "eurostat" ? 0.8 : 0.5 });
    }

    if (web) {
      const r = await ctx.research(web.id, { query: `${c.frQuery ?? c.title} logiciel OR service ${c.segmentLabel}`, purpose: `Concurrence : ${c.title}`, limit: 8, countryCode: ctx.profile.countryCode, lang: "fr" });
      if (r.ok) {
        const seen = new Set<string>();
        for (const s of r.sources) {
          const h = hostOf(s.url);
          if (!h || seen.has(h)) continue;
          seen.add(h);
          competitors.push({ name: h, url: s.url, sourceId: s.id, kind: "direct", note: s.title });
        }
        signals.competitorsFound = competitors.length;
      }
    }
    const alt = await ctx.research("hn-algolia", { query: `${c.hnQuery ?? c.title} alternative`, purpose: `Alternatives discutées : ${c.title}`, limit: 5, lang: "en" });
    if (alt.ok) {
      for (const s of alt.sources) {
        competitors.push({ name: s.title.slice(0, 80), url: s.url, sourceId: s.id, kind: "alternative", note: "Discussion mentionnant des alternatives (Hacker News)" });
      }
      evidence.push({ kind: "trend", stance: (alt.totalAvailable ?? 0) > 0 ? "supports" : "neutral", statement: alt.claims[0]?.claim ?? "Aucune discussion trouvée", isObservation: true, sourceId: alt.claims[0]?.sourceId ?? null, confidence: 0.4 });
    }
    for (const comp of competitors.filter((x) => x.kind === "direct")) evidence.push({ kind: "competition", stance: "contradicts", statement: `Acteur existant identifié : ${comp.name} (${comp.note})`, isObservation: true, sourceId: comp.sourceId, confidence: 0.6 });
    if (!web) evidence.push({ kind: "competition", stance: "neutral", statement: "Concurrence directe non mesurée : aucun moteur de recherche Web configuré.", isObservation: false, sourceId: null, confidence: 0.2 });

    const failureReasons = FAILURE_REASONS[c.archetypeId as ArchetypeId] ?? ["Demande insuffisante.", "Coût d'acquisition trop élevé."];
    for (const f of failureReasons) evidence.push({ kind: "risk", stance: "contradicts", statement: `Raison d'échec possible : ${f}`, isObservation: false, sourceId: null, confidence: 0.4 });

    const observed = evidence.filter((e) => e.isObservation);
    const providers = new Set(ctx.context.sources.filter((s) => observed.some((e) => e.sourceId === s.id)).map((s) => s.provider));
    const official = ctx.context.sources.filter((s) => observed.some((e) => e.sourceId === s.id) && (s.sourceType === "official_registry" || s.sourceType === "statistics")).length;
    const base = { sourceCount: new Set(observed.map((e) => e.sourceId)).size, officialSourceCount: official, distinctProviders: providers.size + (alt.ok ? 1 : 0), observationCount: observed.length, hypothesisCount: evidence.length - observed.length };
    const q = evidenceQualityScore({ ...base, webSourceCount: competitors.filter((x) => x.kind === "direct").length });
    analyses.push({
      slug: c.slug,
      signals,
      competitors,
      failureReasons,
      barriers: BARRIERS(c),
      customerInsight: `${c.targetCustomer} — décision d'achat ${c.customerType === "b2b" ? "par le gérant, sensible au gain de temps et au retour sur investissement" : "individuelle, sensible au prix et à la confiance"}.`,
      evidence,
      quality: { ...q, ...base },
    });
  }

  if (ctx.mode === "llm") {
    const known = new Set(ctx.context.sources.map((s) => s.id));
    const llm = await ctx.llm({
      instructions: `Pour chaque concept (slugs : ${analyses.map((a) => a.slug).join(", ")}), approfondis : insight client, barrières à l'entrée, au moins 2 raisons d'échec, et concurrents/alternatives UNIQUEMENT s'ils apparaissent dans une source fournie (sourceId exact). Cherche activement pourquoi chaque concept pourrait échouer.`,
      schema: LlmMarket,
      schemaName: "market_analysis",
      maxTokens: 12_000,
    });
    for (const la of llm.analyses) {
      const a = analyses.find((x) => x.slug === la.slug);
      if (!a) continue;
      a.customerInsight = la.customerInsight;
      a.barriers = la.barriers;
      a.failureReasons = [...new Set([...la.failureReasons, ...a.failureReasons])].slice(0, 5);
      for (const comp of la.competitors) {
        const src = ctx.context.sources.find((s) => s.id === comp.sourceId);
        if (!known.has(comp.sourceId) || !src) continue; // anti-hallucination: unsourced competitors are dropped
        if (!a.competitors.some((x) => x.sourceId === comp.sourceId)) a.competitors.push({ name: comp.name, url: src.url, sourceId: comp.sourceId, kind: comp.kind, note: comp.note });
      }
    }
  }

  const md =
    MODE_BANNER(ctx.mode) +
    `# Analyse de marché comparée — itération ${ctx.iteration}\n\n` +
    table(["Concept", "Qualité des preuves", "Observations", "Hypothèses", "Concurrents directs sourcés"], analyses.map((a) => [candidates.find((c) => c.slug === a.slug)!.title, `${a.quality.quality} (${a.quality.score}/10)`, a.quality.observationCount, a.quality.hypothesisCount, a.signals.competitorsFound ?? "non mesuré"])) +
    "\n\n" +
    analyses
      .map((a) => {
        const title = candidates.find((c) => c.slug === a.slug)!.title;
        return `## ${title}\n\n**Client** : ${a.customerInsight}\n\n**Preuves observées** :\n${list(a.evidence.filter((e) => e.isObservation).map((e) => `${e.statement} (réf. ${e.sourceId?.slice(0, 8) ?? "—"})`))}\n\n**Concurrents et alternatives (sourcés)** :\n${list(a.competitors.map((x) => `${x.name} — ${x.kind} — ${x.url}`))}\n\n**Barrières à l'entrée** :\n${list(a.barriers)}\n\n**Pourquoi ça pourrait échouer (hypothèses)** :\n${list(a.failureReasons)}`;
      })
      .join("\n\n") +
    "\n\n" +
    sourcesSection(ctx.context.sources.filter((s) => analyses.some((a) => a.evidence.some((e) => e.sourceId === s.id) || a.competitors.some((x) => x.sourceId === s.id))));

  return {
    kind: "evaluation.market",
    output: { iteration: ctx.iteration, analyses: analyses.map(({ slug, signals, quality, failureReasons, barriers, customerInsight, competitors }) => ({ slug, signals, quality, failureReasons, barriers, customerInsight, competitors: competitors.map((c) => ({ name: c.name, url: c.url, kind: c.kind, sourceId: c.sourceId })) })) },
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    persist: async (tx) => {
      for (const a of analyses) {
        const cand = candidates.find((c) => c.slug === a.slug)!;
        await tx.delete(schema.opportunityEvidence).where(eq(schema.opportunityEvidence.opportunityId, cand.id));
        if (a.evidence.length) await tx.insert(schema.opportunityEvidence).values(a.evidence.map((e) => ({ ...e, opportunityId: cand.id })));
        await tx.delete(schema.competitorProfiles).where(eq(schema.competitorProfiles.opportunityId, cand.id));
        if (a.competitors.length)
          await tx.insert(schema.competitorProfiles).values(a.competitors.map((x) => ({ projectId: ctx.projectId, opportunityId: cand.id, name: x.name, url: x.url, sourceId: x.sourceId, description: x.note, kind: x.kind })));
        await tx.delete(schema.evidenceAssessments).where(eq(schema.evidenceAssessments.opportunityId, cand.id));
        await tx.insert(schema.evidenceAssessments).values({
          opportunityId: cand.id,
          sourceCount: a.quality.sourceCount,
          officialSourceCount: a.quality.officialSourceCount,
          distinctProviders: a.quality.distinctProviders,
          observationCount: a.quality.observationCount,
          hypothesisCount: a.quality.hypothesisCount,
          quality: a.quality.quality,
          qualityScore: a.quality.score,
          notes: a.signals.competitorsFound == null ? ["Concurrence directe non mesurée"] : [],
        });
        await tx.insert(schema.marketResearch).values({ projectId: ctx.projectId, opportunityId: cand.id, content: { customerInsight: a.customerInsight, barriers: a.barriers, failureReasons: a.failureReasons, signals: a.signals } });
        await tx.update(schema.opportunityCandidates).set({ content: { ...(cand.content as object), signals: a.signals } }).where(eq(schema.opportunityCandidates.id, cand.id));
      }
    },
    artifacts: [{ key: `market-comparison-${ctx.iteration}`, title: `Analyse de marché comparée (itération ${ctx.iteration})`, kind: "document", category: "research", format: "markdown", content: md, sourceIds: [...new Set(analyses.flatMap((a) => a.evidence.map((e) => e.sourceId).filter((x): x is string => Boolean(x))))] }],
    evaluation: { passed: analyses.every((a) => a.failureReasons.length >= 2), findings: [`${analyses.length} concepts analysés.`, web ? "Recherche Web active." : "Pas de moteur Web : concurrence directe non mesurée."] },
  };
}

/* ------------------------------ validation.plan ------------------------------ */

const LlmValidation = z.object({
  riskiestAssumptions: z.array(z.object({ assumption: z.string(), whyRisky: z.string() })).min(2),
  experiments: z
    .array(z.object({ hypothesis: z.string(), method: z.string(), metric: z.string(), successThreshold: z.string(), costEur: z.number().min(0), durationDays: z.number().int().positive(), requiresHumanAction: z.boolean() }))
    .min(3),
});
type Validation = z.infer<typeof LlmValidation>;

export function validationHeuristic(c: Concept): Validation {
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  return {
    riskiestAssumptions: [
      { assumption: c.assumptions[0] ?? c.problem, whyRisky: "Le problème n'est étayé que par des signaux indirects : aucun client n'a encore confirmé." },
      { assumption: `Disposition à payer ${c.priceHypothesis.amountEur} € (${c.priceHypothesis.unit}).`, whyRisky: "Aucune donnée de prix observée auprès de clients réels." },
      { assumption: `Coût d'acquisition ≈ ${a.cacEur[c.customerType]} € par client.`, whyRisky: "Hypothèse de planification, à mesurer par un premier test d'acquisition." },
    ],
    experiments: [
      { hypothesis: "Le problème est réel et prioritaire", method: `15 entretiens de découverte avec des ${c.segmentLabel} (script fourni)`, metric: "Part des interviewés citant le problème parmi leurs 3 priorités", successThreshold: "≥ 40 %", costEur: 0, durationDays: 14, requiresHumanAction: true },
      { hypothesis: "Intérêt pour l'offre", method: "Page de pré-lancement avec liste d'attente (générée) + diffusion ciblée", metric: "Taux d'inscription des visiteurs", successThreshold: "≥ 8 % des visiteurs qualifiés", costEur: 0, durationDays: 21, requiresHumanAction: true },
      { hypothesis: "Disposition à payer", method: a.revenueModel === "one_off" ? "Précommandes avec remboursement garanti" : "Offre « membre fondateur » avec paiement ou engagement écrit", metric: "Nombre de clients payants ou engagés", successThreshold: c.customerType === "b2b" ? "≥ 3 engagements" : "≥ 10 précommandes", costEur: 0, durationDays: 30, requiresHumanAction: true },
      { hypothesis: "Canal d'acquisition viable", method: "Micro-campagne test (soumise à approbation) sur un canal ciblé", metric: "Coût par inscription", successThreshold: `≤ ${Math.round(a.cacEur[c.customerType] / 4)} € par inscrit`, costEur: Math.min(100, Math.round(a.cacEur[c.customerType])), durationDays: 14, requiresHumanAction: true },
    ],
  };
}

export async function validationHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const c = sel.content as Concept;
  const v: Validation = ctx.mode === "llm"
    ? await ctx.llm({ instructions: "Identifie les hypothèses les plus risquées du concept retenu et conçois au moins 3 expériences mesurables (métrique + seuil de succès + coût + durée) pour tester la DEMANDE RÉELLE. Distingue validation documentaire et validation commerciale.", schema: LlmValidation, schemaName: "validation_plan", maxTokens: 6000 })
    : validationHeuristic(c);
  const md =
    MODE_BANNER(ctx.mode) +
    `# Plan de validation du concept — ${sel.title}\n\n## Statut de la validation\n\nLa recherche documentaire (sources consultées) ne prouve pas que des clients achèteront. Seules les expériences ci-dessous, menées auprès de vrais prospects, constituent une validation commerciale. Aucune n'a encore été réalisée.\n\n## Hypothèses les plus risquées\n\n${table(["Hypothèse", "Pourquoi elle est risquée"], v.riskiestAssumptions.map((r) => [r.assumption, r.whyRisky]))}\n\n## Expériences\n\n${table(["Hypothèse testée", "Méthode", "Métrique", "Seuil de succès", "Coût", "Durée", "Action humaine"], v.experiments.map((e) => [e.hypothesis, e.method, e.metric, e.successThreshold, `${e.costEur} €`, `${e.durationDays} j`, e.requiresHumanAction ? "Oui" : "Non"]))}\n\n## Règle de décision\n\nSi moins de la moitié des seuils sont atteints, le système recommande de revenir à la découverte avec ces résultats comme nouvelles données.\n`;
  return {
    kind: "validation.plan",
    output: v,
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [{ key: "validation-plan", title: "Plan de validation du concept", kind: "document", category: "strategy", format: "markdown", content: md, requiredSections: ["Statut de la validation", "Hypothèses les plus risquées", "Expériences"] }],
    evaluation: { passed: v.experiments.length >= 3, findings: [`${v.experiments.length} expériences préparées.`] },
  };
}
