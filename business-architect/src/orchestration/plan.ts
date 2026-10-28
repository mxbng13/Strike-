import type { AgentHandler } from "@/agents/framework";
import type { AgentId } from "@/agents/registry";
import { exploreHandler } from "@/agents/opportunity-researcher";
import { inventHandler } from "@/agents/business-inventor";
import { marketHandler, validationHandler } from "@/agents/market-analyst";
import { selectHandler, charterHandler } from "@/agents/business-strategist";
import { financeHandler } from "@/agents/financial-analyst";
import { productHandler } from "@/agents/product-architect";
import { brandHandler } from "@/agents/brand-designer";
import { marketingHandler } from "@/agents/marketing-strategist";
import { salesHandler } from "@/agents/sales-growth";
import { opsHandler } from "@/agents/operations-manager";
import { developerHandler } from "@/agents/developer";
import { qaHandler } from "@/agents/quality-auditor";
import { launchHandler } from "@/agents/launch-planner";
import type { Phase } from "@/projects/lifecycle";

export type TaskSpec = { kind: string; agentId: AgentId; phase: Phase; label: string; deps: string[]; handler: AgentHandler; maxAttempts?: number };

/** Opportunity Engine: one set per discovery iteration. */
export const DISCOVERY_PLAN: TaskSpec[] = [
  { kind: "discovery.explore", agentId: "opportunity_researcher", phase: "discovery", label: "Recherche des opportunités", deps: [], handler: exploreHandler },
  { kind: "discovery.invent", agentId: "business_inventor", phase: "discovery", label: "Génération des concepts", deps: ["discovery.explore"], handler: inventHandler },
  { kind: "evaluation.market", agentId: "market_analyst", phase: "evaluation", label: "Étude des marchés et de la concurrence", deps: ["discovery.invent"], handler: marketHandler },
  { kind: "evaluation.select", agentId: "business_strategist", phase: "evaluation", label: "Comparaison et sélection de l'opportunité", deps: ["evaluation.market"], handler: selectHandler },
];

/** Business Execution Engine: planned only once an OpportunityDossier exists (after selection). */
export const EXECUTION_PLAN: TaskSpec[] = [
  { kind: "charter.build", agentId: "business_strategist", phase: "charter", label: "Construction du dossier directeur", deps: [], handler: charterHandler },
  { kind: "validation.plan", agentId: "market_analyst", phase: "validation", label: "Plan de validation du concept", deps: ["charter.build"], handler: validationHandler },
  { kind: "finance.model", agentId: "financial_analyst", phase: "design", label: "Modèle financier et scénarios", deps: ["charter.build"], handler: financeHandler },
  { kind: "brand.identity", agentId: "brand_designer", phase: "design", label: "Identité de marque", deps: ["charter.build"], handler: brandHandler },
  { kind: "product.spec", agentId: "product_architect", phase: "design", label: "Cahier des charges du produit", deps: ["validation.plan"], handler: productHandler },
  { kind: "marketing.plan", agentId: "marketing_strategist", phase: "design", label: "Stratégie marketing", deps: ["brand.identity", "finance.model", "validation.plan"], handler: marketingHandler },
  { kind: "sales.plan", agentId: "sales_growth", phase: "design", label: "Offres et plan commercial", deps: ["brand.identity", "finance.model"], handler: salesHandler },
  { kind: "ops.plan", agentId: "operations_manager", phase: "design", label: "Plan opérationnel", deps: ["product.spec", "finance.model"], handler: opsHandler },
  { kind: "build.website", agentId: "developer", phase: "construction", label: "Développement et tests du site de lancement", deps: ["brand.identity", "sales.plan", "product.spec"], handler: developerHandler },
  { kind: "qa.audit", agentId: "quality_risk_auditor", phase: "qa", label: "Vérification finale (qualité et risques)", deps: ["marketing.plan", "sales.plan", "ops.plan", "build.website", "finance.model"], handler: qaHandler },
  { kind: "launch.plan", agentId: "marketing_strategist", phase: "launch_prep", label: "Préparation du lancement", deps: ["qa.audit"], handler: launchHandler },
];

export const ALL_SPECS: Record<string, TaskSpec> = Object.fromEntries([...DISCOVERY_PLAN, ...EXECUTION_PLAN].map((s) => [s.kind, s]));

/** Transitive dependents of a kind within the execution plan (used for QA redo). */
export function dependentsOf(kind: string): string[] {
  const out = new Set<string>();
  const visit = (k: string) => {
    for (const s of EXECUTION_PLAN) if (s.deps.includes(k) && !out.has(s.kind)) {
      out.add(s.kind);
      visit(s.kind);
    }
  };
  visit(kind);
  return [...out];
}
