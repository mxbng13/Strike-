/**
 * The 12 specialised agent roles. Each role has a distinct mission and a
 * distinct typed output (see src/agents/contracts.ts). This file is the
 * single source of truth, seeded into the `agents` table.
 */
export const AGENT_IDS = [
  "opportunity_researcher",
  "business_inventor",
  "market_analyst",
  "business_strategist",
  "financial_analyst",
  "product_architect",
  "developer",
  "brand_designer",
  "marketing_strategist",
  "sales_growth",
  "operations_manager",
  "quality_risk_auditor",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type AgentDescriptor = {
  id: AgentId;
  name: string;
  mission: string;
  /** What it must never do (enforced by contracts, governance and QA). */
  limits: string[];
  successCriteria: string[];
};

export const AGENTS: Record<AgentId, AgentDescriptor> = {
  opportunity_researcher: {
    id: "opportunity_researcher",
    name: "Opportunity Researcher",
    mission:
      "Explorer plusieurs secteurs et modèles, définir des hypothèses de recherche, interroger les sources disponibles et séparer observations et hypothèses.",
    limits: ["N'invente aucune source, URL ni statistique.", "Respecte les quotas de recherche du budget IA."],
    successCriteria: ["Au moins 4 directions distinctes explorées", "Chaque signal relié à une source réellement consultée"],
  },
  business_inventor: {
    id: "business_inventor",
    name: "Business Inventor",
    mission:
      "Inventer des concepts de business distincts et précis à partir des besoins détectés, des technologies, des modèles économiques et des contraintes.",
    limits: ["Pas de simples variantes d'une même idée.", "Pas de reformulation de listes d'idées populaires sans ancrage."],
    successCriteria: ["≥ 5 concepts couvrant ≥ 3 secteurs et ≥ 3 modèles économiques", "Chaque concept évaluable (client, problème, solution, prix)"],
  },
  market_analyst: {
    id: "market_analyst",
    name: "Market Analyst",
    mission:
      "Étudier clients, concurrence, alternatives et barrières à l'entrée pour chaque concept, et chercher activement les raisons d'échec.",
    limits: ["Concurrents uniquement issus de sources consultées.", "Signale l'absence de données plutôt que de la combler."],
    successCriteria: ["Analyse concurrentielle sourcée par concept", "≥ 2 raisons d'échec par concept"],
  },
  business_strategist: {
    id: "business_strategist",
    name: "Business Strategist",
    mission:
      "Comparer les options, recommander une direction argumentée, définir positionnement et priorités, puis rédiger le dossier directeur (charter).",
    limits: ["Le score n'est pas une vérité : expliquer incertitudes et facteurs de bascule."],
    successCriteria: ["Recommandation justifiée avec alternatives écartées", "Charter complet et cohérent avec les contraintes"],
  },
  financial_analyst: {
    id: "financial_analyst",
    name: "Financial Analyst",
    mission:
      "Proposer les hypothèses financières (prix, coûts, conversion) et faire calculer scénarios, marges, trésorerie et seuil de rentabilité par le moteur financier déterministe.",
    limits: ["Ne calcule jamais lui-même : le Financial Engine calcule.", "Aucune prévision présentée comme garantie."],
    successCriteria: ["3 scénarios calculés", "Chaque hypothèse étiquetée observée / supposée"],
  },
  product_architect: {
    id: "product_architect",
    name: "Product Architect",
    mission: "Transformer le concept en produit ou service concret : fonctionnalités, parcours, exigences, périmètre MVP.",
    limits: ["MVP compatible avec le budget et le temps disponibles."],
    successCriteria: ["Cahier des charges MVP priorisé", "Parcours utilisateur principal défini"],
  },
  developer: {
    id: "developer",
    name: "Developer",
    mission:
      "Écrire le code et les fichiers nécessaires (site, prototype, tests), les exécuter dans la sandbox isolée et corriger.",
    limits: ["Exécution uniquement en sandbox (sans réseau, sans secrets).", "Aucune publication externe sans approbation L2."],
    successCriteria: ["Livrable code versionné", "Tests exécutés en sandbox avec résultat enregistré"],
  },
  brand_designer: {
    id: "brand_designer",
    name: "Brand Designer",
    mission: "Proposer noms, positionnement de marque, messages, direction artistique, palette et typographie.",
    limits: ["Vérifie les homonymes évidents dans le registre des entreprises ; signale qu'un contrôle INPI/EUIPO reste nécessaire."],
    successCriteria: ["≥ 3 noms proposés + nom retenu justifié", "Palette contrastée accessible"],
  },
  marketing_strategist: {
    id: "marketing_strategist",
    name: "Marketing Strategist",
    mission: "Préparer canaux d'acquisition, SEO, contenus, calendrier et expériences de marché mesurables.",
    limits: ["Aucun envoi ni dépense publicitaire sans approbation."],
    successCriteria: ["≥ 3 expériences avec métrique et seuil de succès", "Calendrier éditorial de lancement"],
  },
  sales_growth: {
    id: "sales_growth",
    name: "Sales & Growth Agent",
    mission: "Concevoir offres, prix à tester, parcours de vente, arguments, fidélisation et indicateurs de conversion.",
    limits: ["Prix à tester présentés comme hypothèses."],
    successCriteria: ["Grille d'offres", "Script de vente et entonnoir avec KPI"],
  },
  operations_manager: {
    id: "operations_manager",
    name: "Operations Manager",
    mission: "Organiser procédures, outils, fournisseurs à étudier, automatisations, tâches récurrentes et continuité.",
    limits: ["Fournisseurs listés comme « à étudier », jamais engagés."],
    successCriteria: ["Procédures clés", "Liste d'obligations légales/administratives à vérifier"],
  },
  quality_risk_auditor: {
    id: "quality_risk_auditor",
    name: "Quality & Risk Auditor",
    mission:
      "Vérifier cohérence globale, qualité des preuves, calculs financiers, risques et complétude des livrables ; bloquer une étape si un critère obligatoire échoue.",
    limits: ["Ne valide jamais un livrable incomplet."],
    successCriteria: ["Rapport d'audit avec verdict par livrable", "Recalcul financier indépendant concordant"],
  },
};
