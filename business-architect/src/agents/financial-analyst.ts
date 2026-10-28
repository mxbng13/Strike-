import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { schema } from "@/db/client";
import { AppError } from "@/lib/errors";
import type { AgentContext, AgentResult } from "./framework";
import type { Concept } from "@/discovery/types";
import { ARCHETYPES, type ArchetypeId } from "@/discovery/archetypes";
import { project, scenarios, sensitivity, FinancialInputsSchema, type FinancialInputs } from "@/financial/engine";
import { table, eur, pct, MODE_BANNER, FORECAST_DISCLAIMER } from "./md";

/** Labelled assumption: value + why. Origin is always "assumption" unless a source id backs it. */
type Assumption = { key: string; label: string; value: number; unit: string; rationale: string; origin: "assumption" | "observed" | "user"; sourceId?: string | null };

export function baseAssumptions(c: Concept, profile: { budgetEur: number; weeklyHours: number }): { inputs: FinancialInputs; assumptions: Assumption[] } {
  const a = ARCHETYPES[c.archetypeId as ArchetypeId];
  const capacity = a.clientsPerWeeklyHour > 0 ? Math.floor(a.clientsPerWeeklyHour * profile.weeklyHours) : 0;
  const marketing = Math.round(Math.min(profile.budgetEur * 0.06, 300));
  const organic = Math.round(Math.max(0.5, profile.weeklyHours / 10) * (c.customerType === "b2b" ? 1 : 3) * 10) / 10;
  const setupCosts = [
    { label: "Nom de domaine et outils de lancement", amount: Math.round(c.setupCostEur * 0.3) },
    { label: "Identité visuelle et contenus", amount: Math.round(c.setupCostEur * 0.3) },
    { label: "Développement / équipement initial", amount: c.setupCostEur - Math.round(c.setupCostEur * 0.3) * 2 },
  ];
  const fixed = [
    { label: "Logiciels et hébergement", amount: Math.round(c.monthlyFixedEur * 0.6) },
    { label: "Banque, assurance et divers", amount: c.monthlyFixedEur - Math.round(c.monthlyFixedEur * 0.6) },
  ];
  const inputs = FinancialInputsSchema.parse({
    horizonMonths: 24,
    startingCash: profile.budgetEur,
    setupCosts,
    fixedMonthlyCosts: fixed,
    revenueModel: a.revenueModel,
    price: c.priceHypothesis.amountEur,
    ordersPerCustomerPerMonth: a.revenueModel === "one_off" ? 1 : 1,
    variableCostRate: a.variableCostRate,
    variableCostPerUnit: 0,
    paymentFeeRate: 0.015,
    paymentFeeFixed: 0.25,
    monthlyMarketingBudget: marketing,
    cac: a.cacEur[c.customerType],
    organicNewCustomersPerMonth: organic,
    launchMonth: Math.min(12, a.monthsToFirstSale + 1),
    monthlyChurn: a.monthlyChurn,
    organicGrowthRate: a.growthPotential >= 4 ? 0.06 : 0.03,
    capacityLimit: capacity,
  });
  const A = (key: string, label: string, value: number, unit: string, rationale: string): Assumption => ({ key, label, value, unit, rationale, origin: "assumption" });
  return {
    inputs,
    assumptions: [
      { key: "starting_cash", label: "Trésorerie de départ", value: profile.budgetEur, unit: "€", rationale: "Budget déclaré par l'utilisateur.", origin: "user" },
      A("setup_total", "Coûts de lancement", c.setupCostEur, "€", `Ordre de grandeur pour un modèle « ${a.label} » lancé en solo.`),
      A("fixed_monthly", "Coûts fixes mensuels", c.monthlyFixedEur, "€/mois", "Outils, hébergement, banque, assurance : estimation à affiner avec les devis réels."),
      A("price", "Prix", c.priceHypothesis.amountEur, c.priceHypothesis.unit, "Prix d'entrée à tester (voir plan de validation)."),
      A("variable_cost_rate", "Coûts variables", a.variableCostRate * 100, "% du CA", "Estimation selon le modèle."),
      A("payment_fees", "Frais de paiement", 1.5, "% + 0,25 € / transaction", "Ordre de grandeur des frais de paiement par carte en Europe ; à vérifier auprès du prestataire choisi."),
      A("marketing_budget", "Budget marketing mensuel", marketing, "€/mois", "≈ 6 % du budget de départ par mois, plafonné : prudence tant que la demande n'est pas validée."),
      A("cac", "Coût d'acquisition (CAC)", a.cacEur[c.customerType], "€/client", "Hypothèse non mesurée : sera remplacée par la mesure du test d'acquisition."),
      A("organic", "Nouveaux clients organiques", organic, "clients/mois", "Proportionnel au temps disponible (prospection, contenu, bouche-à-oreille)."),
      A("launch_month", "Mois de lancement commercial", inputs.launchMonth, "mois", `Temps de construction estimé : ${a.monthsToFirstSale} mois.`),
      A("churn", "Attrition mensuelle", a.monthlyChurn * 100, "%/mois", a.revenueModel === "one_off" ? "Part des clients qui ne rachètent pas le mois suivant." : "Part des abonnés qui résilient chaque mois."),
      ...(capacity > 0 ? [A("capacity", "Capacité maximale", capacity, "clients actifs", `Service limité par ${profile.weeklyHours} h/semaine.`)] : []),
    ],
  };
}

