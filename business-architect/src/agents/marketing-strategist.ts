import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept } from "@/discovery/types";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import { table, list, MODE_BANNER, eur } from "./md";
import { providerStatus } from "@/research/providers";

export const MarketingSchema = z.object({
  positioningStatement: z.string(),
  channels: z.array(z.object({ channel: z.string(), why: z.string(), budgetShare: z.number().min(0).max(1), firstAction: z.string() })).min(2),
  seoKeywords: z.array(z.string()).min(5),
  contentCalendar: z.array(z.object({ week: z.number().int().min(1), topic: z.string(), format: z.string(), channel: z.string() })).min(4),
  experiments: z.array(z.object({ name: z.string(), hypothesis: z.string(), metric: z.string(), successThreshold: z.string(), budgetEur: z.number().min(0), durationDays: z.number().int().positive() })).min(3),
});
export type Marketing = z.infer<typeof MarketingSchema>;

export function marketingHeuristic(c: Concept, brandName: string, monthlyBudget: number): Marketing {
  const b2b = c.customerType === "b2b";
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const channels = b2b
    ? [
        { channel: "Prospection directe ciblée (e-mail/LinkedIn, messages préparés)", why: `Cible identifiable dans le registre des entreprises (${c.segmentLabel}).`, budgetShare: 0, firstAction: "Constituer une liste de 50 prospects locaux et envoyer les messages préparés (après approbation)." },
        { channel: "Référencement naturel (SEO) sur le problème", why: "Requêtes d'intention sur le problème, coût faible, effet cumulatif.", budgetShare: 0.2, firstAction: "Publier 2 articles répondant aux questions du segment." },
        { channel: "Partenariats (fédérations, fournisseurs, experts-comptables)", why: "Prescripteurs de confiance pour les TPE.", budgetShare: 0.1, firstAction: "Contacter 5 prescripteurs du secteur." },
        { channel: "Publicité ciblée (test limité)", why: "Mesurer rapidement un coût par inscription.", budgetShare: 0.7, firstAction: "Campagne test soumise à approbation." },
      ]
    : [
        { channel: "Réseaux sociaux organiques (formats courts)", why: "Audience grand public, coût faible.", budgetShare: 0, firstAction: "Publier 3 contenus/semaine pendant 4 semaines." },
        { channel: "Communautés et groupes locaux", why: "Bouche-à-oreille ciblé.", budgetShare: 0.1, firstAction: "Rejoindre 5 communautés pertinentes et contribuer." },
        { channel: "SEO", why: "Questions récurrentes des particuliers.", budgetShare: 0.2, firstAction: "Publier un guide de référence." },
        { channel: "Publicité sociale (test limité)", why: "Mesurer le coût par inscription.", budgetShare: 0.7, firstAction: "Campagne test soumise à approbation." },
      ];
  const kw = [c.frQuery ?? c.title, `${c.frQuery ?? ""} ${c.segmentLabel}`.trim(), `solution ${c.frQuery ?? c.title}`, `${c.frQuery ?? c.title} prix`, `comment ${c.problem.split(" ").slice(0, 6).join(" ").toLowerCase()}`, `${a.label.toLowerCase()} ${c.segmentLabel}`].map((s) => s.replace(/\s+/g, " ").trim());
  const topics = ["Le problème expliqué (et son coût caché)", "Checklist pratique gratuite", "Étude de cas / témoignage pilote", "Comparatif des solutions existantes", `Lancement de ${brandName}`, "FAQ et objections", "Résultats des premiers utilisateurs", "Offre membres fondateurs"];
  return {
    positioningStatement: `Pour les ${c.segmentLabel} qui ${c.problem.toLowerCase().replace(/\.$/, "")}, ${brandName} est ${a.label.toLowerCase()} qui ${c.valueProposition.toLowerCase().replace(/\.$/, "")}.`,
    channels,
    seoKeywords: [...new Set(kw)],
    contentCalendar: topics.map((t, i) => ({ week: i + 1, topic: t, format: i % 2 ? "Article + post court" : "Post + e-mail liste d'attente", channel: channels[i % channels.length]!.channel.split(" (")[0]! })),
    experiments: [
      { name: "Test de la promesse", hypothesis: "La promesse principale déclenche l'inscription", metric: "Taux d'inscription page de lancement", successThreshold: "≥ 8 %", budgetEur: 0, durationDays: 21 },
      { name: "Test A/B du titre", hypothesis: "Un titre centré sur le gain de temps convertit mieux qu'un titre centré sur l'argent", metric: "Écart de taux d'inscription", successThreshold: "≥ 20 % relatif, ≥ 200 visiteurs par variante", budgetEur: 0, durationDays: 14 },
      { name: "Test de canal payant", hypothesis: "Le canal payant fournit des inscrits à coût acceptable", metric: "Coût par inscrit", successThreshold: `≤ ${Math.round(a.cacEur[c.customerType] / 4)} €`, budgetEur: Math.min(100, monthlyBudget), durationDays: 14 },
    ],
  };
}

