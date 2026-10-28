import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept } from "@/discovery/types";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import { table, list, MODE_BANNER, eur } from "./md";

export const SalesSchema = z.object({
  offers: z.array(z.object({ name: z.string(), priceEur: z.number().positive(), unit: z.string(), includes: z.array(z.string()).min(2), target: z.string() })).min(2).max(4),
  pricingTests: z.array(z.object({ test: z.string(), variantA: z.string(), variantB: z.string(), decisionRule: z.string() })).min(1),
  salesScript: z.array(z.string()).min(4),
  objections: z.array(z.object({ objection: z.string(), answer: z.string() })).min(3),
  funnel: z.array(z.object({ stage: z.string(), metric: z.string(), assumedRate: z.string() })).min(3),
  retention: z.array(z.string()).min(2),
  outreachTemplates: z.array(z.object({ subject: z.string(), body: z.string() })).min(1),
});
export type Sales = z.infer<typeof SalesSchema>;

export function salesHeuristic(c: Concept, brandName: string): Sales {
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const p = c.priceHypothesis.amountEur;
  const sub = a.revenueModel !== "one_off";
  const offers = sub
    ? [
        { name: "Essentiel", priceEur: p, unit: c.priceHypothesis.unit, includes: ["Cas d'usage principal", "Support par e-mail", "Sans engagement"], target: "Petites structures qui veulent tester" },
        { name: "Pro", priceEur: Math.round(p * 1.8), unit: c.priceHypothesis.unit, includes: ["Tout Essentiel", "Fonctions avancées / volume supérieur", "Support prioritaire"], target: "Utilisateurs réguliers" },
        { name: "Membre fondateur", priceEur: Math.round(p * 0.7), unit: `${c.priceHypothesis.unit} (prix bloqué 12 mois)`, includes: ["Tarif préférentiel garanti 12 mois", "Accès anticipé", "Influence sur la feuille de route"], target: "10 premiers clients" },
      ]
    : [
        { name: "À l'unité", priceEur: p, unit: c.priceHypothesis.unit, includes: ["Prestation/produit standard", "Paiement en ligne"], target: "Premier achat" },
        { name: "Pack 3", priceEur: Math.round(p * 3 * 0.9), unit: "€ le pack", includes: ["3 unités", "-10 %"], target: "Clients récurrents" },
        { name: "Précommande fondateur", priceEur: Math.round(p * 0.8), unit: c.priceHypothesis.unit, includes: ["-20 % en précommande", "Remboursable avant livraison"], target: "Validation de la demande" },
      ];
  return {
    offers,
    pricingTests: [{ test: "Sensibilité au prix", variantA: `${p} €`, variantB: `${Math.round(p * 1.3)} €`, decisionRule: "Conserver le prix le plus haut si le taux de conversion baisse de moins de 20 % relatif (≥ 100 visiteurs par variante)." }],
    salesScript: c.customerType === "b2b"
      ? ["Ouverture : se présenter, demander 15 minutes pour comprendre leur organisation.", `Découverte : « Comment gérez-vous aujourd'hui ${c.frQuery ?? "ce sujet"} ? Combien de temps par semaine ? »`, "Quantifier : temps perdu × coût horaire, opportunités manquées.", `Démonstration de ${brandName} sur LEUR cas.`, "Proposition : offre Membre fondateur, sans engagement.", "Conclusion : date de démarrage et prochaine étape écrite."]
      : ["Accroche : la situation vécue par le client.", "Preuve : exemple concret / démonstration.", "Offre claire avec prix.", "Réassurance : remboursement ou essai.", "Appel à l'action unique."],
    objections: [
      { objection: "C'est trop cher.", answer: "Comparer au coût du problème (temps ou pertes) ; proposer l'offre Essentiel sans engagement." },
      { objection: "J'ai déjà un outil / je fais à la main.", answer: "Montrer le gain spécifique au métier ; proposer un essai en parallèle de l'existant." },
      { objection: "Je n'ai pas le temps de changer.", answer: "Mise en place accompagnée en moins de 30 minutes, import des données." },
      { objection: "Qui êtes-vous ?", answer: "Être transparent sur le lancement : offre fondateur, engagement de réponse sous 24 h." },
    ],
    funnel: [
      { stage: "Visite page de lancement", metric: "Visiteurs qualifiés", assumedRate: "100 %" },
      { stage: "Inscription", metric: "Taux d'inscription", assumedRate: "8 % (hypothèse)" },
      { stage: sub ? "Essai / démo" : "Panier", metric: "Taux d'activation", assumedRate: "40 % (hypothèse)" },
      { stage: "Paiement", metric: "Taux de conversion", assumedRate: "25 % (hypothèse)" },
    ],
    retention: ["Onboarding personnalisé la première semaine", "Point mensuel de résultats (valeur prouvée)", "Programme de parrainage", "Recueil systématique des retours et feuille de route publique"],
    outreachTemplates: [
      { subject: `${c.segmentLabel} : ${c.frQuery ?? "un sujet"} vous prend du temps ?`, body: `Bonjour {{prénom}},\n\nJe prépare ${brandName}, une solution pensée pour les ${c.segmentLabel} afin de ${c.valueProposition.toLowerCase()}\n\nAccepteriez-vous un échange de 15 minutes pour me dire comment vous gérez ce sujet aujourd'hui ? Je ne vends rien pendant cet appel.\n\nMerci,\n{{signature}}` },
    ],
  };
}

