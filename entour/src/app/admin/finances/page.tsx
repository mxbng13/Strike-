"use client";

import useSWR from "swr";
import { HBars } from "@/components/charts";
import { Badge, Card, PageHeader, Skeleton, Stat } from "@/components/ui";
import { formatEUR } from "@/lib/money";

type P = { months: { month: string; provider: string; feesCents: number; gmvCents: number; payments: number }[]; subscriptions: { plan: string; provider: string; count: number; mrrCents: number }[] };
type Pay = { p: { id: string; amountCents: number; feeCents: number; status: string; provider: string; createdAt: string }; payer: string };

export default function Finances() {
  const { data } = useSWR<{ profitability: P }>("/api/admin/profitability");
  const { data: pays } = useSWR<{ payments: Pay[] }>("/api/admin/payments");
  if (!data) return <Skeleton className="h-96" />;
  const live = data.profitability.months.filter((m) => m.provider === "stripe");
  const sim = data.profitability.months.filter((m) => m.provider === "simulation");
  const sum = (l: typeof live, k: "feesCents" | "gmvCents") => l.reduce((s, m) => s + m[k], 0);
  const mrrLive = data.profitability.subscriptions.filter((s) => s.provider === "stripe").reduce((s, x) => s + x.mrrCents, 0);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Finances & rentabilité" subtitle="Seules les opérations Stripe constituent des revenus réels. Les opérations simulées sont présentées à part." />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Volume réel (12 mois)" value={formatEUR(sum(live, "gmvCents"))} />
        <Stat label="Commissions réelles (12 mois)" value={formatEUR(sum(live, "feesCents"))} />
        <Stat label="Revenu mensuel abonnements" value={formatEUR(mrrLive)} />
        <Stat label="Volume simulé" value={formatEUR(sum(sim, "gmvCents"))} hint="Non comptabilisé" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">Commissions réelles par mois</p>
          <HBars data={live.map((m) => ({ label: m.month, value: m.feesCents }))} format={(n) => formatEUR(n)} />
        </Card>
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">Commissions simulées par mois</p>
          <HBars data={sim.map((m) => ({ label: m.month, value: m.feesCents }))} format={(n) => formatEUR(n)} color="var(--chart-2)" />
        </Card>
      </div>
      <section>
        <h2 className="mb-2 font-bold">Derniers paiements</h2>
        <Card className="divide-y divide-border">
          {pays?.payments.length === 0 && <p className="p-4 text-sm text-muted">Aucun paiement.</p>}
          {pays?.payments.map(({ p, payer }) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono text-xs text-muted">{p.id.slice(0, 8)}</span>
              <span className="flex-1 truncate">{payer}</span>
              <span className="font-semibold">{formatEUR(p.amountCents)}</span>
              <span className="text-muted">frais {formatEUR(p.feeCents)}</span>
              <Badge tone={p.status === "captured" ? "success" : p.status === "authorized" ? "primary" : "neutral"}>{p.status}</Badge>
              <Badge tone={p.provider === "simulation" ? "warning" : "primary"}>{p.provider}</Badge>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
