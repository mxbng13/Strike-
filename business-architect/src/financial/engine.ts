import { z } from "zod";

/**
 * Deterministic financial engine. LLMs/agents PROPOSE inputs; this module
 * COMPUTES. No randomness, no I/O. All amounts in EUR (HT), monthly steps.
 */
export const FinancialInputsSchema = z.object({
  horizonMonths: z.number().int().min(6).max(60).default(24),
  startingCash: z.number().min(0),
  setupCosts: z.array(z.object({ label: z.string(), amount: z.number().min(0) })),
  fixedMonthlyCosts: z.array(z.object({ label: z.string(), amount: z.number().min(0) })),
  revenueModel: z.enum(["subscription", "one_off", "service_retainer"]),
  /** Price per customer per month (subscription/retainer) or per order (one_off). */
  price: z.number().positive(),
  /** Orders per customer per month for one_off businesses (repeat purchases). */
  ordersPerCustomerPerMonth: z.number().min(0).max(30).default(1),
  variableCostRate: z.number().min(0).max(1),
  variableCostPerUnit: z.number().min(0).default(0),
  paymentFeeRate: z.number().min(0).max(0.2),
  paymentFeeFixed: z.number().min(0).max(5),
  monthlyMarketingBudget: z.number().min(0),
  cac: z.number().positive(),
  organicNewCustomersPerMonth: z.number().min(0),
  /** Month (1-based) from which acquisition starts (time to build the MVP). */
  launchMonth: z.number().int().min(1).max(24),
  monthlyChurn: z.number().min(0).max(1),
  /** Monthly growth of organic acquisition (word of mouth/SEO), e.g. 0.05. */
  organicGrowthRate: z.number().min(0).max(0.5).default(0),
  /** Hard capacity limit on active customers (e.g. service hours), 0 = unlimited. */
  capacityLimit: z.number().int().min(0).default(0),
});
export type FinancialInputs = z.infer<typeof FinancialInputsSchema>;

export type MonthRow = {
  month: number;
  newCustomers: number;
  customers: number;
  revenue: number;
  variableCosts: number;
  paymentFees: number;
  grossMargin: number;
  fixedCosts: number;
  acquisition: number;
  setup: number;
  netCashFlow: number;
  cashBalance: number;
};