export async function salesHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const c = sel.content as Concept;
  const brandName = (ctx.context.outputs["brand.identity"] as { name: string } | undefined)?.name ?? sel.title;
  const s = ctx.mode === "llm"
    ? await ctx.llm({ instructions: `Conçois les offres (2 à 4 niveaux), les tests de prix, le script de vente, les objections, l'entonnoir avec KPI (taux = hypothèses), la fidélisation et un modèle d'e-mail de prospection (préparé, non envoyé) pour ${brandName}.`, schema: SalesSchema, schemaName: "sales_plan", maxTokens: 6000 })
    : salesHeuristic(c, brandName);
  const md =
    MODE_BANNER(ctx.mode) +
    `# Plan commercial — ${brandName}\n\n## Offres\n\n${table(["Offre", "Prix", "Unité", "Inclus", "Pour qui"], s.offers.map((o) => [o.name, eur(o.priceEur), o.unit, o.includes.join(" ; "), o.target]))}\n\nLes prix sont des hypothèses à tester, pas des prix validés.\n\n## Tests de prix\n\n${table(["Test", "Variante A", "Variante B", "Règle de décision"], s.pricingTests.map((t) => [t.test, t.variantA, t.variantB, t.decisionRule]))}\n\n## Script de vente\n\n${s.salesScript.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\n## Objections\n\n${table(["Objection", "Réponse"], s.objections.map((o) => [o.objection, o.answer]))}\n\n## Entonnoir de conversion\n\n${table(["Étape", "Indicateur", "Taux supposé"], s.funnel.map((f) => [f.stage, f.metric, f.assumedRate]))}\n\n## Fidélisation\n\n${list(s.retention)}\n\n## Modèles de prospection (non envoyés)\n\n${s.outreachTemplates.map((t) => `**Objet :** ${t.subject}\n\n\`\`\`\n${t.body}\n\`\`\``).join("\n\n")}\n`;
  return {
    kind: "sales.plan",
    output: s,
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [{ key: "sales-plan", title: "Plan commercial et offres", kind: "document", category: "sales", format: "markdown", content: md, requiredSections: ["Offres", "Script de vente", "Objections", "Entonnoir de conversion", "Fidélisation"], dependsOn: ["brand-identity", "financial-model"] }],
    evaluation: { passed: s.offers.length >= 2, findings: [`${s.offers.length} offres.`] },
  };
}