const LlmFinance = z.object({
  price: z.number().positive(),
  priceRationale: z.string(),
  cac: z.number().positive(),
  cacRationale: z.string(),
  monthlyChurn: z.number().min(0).max(1),
  organicNewCustomersPerMonth: z.number().min(0),
  variableCostRate: z.number().min(0).max(1),
  setupCosts: z.array(z.object({ label: z.string(), amount: z.number().min(0) })).min(1),
  fixedMonthlyCosts: z.array(z.object({ label: z.string(), amount: z.number().min(0) })).min(1),
  monthlyMarketingBudget: z.number().min(0),
});

export async function financeHandler(ctx: AgentContext): Promise<AgentResult> {
  const sel = ctx.context.selected;
  if (!sel) throw new AppError("INTERNAL", "Aucune opportunité sélectionnée.");
  const c = sel.content as Concept;
  let { inputs, assumptions } = baseAssumptions(c, ctx.profile);

  if (ctx.mode === "llm") {
    const p = await ctx.llm({
      instructions: `Propose des HYPOTHÈSES financières réalistes pour ce business (tu ne calcules rien : un moteur déterministe calcule). Point de départ : ${JSON.stringify({ price: inputs.price, cac: inputs.cac, churn: inputs.monthlyChurn, setup: inputs.setupCosts, fixed: inputs.fixedMonthlyCosts, marketing: inputs.monthlyMarketingBudget })}. Le coût de lancement total ne doit pas dépasser le budget de ${ctx.profile.budgetEur} €. Justifie prix et CAC.`,
      schema: LlmFinance,
      schemaName: "financial_assumptions",
      maxTokens: 4000,
    });
    inputs = FinancialInputsSchema.parse({ ...inputs, ...p });
    assumptions = assumptions.map((x) =>
      x.key === "price" ? { ...x, value: p.price, rationale: p.priceRationale } : x.key === "cac" ? { ...x, value: p.cac, rationale: p.cacRationale } : x.key === "setup_total" ? { ...x, value: p.setupCosts.reduce((s, y) => s + y.amount, 0) } : x.key === "fixed_monthly" ? { ...x, value: p.fixedMonthlyCosts.reduce((s, y) => s + y.amount, 0) } : x.key === "marketing_budget" ? { ...x, value: p.monthlyMarketingBudget } : x.key === "churn" ? { ...x, value: p.monthlyChurn * 100 } : x,
    );
  }

  const sc = scenarios(inputs);
  const results = Object.fromEntries((Object.keys(sc) as Array<keyof typeof sc>).map((k) => [k, project(sc[k])])) as Record<keyof typeof sc, ReturnType<typeof project>>;
  const sens = sensitivity(inputs);
  const base = results.base.summary;
  const label = { pessimistic: "Pessimiste", base: "Central", optimistic: "Optimiste" } as const;

  const md =
    MODE_BANNER(ctx.mode) +
    `# Modèle financier — ${sel.title}\n\n> ${FORECAST_DISCLAIMER} Tous les calculs sont effectués par le moteur financier déterministe (testé), à partir des hypothèses ci-dessous.\n\n## Hypothèses\n\n${table(["Hypothèse", "Valeur", "Unité", "Origine", "Justification"], assumptions.map((a) => [a.label, a.value, a.unit, a.origin === "assumption" ? "hypothèse" : a.origin === "user" ? "utilisateur" : "observée", a.rationale]))}\n\n## Budget initial\n\n${table(["Poste", "Montant"], [...inputs.setupCosts.map((s) => [s.label, eur(s.amount)]), ["Total lancement", eur(base.setupTotal)], ["Budget disponible", eur(ctx.profile.budgetEur)]])}\n\n## Coûts fixes mensuels\n\n${table(["Poste", "Montant"], inputs.fixedMonthlyCosts.map((s) => [s.label, eur(s.amount)]))}\n\n## Scénarios sur ${inputs.horizonMonths} mois\n\n${table(["Indicateur", ...Object.values(label)], [
      ["Chiffre d'affaires cumulé", ...(["pessimistic", "base", "optimistic"] as const).map((k) => eur(results[k].summary.totalRevenue))],
      ["Taux de marge brute", ...(["pessimistic", "base", "optimistic"] as const).map((k) => pct(results[k].summary.grossMarginRate))],
      ["Mois d'équilibre mensuel", ...(["pessimistic", "base", "optimistic"] as const).map((k) => results[k].summary.breakEvenMonth ?? "non atteint")],
      ["Trésorerie minimale", ...(["pessimistic", "base", "optimistic"] as const).map((k) => `${eur(results[k].summary.minCashBalance)} (mois ${results[k].summary.minCashMonth})`)],
      ["Besoin de financement", ...(["pessimistic", "base", "optimistic"] as const).map((k) => eur(results[k].summary.financingNeed))],
      ["Trésorerie finale", ...(["pessimistic", "base", "optimistic"] as const).map((k) => eur(results[k].summary.endingCash))],
      ["Clients actifs en fin de période", ...(["pessimistic", "base", "optimistic"] as const).map((k) => Math.round(results[k].summary.endingCustomers))],
    ])}\n\n## Économie unitaire (scénario central)\n\n${table(["Indicateur", "Valeur"], [["Contribution par client et par mois", eur(base.unitContribution, 2)], ["Clients nécessaires pour couvrir coûts fixes + marketing", base.breakEvenCustomers ?? "non atteignable"], ["Valeur vie client (LTV)", base.ltv == null ? "n/d" : eur(base.ltv)], ["LTV / CAC", base.ltvToCac ?? "n/d"], ["Retour sur CAC", base.paybackOnCacMonths == null ? "n/d" : `${base.paybackOnCacMonths} mois`]])}\n\n## Trésorerie prévisionnelle (scénario central)\n\n${table(["Mois", "Clients", "CA", "Marge brute", "Fixes", "Acquisition", "Flux net", "Trésorerie"], results.base.rows.map((r) => [r.month, r.customers, eur(r.revenue), eur(r.grossMargin), eur(r.fixedCosts), eur(r.acquisition), eur(r.netCashFlow), eur(r.cashBalance)]))}\n\n## Analyse de sensibilité (±20 %, effet sur la trésorerie finale)\n\n${table(["Levier", "-20 %", "+20 %"], sens.map((s) => [s.label, eur(s.minus), eur(s.plus)]))}\n\n## Indicateurs de suivi\n\n- Coût d'acquisition réel vs hypothèse (${eur(inputs.cac)})\n- Taux de conversion inscrit → client\n- Attrition mensuelle réelle\n- Trésorerie fin de mois vs scénario central\n`;

  const csv = ["mois;clients;nouveaux_clients;ca;couts_variables;frais_paiement;marge_brute;couts_fixes;acquisition;lancement;flux_net;tresorerie", ...results.base.rows.map((r) => [r.month, r.customers, r.newCustomers, r.revenue, r.variableCosts, r.paymentFees, r.grossMargin, r.fixedCosts, r.acquisition, r.setup, r.netCashFlow, r.cashBalance].join(";"))].join("\n");

  return {
    kind: "finance.model",
    output: { inputs, summary: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.summary])), sensitivity: sens, assumptions },
    mode: ctx.mode === "llm" ? "llm" : "deterministic",
    persist: async (tx) => {
      const last = await tx.query.financialScenarios.findFirst({ where: eq(schema.financialScenarios.projectId, ctx.projectId), orderBy: desc(schema.financialScenarios.version) });
      const version = (last?.version ?? 0) + 1;
      await tx.insert(schema.financialAssumptions).values(assumptions.map((a) => ({ projectId: ctx.projectId, version, key: a.key, label: a.label, value: a.value, unit: a.unit, origin: a.origin, sourceId: a.sourceId ?? null, rationale: a.rationale })));
      for (const k of ["pessimistic", "base", "optimistic"] as const) {
        const [row] = await tx.insert(schema.financialScenarios).values({ projectId: ctx.projectId, version, key: k, inputs: sc[k], summary: results[k].summary }).returning({ id: schema.financialScenarios.id });
        await tx.insert(schema.financialProjections).values(
          results[k].rows.map((r) => ({ scenarioId: row!.id, month: r.month, customers: r.customers, revenue: r.revenue, variableCosts: r.variableCosts, paymentFees: r.paymentFees, grossMargin: r.grossMargin, fixedCosts: r.fixedCosts, acquisition: r.acquisition, netCashFlow: r.netCashFlow, cashBalance: r.cashBalance })),
        );
      }
      if (base.financingNeed > 0) {
        await tx.insert(schema.projectRisks).values({ projectId: ctx.projectId, title: `Besoin de financement de ${eur(base.financingNeed)} dans le scénario central`, category: "financial", likelihood: 3, impact: 4, mitigation: "Réduire les coûts de lancement, retarder le marketing payant ou valider les précommandes avant d'engager les dépenses.", taskId: ctx.taskId });
      }
    },
    artifacts: [
      { key: "financial-model", title: "Modèle financier et scénarios", kind: "spreadsheet", category: "finance", format: "markdown", content: md, requiredSections: ["Hypothèses", "Budget initial", `Scénarios sur ${inputs.horizonMonths} mois`, "Économie unitaire (scénario central)", "Trésorerie prévisionnelle (scénario central)", "Analyse de sensibilité (±20 %, effet sur la trésorerie finale)"], dependsOn: ["project-charter"] },
      { key: "financial-projection-csv", title: "Projection mensuelle (CSV, scénario central)", kind: "spreadsheet", category: "finance", format: "csv", content: csv, dependsOn: ["financial-model"] },
    ],
    evaluation: { passed: true, findings: [`Trésorerie minimale ${eur(base.minCashBalance)} ; besoin de financement ${eur(base.financingNeed)}.`] },
  };
}
