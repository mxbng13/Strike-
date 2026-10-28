import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept } from "@/discovery/types";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import { table, list, MODE_BANNER } from "./md";

export const OpsSchema = z.object({
  procedures: z.array(z.object({ name: z.string(), steps: z.array(z.string()).min(2), frequency: z.string() })).min(3),
  tools: z.array(z.object({ need: z.string(), optionsToStudy: z.string(), costHint: z.string() })).min(3),
  suppliersToStudy: z.array(z.string()),
  automations: z.array(z.string()).min(2),
  recurringTasks: z.array(z.object({ task: z.string(), frequency: z.string(), hours: z.number().min(0) })).min(3),
  legalChecklist: z.array(z.object({ item: z.string(), whereToVerify: z.string() })).min(4),
  continuityRisks: z.array(z.object({ risk: z.string(), mitigation: z.string() })).min(2),
});
export type Ops = z.infer<typeof OpsSchema>;

/** Official portals where obligations must be verified (links to consult, not cited as consulted sources). */
const OFFICIAL = {
  entreprendre: "https://entreprendre.service-public.fr",
  formalites: "https://formalites.entreprises.gouv.fr",
  cnil: "https://www.cnil.fr",
  impots: "https://www.impots.gouv.fr/professionnel",
  urssaf: "https://www.urssaf.fr",
};

export function opsHeuristic(c: Concept, weeklyHours: number): Ops {
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const legal = [
    { item: "Choisir le statut juridique (micro-entreprise ou société) et immatriculer l'activité", whereToVerify: `${OFFICIAL.formalites} ; ${OFFICIAL.entreprendre}` },
    { item: "Régime de TVA (franchise en base ou non) et seuils en vigueur", whereToVerify: OFFICIAL.impots },
    { item: "Cotisations sociales et déclarations de chiffre d'affaires", whereToVerify: OFFICIAL.urssaf },
    { item: "Mentions légales, CGV/CGU, politique de confidentialité du site", whereToVerify: OFFICIAL.entreprendre },
    { item: "RGPD : registre des traitements, consentement aux e-mails et cookies", whereToVerify: OFFICIAL.cnil },
    { item: "Mentions obligatoires des factures et calendrier de la facturation électronique", whereToVerify: OFFICIAL.impots },
    { item: "Assurance responsabilité civile professionnelle (selon l'activité)", whereToVerify: OFFICIAL.entreprendre },
  ];
  if (/sant|kin|v[ée]t/i.test(c.sector)) legal.push({ item: "Hébergement de données de santé (certification HDS) si des données de santé sont traitées", whereToVerify: "https://esante.gouv.fr" });
  if (a.physical) legal.push({ item: "Normes produit, étiquetage, droit de rétractation en vente à distance", whereToVerify: "https://www.economie.gouv.fr/dgccrf" });
  return {
    procedures: [
      { name: "Accueil d'un nouveau client", steps: ["Confirmation et facture", "Paramétrage / prise de brief", "Session de démarrage", "Point à J+7"], frequency: "À chaque vente" },
      { name: "Livraison du service / produit", steps: a.digital ? ["Surveillance du service", "Traitement des demandes support < 24 h", "Publication des mises à jour"] : ["Planification", "Réalisation selon checklist", "Contrôle qualité", "Recueil de satisfaction"], frequency: "Continue" },
      { name: "Clôture mensuelle", steps: ["Rapprochement des encaissements", "Déclaration du chiffre d'affaires", "Mise à jour des KPI vs scénario central"], frequency: "Mensuelle" },
    ],
    tools: [
      { need: "Facturation conforme et encaissement", optionsToStudy: "Logiciel de facturation + prestataire de paiement en ligne", costHint: "0 à 30 €/mois + frais par transaction" },
      { need: "Relation client (CRM léger)", optionsToStudy: "Tableur partagé puis CRM gratuit", costHint: "0 à 20 €/mois" },
      { need: "E-mails (liste d'attente, transactionnels)", optionsToStudy: "Service d'e-mailing conforme RGPD hébergé en UE", costHint: "0 à 25 €/mois" },
      { need: "Hébergement du site", optionsToStudy: "Hébergeur statique ou PaaS en Europe", costHint: "0 à 20 €/mois" },
    ],
    suppliersToStudy: a.physical ? ["Fabricants / sous-traitants (devis comparatifs, petites séries)", "Transporteurs et solutions d'expédition"] : ["Prestataire de paiement", "Hébergeur européen", "Expert-comptable (optionnel)"],
    automations: ["Inscription liste d'attente → e-mail de bienvenue", "Paiement reçu → facture + accès automatique", "Relance automatique des paiements échoués", "Tableau de bord KPI hebdomadaire"],
    recurringTasks: [
      { task: "Prospection / contenu", frequency: "Hebdomadaire", hours: Math.round(weeklyHours * 0.4) },
      { task: "Livraison et support", frequency: "Hebdomadaire", hours: Math.round(weeklyHours * 0.4) },
      { task: "Administration et finances", frequency: "Hebdomadaire", hours: Math.max(1, Math.round(weeklyHours * 0.2)) },
    ],
    legalChecklist: legal,
    continuityRisks: [
      { risk: "Indisponibilité du fondateur (activité solo)", mitigation: "Procédures écrites, message d'absence, délais clients réalistes." },
      { risk: "Dépendance à un fournisseur ou une plateforme", mitigation: "Exports réguliers des données, alternative identifiée." },
      { risk: "Perte de données", mitigation: "Sauvegardes automatiques et testées." },
    ],
  };
}

