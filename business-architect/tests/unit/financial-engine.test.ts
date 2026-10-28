import { describe, it, expect } from "vitest";
import { project, scenarios, sensitivity, auditProjection, unitEconomics, type FinancialInputs } from "@/financial/engine";

const base: FinancialInputs = {
  horizonMonths: 12,
  startingCash: 1000,
  setupCosts: [{ label: "Nom de domaine + outils", amount: 100 }],
  fixedMonthlyCosts: [{ label: "Hébergement", amount: 20 }, { label: "Logiciels", amount: 30 }],
  revenueModel: "subscription",
  price: 50,
  ordersPerCustomerPerMonth: 1,
  variableCostRate: 0.1,
  variableCostPerUnit: 0,
  paymentFeeRate: 0.015,
  paymentFeeFixed: 0.25,
  monthlyMarketingBudget: 100,
  cac: 50,
  organicNewCustomersPerMonth: 1,
  launchMonth: 2,
  monthlyChurn: 0.05,
  organicGrowthRate: 0,
  capacityLimit: 0,
};

describe("Financial Engine (déterministe)", () => {
  it("calcule l'économie unitaire", () => {
    const ue = unitEconomics(base);
    // 50 - 5 (10 %) - 0.75 (1.5 %) - 0.25 = 44
    expect(ue.contribution).toBeCloseTo(44, 6);
  });

  it("mois 1 : pas de clients, coûts de lancement et fixes uniquement", () => {
    const { rows } = project(base);
    expect(rows[0]).toMatchObject({ month: 1, customers: 0, revenue: 0, setup: 100, acquisition: 0, netCashFlow: -150, cashBalance: 850 });
  });

  it("mois 2 : 3 nouveaux clients (1 organique + 100/50 payants)", () => {
    const { rows } = project(base);
    expect(rows[1]!.newCustomers).toBe(3);
    expect(rows[1]!.revenue).toBe(150);
    // margin 3*44 = 132 ; net = 132 - 50 - 100 = -18
    expect(rows[1]!.netCashFlow).toBe(-18);
    expect(rows[1]!.cashBalance).toBe(832);
  });

  it("la trésorerie est cumulative et l'audit indépendant est cohérent", () => {
    const { rows } = project(base);
    expect(auditProjection(base, rows)).toEqual({ consistent: true, issues: [] });
  });

  it("l'audit détecte une incohérence de calcul", () => {
    const { rows } = project(base);
    const tampered = rows.map((r) => (r.month === 5 ? { ...r, revenue: r.revenue * 2 } : r));
    const a = auditProjection(base, tampered);
    expect(a.consistent).toBe(false);
    expect(a.issues[0]).toMatch(/Mois 5 : revenue/);
  });

  it("seuil de rentabilité, LTV/CAC et besoin de financement", () => {
    const { summary } = project(base);
    expect(summary.breakEvenCustomers).toBe(Math.ceil(150 / 44));
    expect(summary.ltv).toBeCloseTo(44 / 0.05, 2);
    expect(summary.ltvToCac).toBeCloseTo(17.6, 2);
    expect(summary.breakEvenMonth).not.toBeNull();
    expect(summary.financingNeed).toBe(0);
  });

  it("signale un besoin de financement quand la trésorerie devient négative", () => {
    const { summary } = project({ ...base, startingCash: 0, monthlyMarketingBudget: 500, cac: 400 });
    expect(summary.minCashBalance).toBeLessThan(0);
    expect(summary.financingNeed).toBe(-summary.minCashBalance);
  });

  it("scénarios ordonnés : pessimiste ≤ base ≤ optimiste", () => {
    const s = scenarios(base);
    const end = (k: keyof typeof s) => project(s[k]).summary.endingCash;
    expect(end("pessimistic")).toBeLessThan(end("base"));
    expect(end("base")).toBeLessThan(end("optimistic"));
  });

  it("sensibilité : un prix plus élevé améliore la trésorerie, un CAC plus élevé la dégrade", () => {
    const s = sensitivity(base);
    expect(s.find((x) => x.key === "price")!.plus).toBeGreaterThan(0);
    expect(s.find((x) => x.key === "cac")!.plus).toBeLessThan(0);
  });

  it("respecte une capacité maximale (services)", () => {
    const { rows } = project({ ...base, capacityLimit: 4, horizonMonths: 24 });
    expect(Math.max(...rows.map((r) => r.customers))).toBeLessThanOrEqual(4.0001);
  });

  it("rejette des entrées invalides", () => {
    expect(() => project({ ...base, price: -1 })).toThrow();
    expect(() => project({ ...base, monthlyChurn: 2 })).toThrow();
  });

  it("modèle à l'acte : achats répétés", () => {
    const { rows } = project({ ...base, revenueModel: "one_off", price: 20, ordersPerCustomerPerMonth: 2, monthlyChurn: 0.5 });
    expect(rows[1]!.revenue).toBe(3 * 20 * 2);
  });
});
