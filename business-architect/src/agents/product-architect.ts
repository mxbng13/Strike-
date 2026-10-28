import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept } from "@/discovery/types";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import { table, list, MODE_BANNER } from "./md";

export const ProductSpecSchema = z.object({
  personas: z.array(z.object({ name: z.string(), description: z.string(), goal: z.string(), frustration: z.string() })).min(1),
  mainJourney: z.array(z.string()).min(3),
  features: z.array(z.object({ name: z.string(), description: z.string(), priority: z.enum(["must", "should", "could", "wont"]), acceptance: z.string() })).min(4),
  nonFunctional: z.array(z.string()).min(2),
  outOfScope: z.array(z.string()).min(1),
  architecture: z.array(z.string()).min(2),
  dataEntities: z.array(z.object({ name: z.string(), fields: z.array(z.string()) })),
  milestones: z.array(z.object({ week: z.string(), deliverable: z.string() })).min(2),
});
export type ProductSpec = z.infer<typeof ProductSpecSchema>;

export function productHeuristic(c: Concept, weeklyHours: number): ProductSpec {
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const persona = { name: c.customerType === "b2b" ? "Gérant(e) pressé(e)" : "Particulier concerné", description: c.targetCustomer, goal: `Régler ${c.problem.toLowerCase().slice(0, 120)}`, frustration: "Solutions actuelles trop génériques, chronophages ou chères." };
  const weeks = Math.max(2, Math.ceil((a.techDifficulty * 25) / Math.max(1, weeklyHours)));
  const softwareFeatures = [
    { name: "Inscription et essai", description: "Création de compte, essai gratuit, paramétrage guidé en moins de 10 minutes.", priority: "must" as const, acceptance: "Un nouvel utilisateur atteint le premier résultat utile sans aide." },
    { name: `Cœur : ${c.title}`, description: c.solution, priority: "must" as const, acceptance: "Le cas d'usage principal fonctionne de bout en bout sur des données réelles." },
    { name: "Tableau de bord", description: "Indicateurs clés et actions à faire.", priority: "should" as const, acceptance: "Les 3 indicateurs principaux sont visibles dès la connexion." },
    { name: "Paiement de l'abonnement", description: "Paiement en ligne via un prestataire (connecteur soumis à approbation).", priority: "must" as const, acceptance: "Un client peut s'abonner et résilier seul." },
    { name: "Intégrations", description: "Import/export CSV puis connexions aux outils existants.", priority: "could" as const, acceptance: "Import d'un fichier CSV de 500 lignes sans erreur." },
  ];
  const serviceFeatures = [
    { name: "Page d'offre et prise de rendez-vous", description: "Présentation de l'offre, réservation d'un appel découverte.", priority: "must" as const, acceptance: "Un prospect réserve un créneau en moins de 2 minutes." },
    { name: "Process de livraison standardisé", description: `Checklist et modèles pour délivrer « ${c.title} » de façon répétable.`, priority: "must" as const, acceptance: "Une prestation complète suit la checklist sans étape manquante." },
    { name: "Suivi client", description: "Tableau des clients, statut, prochaines actions.", priority: "should" as const, acceptance: "Chaque client a un statut et une prochaine action datée." },
    { name: "Facturation et paiement", description: "Devis, facture conforme, paiement en ligne.", priority: "must" as const, acceptance: "Facture émise et payée en ligne." },
    { name: "Automatisations", description: "Relances et rappels automatiques.", priority: "could" as const, acceptance: "Les rappels partent sans intervention." },
  ];
  return {
    personas: [persona],
    mainJourney: ["Découvre l'offre (page de lancement)", "S'inscrit sur la liste d'attente ou réserve un échange", "Teste la solution sur son cas réel", "Paie / s'abonne", "Obtient le résultat promis et le mesure"],
    features: a.techDifficulty >= 3 ? softwareFeatures : serviceFeatures,
    nonFunctional: ["Conformité RGPD (données minimales, consentement, droit d'effacement)", "Disponibilité 99 % en heures ouvrées", "Interface utilisable sur mobile", "Sauvegardes quotidiennes"],
    outOfScope: ["Application mobile native", "Multi-langue", "Fonctionnalités avancées tant que la demande n'est pas validée"],
    architecture: a.digital
      ? a.techDifficulty >= 3
        ? ["Application web (TypeScript, framework full-stack) + base PostgreSQL", "Hébergement géré en Europe", "Paiement via prestataire tiers (pas de données de carte stockées)", "E-mails transactionnels via un service dédié"]
        : ["Site de présentation statique (généré) + formulaire de liste d'attente", "Outils no-code pour la livraison (tableur partagé, automatisations)", "Paiement via lien de paiement d'un prestataire"]
      : ["Site vitrine statique (généré) + réservation en ligne", "Gestion clients sur outil simple (tableur / CRM gratuit)"],
    dataEntities: [
      { name: "Client", fields: ["id", "nom", "email", "segment", "statut", "créé le"] },
      { name: "Abonnement/Commande", fields: ["id", "client", "offre", "montant", "statut", "date"] },
      { name: "Inscription liste d'attente", fields: ["email", "source", "date", "consentement"] },
    ],
    milestones: [
      { week: "Semaine 1", deliverable: "Page de lancement en ligne (après approbation) + liste d'attente" },
      { week: `Semaines 2-${Math.min(weeks, 12)}`, deliverable: "MVP du parcours principal" },
      { week: `Semaine ${Math.min(weeks, 12) + 1}`, deliverable: "Premiers utilisateurs pilotes, recueil de retours" },
    ],
  };
}