export async function marketingHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const c = sel.content as Concept;
  const brand = ctx.context.outputs["brand.identity"] as { name: string } | undefined;
  const fin = ctx.context.outputs["finance.model"] as { inputs: { monthlyMarketingBudget: number } } | undefined;
  const budget = fin?.inputs.monthlyMarketingBudget ?? 0;
  const brandName = brand?.name ?? sel.title;
  const m = ctx.mode === "llm"
    ? await ctx.llm({ instructions: `Prépare la stratégie marketing de lancement de ${brandName} : positionnement, canaux (part du budget mensuel de ${budget} €), mots-clés SEO, calendrier éditorial de 8 semaines, au moins 3 expériences mesurables (métrique + seuil). Aucune promesse vague.`, schema: MarketingSchema, schemaName: "marketing_plan", maxTokens: 6000 })
    : marketingHeuristic(c, brandName, budget);
  const seo = providerStatus().some((p) => p.capabilities.includes("web") && p.available);
  const md =
    MODE_BANNER(ctx.mode) +
    `# Plan marketing — ${brandName}\n\n## Positionnement\n\n${m.positioningStatement}\n\n## Canaux d'acquisition\n\n${table(["Canal", "Pourquoi", "Part du budget", "Montant/mois", "Première action"], m.channels.map((x) => [x.channel, x.why, `${Math.round(x.budgetShare * 100)} %`, eur(budget * x.budgetShare), x.firstAction]))}\n\n## Référencement (SEO)\n\n${list(m.seoKeywords)}\n\n${seo ? "" : "Volumes de recherche non mesurés : aucun connecteur de données SEO n'est configuré. Les mots-clés sont des hypothèses issues du problème et du segment."}\n\n## Calendrier éditorial (8 semaines)\n\n${table(["Semaine", "Sujet", "Format", "Canal"], m.contentCalendar.map((x) => [x.week, x.topic, x.format, x.channel]))}\n\n## Expériences de marché\n\n${table(["Expérience", "Hypothèse", "Métrique", "Seuil de succès", "Budget", "Durée"], m.experiments.map((x) => [x.name, x.hypothesis, x.metric, x.successThreshold, eur(x.budgetEur), `${x.durationDays} j`]))}\n\n## Garde-fous\n\nAucune campagne n'est lancée et aucun message n'est envoyé sans approbation explicite (niveau L2).\n`;
  return {
    kind: "marketing.plan",
    output: { ...m, monthlyBudget: budget },
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [{ key: "marketing-plan", title: "Plan marketing", kind: "document", category: "marketing", format: "markdown", content: md, requiredSections: ["Positionnement", "Canaux d'acquisition", "Référencement (SEO)", "Calendrier éditorial (8 semaines)", "Expériences de marché"], dependsOn: ["brand-identity", "financial-model"] }],
    evaluation: { passed: m.experiments.length >= 3, findings: [`${m.experiments.length} expériences mesurables.`] },
  };
}