export type ProjectionSummary = {
  totalRevenue: number;
  totalGrossMargin: number;
  grossMarginRate: number | null;
  setupTotal: number;
  monthlyFixed: number;
  /** First month with non-negative monthly net cash flow (after launch), null if never. */
  breakEvenMonth: number | null;
  /** First month where cumulative cash is back to starting cash, null if never. */
  paybackMonth: number | null;
  minCashBalance: number;
  minCashMonth: number;
  /** Extra money needed to never go below zero cash. */
  financingNeed: number;
  endingCash: number;
  endingCustomers: number;
  unitContribution: number;
  breakEvenCustomers: number | null;
  ltv: number | null;
  ltvToCac: number | null;
  paybackOnCacMonths: number | null;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Revenue-generating units per customer per month and contribution per customer. */
export function unitEconomics(i: FinancialInputs) {
  const units = i.revenueModel === "one_off" ? i.ordersPerCustomerPerMonth : 1;
  const revenuePerCustomer = i.price * units;
  const variable = revenuePerCustomer * i.variableCostRate + i.variableCostPerUnit * units;
  const fees = revenuePerCustomer * i.paymentFeeRate + i.paymentFeeFixed * units;
  return { units, revenuePerCustomer, contribution: revenuePerCustomer - variable - fees };
}

export function project(inputRaw: FinancialInputs): { rows: MonthRow[]; summary: ProjectionSummary } {
  const i = FinancialInputsSchema.parse(inputRaw);
  const ue = unitEconomics(i);
  const setupTotal = i.setupCosts.reduce((s, c) => s + c.amount, 0);
  const monthlyFixed = i.fixedMonthlyCosts.reduce((s, c) => s + c.amount, 0);
  const rows: MonthRow[] = [];
  let customers = 0;
  let cash = i.startingCash;

  for (let m = 1; m <= i.horizonMonths; m++) {
    const live = m >= i.launchMonth;
    const monthsLive = m - i.launchMonth;
    const organic = live ? i.organicNewCustomersPerMonth * Math.pow(1 + i.organicGrowthRate, monthsLive) : 0;
    const paid = live ? i.monthlyMarketingBudget / i.cac : 0;
    let newCustomers = organic + paid;
    // one_off: "customers" are active buyers this month; churn models non-repeat.
    const retained = customers * (1 - i.monthlyChurn);
    if (i.capacityLimit > 0) newCustomers = Math.max(0, Math.min(newCustomers, i.capacityLimit - retained));
    customers = retained + newCustomers;

    const units = customers * ue.units;
    const revenue = customers * ue.revenuePerCustomer;
    const variableCosts = revenue * i.variableCostRate + units * i.variableCostPerUnit;
    const paymentFees = revenue * i.paymentFeeRate + units * i.paymentFeeFixed;
    const grossMargin = revenue - variableCosts - paymentFees;
    const acquisition = live ? i.monthlyMarketingBudget : 0;
    const setup = m === 1 ? setupTotal : 0;
    const netCashFlow = grossMargin - monthlyFixed - acquisition - setup;
    cash += netCashFlow;
    rows.push({
      month: m,
      newCustomers: r2(newCustomers),
      customers: r2(customers),
      revenue: r2(revenue),
      variableCosts: r2(variableCosts),
      paymentFees: r2(paymentFees),
      grossMargin: r2(grossMargin),
      fixedCosts: r2(monthlyFixed),
      acquisition: r2(acquisition),
      setup: r2(setup),
      netCashFlow: r2(netCashFlow),
      cashBalance: r2(cash),
    });
  }

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalGrossMargin = rows.reduce((s, r) => s + r.grossMargin, 0);
  const minRow = rows.reduce((a, b) => (b.cashBalance < a.cashBalance ? b : a), rows[0]!);
  const breakEven = rows.find((r) => r.month >= i.launchMonth && r.revenue > 0 && r.netCashFlow >= 0);
  const payback = rows.find((r) => r.month > 1 && r.cashBalance >= i.startingCash && rows.slice(0, r.month - 1).some((x) => x.cashBalance < i.startingCash));
  const contribution = ue.contribution;
  const breakEvenCustomers = contribution > 0 ? Math.ceil((monthlyFixed + i.monthlyMarketingBudget) / contribution) : null;
  const ltv = i.monthlyChurn > 0 && contribution > 0 ? contribution / i.monthlyChurn : null;

  return {
    rows,
    summary: {
      totalRevenue: r2(totalRevenue),
      totalGrossMargin: r2(totalGrossMargin),
      grossMarginRate: totalRevenue > 0 ? Math.round((totalGrossMargin / totalRevenue) * 1000) / 1000 : null,
      setupTotal: r2(setupTotal),
      monthlyFixed: r2(monthlyFixed),
      breakEvenMonth: breakEven?.month ?? null,
      paybackMonth: payback?.month ?? null,
      minCashBalance: minRow.cashBalance,
      minCashMonth: minRow.month,
      financingNeed: r2(Math.max(0, -minRow.cashBalance)),
      endingCash: rows.at(-1)!.cashBalance,
      endingCustomers: rows.at(-1)!.customers,
      unitContribution: r2(contribution),
      breakEvenCustomers,
      ltv: ltv === null ? null : r2(ltv),
      ltvToCac: ltv === null ? null : Math.round((ltv / i.cac) * 100) / 100,
      paybackOnCacMonths: contribution > 0 ? Math.round((i.cac / contribution) * 10) / 10 : null,
    },
  };
}

export type ScenarioKey = "pessimistic" | "base" | "optimistic";

/** Derives pessimistic/optimistic variants from base assumptions (explicit, documented multipliers). */
export function scenarios(base: FinancialInputs): Record<ScenarioKey, FinancialInputs> {
  return {
    pessimistic: {
      ...base,
      price: base.price * 0.85,
      cac: base.cac * 1.5,
      organicNewCustomersPerMonth: base.organicNewCustomersPerMonth * 0.5,
      monthlyChurn: Math.min(1, base.monthlyChurn * 1.5),
      launchMonth: Math.min(24, base.launchMonth + 1),
    },
    base,
    optimistic: {
      ...base,
      price: base.price * 1.1,
      cac: base.cac * 0.75,
      organicNewCustomersPerMonth: base.organicNewCustomersPerMonth * 1.5,
      monthlyChurn: base.monthlyChurn * 0.75,
    },
  };
}

/** One-at-a-time sensitivity on 24-month ending cash. */
export function sensitivity(base: FinancialInputs, delta = 0.2) {
  const ref = project(base).summary.endingCash;
  const levers: Array<{ key: string; label: string; apply: (i: FinancialInputs, f: number) => FinancialInputs }> = [
    { key: "price", label: "Prix", apply: (i, f) => ({ ...i, price: i.price * f }) },
    { key: "cac", label: "Coût d'acquisition (CAC)", apply: (i, f) => ({ ...i, cac: i.cac * f }) },
    { key: "churn", label: "Attrition mensuelle", apply: (i, f) => ({ ...i, monthlyChurn: Math.min(1, i.monthlyChurn * f) }) },
    { key: "organic", label: "Acquisition organique", apply: (i, f) => ({ ...i, organicNewCustomersPerMonth: i.organicNewCustomersPerMonth * f }) },
    { key: "fixed", label: "Coûts fixes", apply: (i, f) => ({ ...i, fixedMonthlyCosts: i.fixedMonthlyCosts.map((c) => ({ ...c, amount: c.amount * f })) }) },
  ];
  return levers.map((l) => ({
    key: l.key,
    label: l.label,
    minus: r2(project(l.apply(base, 1 - delta)).summary.endingCash - ref),
    plus: r2(project(l.apply(base, 1 + delta)).summary.endingCash - ref),
  }));
}

/**
 * Independent consistency audit used by the QA auditor: recomputes the
 * projection from inputs and compares with stored rows, plus invariants.
 */
export function auditProjection(inputs: FinancialInputs, stored: Pick<MonthRow, "month" | "revenue" | "grossMargin" | "netCashFlow" | "cashBalance">[], tolerance = 0.05) {
  const issues: string[] = [];
  const { rows } = project(inputs);
  if (stored.length !== rows.length) issues.push(`Nombre de mois incohérent (${stored.length} stockés, ${rows.length} attendus).`);
  for (const s of stored) {
    const r = rows.find((x) => x.month === s.month);
    if (!r) continue;
    for (const k of ["revenue", "grossMargin", "netCashFlow", "cashBalance"] as const) {
      if (Math.abs(r[k] - s[k]) > tolerance) issues.push(`Mois ${s.month} : ${k} stocké ${s[k]} ≠ recalculé ${r[k]}.`);
    }
    if (s.grossMargin > s.revenue + tolerance) issues.push(`Mois ${s.month} : marge brute supérieure au chiffre d'affaires.`);
  }
  for (let k = 1; k < stored.length; k++) {
    const prev = stored[k - 1]!, cur = stored[k]!;
    if (Math.abs(prev.cashBalance + cur.netCashFlow - cur.cashBalance) > tolerance) issues.push(`Mois ${cur.month} : trésorerie non cumulative.`);
  }
  return { consistent: issues.length === 0, issues: issues.slice(0, 20) };
}
