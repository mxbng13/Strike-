"use client";

import { Check, Crown } from "lucide-react";
import useSWR from "swr";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, PageHeader, SimulationBanner, Skeleton, cx } from "@/components/ui";
import { api } from "@/lib/client";
import { formatEUR } from "@/lib/money";

type Plan = { priceCents: number; label: string; perks: string[]; commissionPct: number };
type D = { subscription: { plan: "plus" | "pro"; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; provider: string } | null; plans: Record<"plus" | "pro", Plan>; provider: string };

export default function PremiumPage() {
  const { data, mutate } = useSWR<D>("/api/subscriptions");
  const { run, pending } = useAction();
  if (!data) return <Skeleton className="h-96" />;
  const sub = data.subscription;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader back="/profil" title="ENTOUR Plus & Pro" subtitle="L'application reste entièrement utilisable gratuitement. Les abonnements s'adressent aux membres très actifs." />
      {data.provider === "simulation" && <SimulationBanner />}
      {data.provider === "stripe" && <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">Les abonnements payants ouvriront prochainement.</p>}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-5">
          <p className="font-bold">Gratuit</p>
          <p className="mt-1 text-3xl font-extrabold">0 €</p>
          <ul className="mt-4 space-y-2 text-sm">
            {["Publier et répondre sans limite raisonnable", "Messagerie complète", "Paiement sécurisé", "Commission standard sur les revenus"].map((p) => (
              <li key={p} className="flex gap-2">
                <Check className="size-4 shrink-0 text-success" /> {p}
              </li>
            ))}
          </ul>
          {!sub && <Badge className="mt-4">Votre formule</Badge>}
        </Card>
        {(["plus", "pro"] as const).map((k) => {
          const p = data.plans[k];
          const mine = sub?.plan === k;
          return (
            <Card key={k} className={cx("p-5", k === "pro" && "border-primary")}>
              <p className="flex items-center gap-1.5 font-bold">
                <Crown className="size-4 text-[#F5B014]" /> {p.label}
              </p>
              <p className="mt-1 text-3xl font-extrabold">
                {formatEUR(p.priceCents)}
                <span className="text-sm font-medium text-muted"> /mois</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {p.perks.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check className="size-4 shrink-0 text-success" /> {x}
                  </li>
                ))}
              </ul>
              {mine ? (
                <div className="mt-4 space-y-2">
                  <Badge tone="success">Actif{sub.provider === "simulation" ? " (simulation)" : ""} jusqu'au {new Date(sub.currentPeriodEnd).toLocaleDateString("fr-FR")}</Badge>
                  {!sub.cancelAtPeriodEnd && (
                    <Button size="sm" variant="ghost" loading={pending === "cancel"} onClick={() => run("cancel", async () => { await api("/api/subscriptions", { method: "DELETE" }); await mutate(); }, { success: "Abonnement résilié à la fin de la période" })}>
                      Résilier
                    </Button>
                  )}
                </div>
              ) : (
                <Button className="mt-4" full disabled={!!sub || data.provider !== "simulation"} loading={pending === k} onClick={() => run(k, async () => { await api("/api/subscriptions", { body: { plan: k } }); await mutate(); }, { success: "Abonnement simulé activé" })}>
                  {data.provider === "simulation" ? "Essayer (simulation)" : "Bientôt disponible"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