export async function productHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const c = sel.content as Concept;
  const spec = ctx.mode === "llm"
    ? await ctx.llm({ instructions: "Transforme le concept en cahier des charges de MVP : personas, parcours principal, fonctionnalités priorisées (MoSCoW) avec critères d'acceptation, exigences non fonctionnelles, hors périmètre, architecture technique, entités de données, jalons compatibles avec le temps disponible.", schema: ProductSpecSchema, schemaName: "product_spec", maxTokens: 8000 })
    : productHeuristic(c, ctx.profile.weeklyHours);
  const md =
    MODE_BANNER(ctx.mode) +
    `# Cahier des charges MVP — ${sel.title}\n\n## Personas\n\n${table(["Persona", "Description", "Objectif", "Frustration"], spec.personas.map((p) => [p.name, p.description, p.goal, p.frustration]))}\n\n## Parcours utilisateur principal\n\n${spec.mainJourney.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n## Fonctionnalités\n\n${table(["Fonctionnalité", "Description", "Priorité", "Critère d'acceptation"], spec.features.map((f) => [f.name, f.description, f.priority.toUpperCase(), f.acceptance]))}\n\n## Exigences non fonctionnelles\n\n${list(spec.nonFunctional)}\n\n## Hors périmètre\n\n${list(spec.outOfScope)}\n\n## Architecture technique\n\n${list(spec.architecture)}\n\n## Modèle de données\n\n${table(["Entité", "Champs"], spec.dataEntities.map((e) => [e.name, e.fields.join(", ")]))}\n\n## Jalons\n\n${table(["Période", "Livrable"], spec.milestones.map((m) => [m.week, m.deliverable]))}\n`;
  return {
    kind: "product.spec",
    output: spec,
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [{ key: "product-spec", title: "Cahier des charges MVP", kind: "document", category: "product", format: "markdown", content: md, requiredSections: ["Personas", "Parcours utilisateur principal", "Fonctionnalités", "Architecture technique", "Jalons"], dependsOn: ["project-charter"] }],
    evaluation: { passed: spec.features.some((f) => f.priority === "must"), findings: [`${spec.features.length} fonctionnalités, ${spec.milestones.length} jalons.`] },
  };
}
