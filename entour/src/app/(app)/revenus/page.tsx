"use client";

import { ArrowDownLeft, ArrowUpRight, Banknote, Info, Landmark } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, EmptyState, PageHeader, SimulationBanner, Skeleton, Stat, cx } from "@/components/ui";
import { api } from "@/lib/client";
import { formatEUR } from "@/lib/money";

type Tx = { id: string; type: string; amountCents: number; label: string; provider: string; createdAt: string; serviceTitle: string; serviceId: string };
type Data = {
  summary: { earnedCents: number; earnedMonthCents: number; earnedYearCents: number; earningTransactionsYear: number; spentCents: number; pendingCents: number; hasSimulation: boolean; months: { month: string; earned: number; spent: number }[] };
  transactions: Tx[];
  payout: { provider: string; isLive: boolean; account: { chargesEnabled: boolean; payoutsEnabled: boolean } | null };
};

export default function MoneyPage() {
  const { data, mutate } = useSWR<Data>("/api/transactions");
  const { run, pending } = useAction();
  if (!data) return <Skeleton className="h-96" />;
  const s = data.summary;
  const max = Math.max(1, ...s.months.flatMap((m) => [m.earned, m.spent]));
  // Seuils de déclaration automatique par les plateformes (DAC7 / art. 242 bis CGI) : 30 transactions ou 2 000 € par an
  const nearThreshold = s.earningTransactionsYear >= 20 || s.earnedYearCents >= 150000;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader back="/profil" title="Revenus & dépenses" />
      {(data.payout.provider === "simulation" || s.hasSimulation) && <SimulationBanner />}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Gagné ce mois-ci" value={formatEUR(s.earnedMonthCents)} />
        <Stat label="Gagné cette année" value={formatEUR(s.earnedYearCents)} hint={`${s.earningTransactionsYear} mission(s) payée(s)`} />
        <Stat label="En attente de versement" value={formatEUR(s.pendingCents)} hint="Missions en cours" />
        <Stat label="Dépensé au total" value={formatEUR(s.spentCents)} />
      </div>

      <Card className="p-5">
        <h2 className="mb-4 font-bold">12 derniers mois</h2>
        {s.months.length === 0 ? (
          <p className="text-sm text-muted">Aucune transaction pour l'instant.</p>
        ) : (
          <div className="flex h-40 items-end gap-2">
            {s.months.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-[2px]">
                  <div className="w-1/2 rounded-t-[4px] bg-chart-2" style={{ height: `${(m.earned / max) * 100}%` }} title={`Gagné : ${formatEUR(m.earned)}`} />
                  <div className="w-1/2 rounded-t-[4px] bg-chart-1" style={{ height: `${(m.spent / max) * 100}%` }} title={`Dépensé : ${formatEUR(m.spent)}`} />
                </div>
                <span className="text-[10px] text-muted">{new Date(`${m.month}-01`).toLocaleDateString("fr-FR", { month: "short" })}</span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-chart-2" /> Revenus
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-chart-1" /> Dépenses
          </span>
        </p>
      </Card>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Landmark className="size-6 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Réception des paiements</p>
          <p className="text-sm text-muted">
            {data.payout.account?.payoutsEnabled
              ? data.payout.provider === "simulation"
                ? "Compte de versement simulé actif."
                : "Votre compte de versement Stripe est actif."
              : "Activez votre compte de versement pour être payé(e) pour vos missions."}
          </p>
        </div>
        {!data.payout.account?.payoutsEnabled && (
          <Button
            loading={pending === "payout"}
            onClick={() =>
              run("payout", async () => {
                const r = await api<{ onboardingUrl: string | null }>("/api/payouts", { body: {} });
                if (r.onboardingUrl) window.location.href = r.onboardingUrl;
                else await mutate();
              }, { success: data.payout.provider === "simulation" ? "Compte de versement simulé activé" : undefined })
            }
          >
            Activer
          </Button>
        )}
      </Card>

      <div className={cx("flex gap-3 rounded-2xl p-4 text-sm", nearThreshold ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted")}>
        <Info className="size-5 shrink-0" />
        <p>
          Les revenus perçus via ENTOUR peuvent être imposables et, selon votre situation, soumis à cotisations sociales. Conformément à la réglementation (article 242 bis du CGI, directive DAC7), ENTOUR communique chaque année à l'administration fiscale les revenus des utilisateurs ayant réalisé au moins 30 transactions ou perçu au moins 2 000 €.{" "}
          <Link href="/legal/cgu#fiscalite" className="font-semibold underline">
            En savoir plus
          </Link>
        </p>
      </div>

      <section>
        <h2 className="mb-2 font-bold">Historique des transactions</h2>
        {data.transactions.length === 0 ? (
          <EmptyState icon={<Banknote className="size-7" />} title="Aucune transaction" description="Les paiements de vos missions apparaîtront ici." />
        ) : (
          <Card className="divide-y divide-border">
            {data.transactions.map((t) => {
              const positive = t.amountCents > 0;
              return (
                <Link key={t.id} href={`/missions/${t.serviceId}`} className="flex items-center gap-3 px-4 py-3">
                  <span className={cx("flex size-9 items-center justify-center rounded-xl", positive ? "bg-success-soft text-success" : "bg-surface-2 text-text")}>{positive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.serviceTitle}</p>
                    <p className="text-xs text-muted">
                      {t.label} · {new Date(t.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cx("font-bold", positive && "text-success")}>
                      {positive ? "+" : "−"}
                      {formatEUR(Math.abs(t.amountCents))}
                    </p>
                    {t.provider === "simulation" && <Badge tone="warning">Simulation</Badge>}
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
