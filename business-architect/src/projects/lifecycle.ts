export const PHASES = [
  "intake",
  "discovery",
  "evaluation",
  "charter",
  "validation",
  "design",
  "construction",
  "qa",
  "launch_prep",
  "launch",
  "optimization",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_INFO: Record<Phase, { label: string; deliverable: string; entry: string[]; exit: string[] }> = {
  intake: {
    label: "Intake",
    deliverable: "UserProfile",
    entry: ["Projet créé"],
    exit: ["Pays, budget, temps hebdomadaire et horizon connus (ou valeurs par défaut explicites)"],
  },
  discovery: {
    label: "Découverte",
    deliverable: "OpportunitySet",
    entry: ["UserProfile validé"],
    exit: ["Recherches exécutées sur les sources disponibles", "≥ 5 concepts distincts générés"],
  },
  evaluation: {
    label: "Évaluation",
    deliverable: "OpportunityDecision",
    entry: ["OpportunitySet disponible"],
    exit: ["Concepts analysés (concurrence, risques)", "Concept sélectionné au-dessus du seuil, justification enregistrée"],
  },
  charter: {
    label: "Dossier directeur",
    deliverable: "ProjectCharter",
    entry: ["OpportunityDecision"],
    exit: ["Charter complet : problème, client, valeur, modèle, hypothèses, risques, objectifs, budget, KPI"],
  },
  validation: {
    label: "Validation du concept",
    deliverable: "Plan d'expériences",
    entry: ["Charter"],
    exit: ["Hypothèses les plus risquées identifiées", "Expériences de demande préparées (validation commerciale réelle = action humaine)"],
  },
  design: {
    label: "Conception",
    deliverable: "Spécifications, marque, finances, offres",
    entry: ["Charter"],
    exit: ["Modèle financier calculé", "Cahier des charges MVP", "Identité de marque", "Plans marketing/ventes/opérations"],
  },
  construction: {
    label: "Construction",
    deliverable: "Livrables concrets (site, code, supports)",
    entry: ["Spécifications produit et marque"],
    exit: ["Code écrit et testé en sandbox", "Supports commerciaux générés"],
  },
  qa: {
    label: "Assurance qualité",
    deliverable: "Rapport d'audit",
    entry: ["Livrables construits"],
    exit: ["Recalcul financier concordant", "Aucun livrable obligatoire incomplet", "Preuves suffisantes ou signalées"],
  },
  launch_prep: {
    label: "Préparation du lancement",
    deliverable: "Plan de lancement + demandes d'approbation",
    entry: ["Audit QA non bloquant"],
    exit: ["Calendrier de lancement", "Actions externes en attente d'approbation L2"],
  },
  launch: {
    label: "Lancement & apprentissage",
    deliverable: "Suivi des résultats réels",
    entry: ["Approbations accordées et connecteurs configurés"],
    exit: ["Données réelles collectées (nécessite intégrations externes)"],
  },
  optimization: {
    label: "Optimisation",
    deliverable: "Expériences priorisées",
    entry: ["Données réelles disponibles"],
    exit: ["Boucle d'amélioration en place"],
  },
};