export async function opsHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const c = sel.content as Concept;
  const o = ctx.mode === "llm"
    ? await ctx.llm({ instructions: "Organise les opérations : procédures, outils (catégories et options À ÉTUDIER, jamais engagées), fournisseurs à étudier, automatisations, tâches récurrentes compatibles avec le temps disponible, checklist d'obligations légales à VÉRIFIER (avec le portail officiel où vérifier), risques de continuité.", schema: OpsSchema, schemaName: "operations_plan", maxTokens: 6000 })
    : opsHeuristic(c, ctx.profile.weeklyHours);
  const md =
    MODE_BANNER(ctx.mode) +
    `# Plan opérationnel — ${sel.title}\n\n## Procédures\n\n${o.procedures.map((p) => `### ${p.name} (${p.frequency})\n\n${p.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`).join("\n\n")}\n\n## Outils à étudier\n\n${table(["Besoin", "Options à étudier", "Coût indicatif"], o.tools.map((t) => [t.need, t.optionsToStudy, t.costHint]))}\n\n## Fournisseurs à étudier\n\n${list(o.suppliersToStudy)}\n\n## Automatisations\n\n${list(o.automations)}\n\n## Tâches récurrentes\n\n${table(["Tâche", "Fréquence", "Heures"], o.recurringTasks.map((t) => [t.task, t.frequency, t.hours]))}\n\n## Obligations légales et administratives à vérifier\n\n> Liste de vérification, pas un avis juridique : chaque point doit être confirmé sur le portail officiel indiqué ou avec un professionnel.\n\n${table(["Point", "Où vérifier"], o.legalChecklist.map((l) => [l.item, l.whereToVerify]))}\n\n## Risques de continuité\n\n${table(["Risque", "Mitigation"], o.continuityRisks.map((r) => [r.risk, r.mitigation]))}\n`;
  return {
    kind: "ops.plan",
    output: o,
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    artifacts: [{ key: "operations-plan", title: "Plan opérationnel", kind: "document", category: "operations", format: "markdown", content: md, requiredSections: ["Procédures", "Outils à étudier", "Tâches récurrentes", "Obligations légales et administratives à vérifier", "Risques de continuité"], dependsOn: ["product-spec"] }],
    evaluation: { passed: true, findings: [`${o.legalChecklist.length} points légaux à vérifier.`] },
  };
}
