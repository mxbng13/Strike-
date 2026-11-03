"use client";

import { AlertTriangle, Flag, Gavel, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { DailyBars, HBars } from "@/components/charts";
import { Card, ErrorState, PageHeader, Skeleton, Stat, Switch } from "@/components/ui";
import { formatEUR } from "@/lib/money";

type Stats = {
  users: number;
  newUsers7d: number;
  active30d: number;
  services: number;
  servicesOpen: number;
  servicesCompleted: number;
  servicesCancelled: number;
  servicesHeld: number;
  volumeLiveCents: number;
  revenueLiveCents: number;
  volumeSimCents: number;
  revenueSimCents: number;
  disputesOpen: number;
  reportsOpen: number;
  verificationsPending: number;
  subscriptionsActive: number;
  topCategories: { name: string; n: number }[];
  byArea: { area: string; n: number }[];
  daily: { day: string; services: number; users: number }[];
};

export default function AdminDashboard() {
  const [demo, setDemo] = useState(false);
  const { data, error, mutate } = useSWR<{ stats: Stats }>(`/api/admin/dashboard${demo ? "?demo=1" : ""}`, { refreshInterval: 60_000 });
  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  const s = data?.stats;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Tableau de bord" subtitle="Indicateurs calculés en direct à partir de la base de données." action={<Switch checked={demo} onChange={setDemo} label={<span className="text-sm">Inclure les données de démo</span>} />} />
      {!s ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          {(s.servicesHeld > 0 || s.reportsOpen > 0 || s.disputesOpen > 0 || s.verificationsPending > 0) && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { n: s.servicesHeld, l: "annonces à vérifier", href: "/admin/moderation", i: AlertTriangle },
                { n: s.verificationsPending, l: "vérifications en attente", href: "/admin/moderation", i: ShieldCheck },
                { n: s.reportsOpen, l: "signalements ouverts", href: "/admin/signalements", i: Flag },
                { n: s.disputesOpen, l: "litiges en cours", href: "/admin/litiges", i: Gavel },
              ]
                .filter((x) => x.n > 0)
                .map((x) => (
                  <Link key={x.l} href={x.href} className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-3.5 text-sm text-warning">
                    <x.i className="size-5" />
                    <span>
                      <strong className="text-lg">{x.n}</strong> {x.l}
                    </span>
                  </Link>
                ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat icon={<Users className="size-3.5" />} label="Utilisateurs" value={s.users} hint={`+${s.newUsers7d} sur 7 jours`} />
            <Stat label="Actifs (30 j)" value={s.active30d} />
            <Stat label="Demandes publiées" value={s.services} hint={`${s.servicesOpen} ouvertes`} />
            <Stat label="Terminées / annulées" value={`${s.servicesCompleted} / ${s.servicesCancelled}`} />
            <Stat label="Volume réel (Stripe)" value={formatEUR(s.volumeLiveCents)} />
            <Stat label="Revenus réels" value={formatEUR(s.revenueLiveCents)} hint="Commissions capturées" />
            <Stat label="Volume simulé" value={formatEUR(s.volumeSimCents)} hint="Non comptabilisé" />
            <Stat label="Abonnements actifs" value={s.subscriptionsActive} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <DailyBars label="Nouvelles demandes par jour (30 j)" data={s.daily.map((d) => ({ day: d.day, value: d.services }))} color="var(--chart-1)" />
            </Card>
            <Card className="p-5">
              <DailyBars label="Nouveaux inscrits par jour (30 j)" data={s.daily.map((d) => ({ day: d.day, value: d.users }))} color="var(--chart-2)" />
            </Card>
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold">Catégories les plus demandées</p>
              <HBars data={s.topCategories.map((c) => ({ label: c.name, value: c.n }))} />
            </Card>
            <Card className="p-5">
              <p className="mb-3 text-sm font-semibold">Répartition géographique (demandes)</p>
              <HBars data={s.byArea.map((c) => ({ label: c.area, value: c.n }))} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
