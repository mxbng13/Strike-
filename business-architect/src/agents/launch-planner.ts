import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult, ActionDraft } from "./framework";
import type { Marketing } from "./marketing-strategist";
import { table, list, eur, MODE_BANNER } from "./md";

/** Launch preparation (Marketing Strategist): calendar, checklists and L2 approval requests. Nothing external is executed here. */
export async function launchHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const brand = (ctx.context.outputs["brand.identity"] as { name: string } | undefined)?.name ?? sel.title;
  const marketing = ctx.context.outputs["marketing.plan"] as (Marketing & { monthlyBudget: number }) | undefined;
  const qa = ctx.context.outputs["qa.audit"] as { verdict: string; findings: Array<{ message: string; severity: string }> } | undefined;
  const adTest = marketing?.experiments.find((e) => e.budgetEur > 0);

  const actions: ActionDraft[] = [
    { actionType: "purchase_domain", title: `Acheter un nom de domaine pour ${brand}`, objective: "Disposer d'une adresse professionnelle pour la page de lancement.", estimatedCostEur: 15, consequences: "Dépense annuelle récurrente ; disponibilité du nom à vérifier au moment de l'achat.", dedupeKey: "purchase_domain", payload: { brand } },
    { actionType: "publish_website", title: `Publier le site de lancement de ${brand}`, objective: "Mettre en ligne la page de lancement et la liste d'attente.", estimatedCostEur: 0, consequences: "Publication publique ; mentions légales à compléter AVANT publication ; collecte de données personnelles (e-mails) soumise au RGPD.", dedupeKey: "publish_website", payload: { artifactKey: "launch-website" } },
    { actionType: "send_external_communication", title: "Envoyer les messages de prospection préparés", objective: "Obtenir 15 entretiens de découverte (plan de validation).", estimatedCostEur: 0, consequences: "Communication au nom de l'utilisateur à des tiers ; respecter le RGPD (intérêt légitime B2B, droit d'opposition).", dedupeKey: "send_outreach", payload: { artifactKey: "sales-plan" } },
    ...(adTest ? [{ actionType: "run_ad_campaign", title: `Lancer la campagne test « ${adTest.name} »`, objective: adTest.hypothesis, estimatedCostEur: adTest.budgetEur, consequences: `Dépense réelle de ${adTest.budgetEur} € sur ${adTest.durationDays} jours ; création d'un compte publicitaire.`, dedupeKey: "ad_test_1", payload: { experiment: adTest } }] : []),
    { actionType: "register_company", title: "Immatriculer l'activité", objective: "Pouvoir facturer légalement.", estimatedCostEur: 0, consequences: "Engagement juridique et fiscal de l'utilisateur ; choix du statut à valider (voir plan opérationnel).", dedupeKey: "register_company" },
  ];

  const human = [
    "Compléter les mentions légales et la politique de confidentialité du site (identité légale, hébergeur).",
    "Vérifier les obligations légales listées dans le plan opérationnel sur les portails officiels.",
    "Vérifier la disponibilité du nom de marque (INPI/EUIPO) et du nom de domaine.",
    "Mener les entretiens de découverte et les expériences du plan de validation (seule preuve de demande réelle).",
    ...actions.map((a) => `Décider de l'approbation : ${a.title}${a.estimatedCostEur ? ` (${eur(a.estimatedCostEur)})` : ""}.`),
  ];
  const done = ["Opportunité recherchée, comparée et sélectionnée", "Dossier directeur et dossier d'opportunité", "Modèle financier (3 scénarios)", "Cahier des charges MVP", "Identité de marque", "Plans marketing, commercial et opérationnel", "Site de lancement codé et testé en sandbox", `Audit qualité : ${qa?.verdict ?? "non disponible"}`];

  const md =
    MODE_BANNER(ctx.mode) +
    `# Plan de lancement — ${brand}\n\n## Calendrier\n\n${table(["Quand", "Action", "Responsable", "Condition"], [
      ["J-14", "Compléter les informations légales du site", "Utilisateur", "—"],
      ["J-10", "Acheter le nom de domaine", "Utilisateur / IA après approbation", "Approbation « purchase_domain »"],
      ["J-7", "Publier la page de lancement", "Après approbation", "Approbation « publish_website »"],
      ["J-7 → J+14", "Entretiens de découverte (15)", "Utilisateur", "Messages de prospection approuvés"],
      ["J0", "Ouverture de la liste d'attente et communication", "Utilisateur", "Site publié"],
      ["J+7", adTest ? `Campagne test (${eur(adTest.budgetEur)})` : "Test de canal organique", "Après approbation", adTest ? "Approbation « run_ad_campaign »" : "—"],
      ["J+21", "Bilan des expériences vs seuils du plan de validation", "IA + utilisateur", "Données réelles saisies"],
      ["J+30", "Décision : poursuivre, ajuster ou revenir à la découverte", "Utilisateur", "—"],
    ])}\n\n## Ce qui est terminé\n\n${list(done)}\n\n## Ce qui reste à faire\n\n${list(["Construction du MVP complet selon le cahier des charges (après validation de la demande)", "Intégration du paiement (connecteur soumis à approbation)", "Suivi des résultats réels : nécessite des intégrations (analytics, paiement) et des données saisies"])}\n\n## Actions humaines requises\n\n${list(human)}\n\n## Demandes d'approbation créées\n\n${table(["Action", "Coût estimé", "Conséquences"], actions.map((a) => [a.title, eur(a.estimatedCostEur), a.consequences]))}\n\n## Indicateurs de lancement\n\n${list(["Inscrits sur la liste d'attente", "Taux d'inscription des visiteurs", "Entretiens réalisés / problème confirmé", "Précommandes ou engagements", "Coût par inscrit (si campagne)"])}\n\nAucune donnée de performance réelle n'est disponible à ce stade : les résultats seront suivis lorsque les intégrations et autorisations le permettront.\n`;
  return {
    kind: "launch.plan",
    output: { actions: actions.map((a) => a.dedupeKey), humanActions: human, done },
    mode: ctx.mode === "llm" ? "llm" : "heuristic",
    actions,
    artifacts: [{ key: "launch-plan", title: "Plan de lancement", kind: "document", category: "launch", format: "markdown", content: md, requiredSections: ["Calendrier", "Ce qui est terminé", "Ce qui reste à faire", "Actions humaines requises", "Demandes d'approbation créées"], dependsOn: ["marketing-plan", "launch-website", "qa-report"] }],
    evaluation: { passed: true, findings: [`${actions.length} actions L2 soumises à approbation.`] },
  };
}
