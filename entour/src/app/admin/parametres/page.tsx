"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/providers";
import { Button, Card, Field, Input, PageHeader, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { computeFees, formatEUR } from "@/lib/money";

type S = Record<string, unknown> & { fees: { providerCommissionPct: number; payerServiceFeePct: number; payerServiceFeeFixedCents: number; minFeeCents: number } };

const LABELS: Record<string, string> = {
  subscriptions: "Abonnements (Plus / Pro)",
  boost: "Mise en avant",
  limits: "Limites anti-abus",
  moderation: "Modération automatique",
  loyalty: "Programme de fidélité",
  referral: "Parrainage",
  launch: "Zones de lancement",
  legal: "Version des conditions générales",
};

export default function AdminSettings() {
  const { data, mutate } = useSWR<{ settings: S }>("/api/admin/settings");
  const { run, pending } = useAction();
  const [fees, setFees] = useState<S["fees"] | null>(null);
  const [json, setJson] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    setFees(data.settings.fees);
    setJson(Object.fromEntries(Object.keys(LABELS).map((k) => [k, JSON.stringify(data.settings[k], null, 2)])));
  }, [data]);
  if (!data || !fees) return <Skeleton className="h-96" />;
  const example = computeFees(3000, fees);

  const save = (key: string, value: unknown) =>
    run(key, async () => {
      await api(`/api/admin/settings/${key}`, { body: { value } });
      await mutate();
    }, { success: "Paramètre enregistré (journalisé)" });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Paramètres de la plateforme" subtitle="Chaque modification est journalisée avec son auteur." />
      <Card className="space-y-4 p-5">
        <p className="font-bold">Frais de service</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Commission intervenant (%)">
            <Input inputMode="decimal" value={fees.providerCommissionPct} onChange={(e) => setFees({ ...fees, providerCommissionPct: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Frais demandeur (%)">
            <Input inputMode="decimal" value={fees.payerServiceFeePct} onChange={(e) => setFees({ ...fees, payerServiceFeePct: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Frais fixes demandeur (cts)">
            <Input inputMode="numeric" value={fees.payerServiceFeeFixedCents} onChange={(e) => setFees({ ...fees, payerServiceFeeFixedCents: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Commission minimale (cts)">
            <Input inputMode="numeric" value={fees.minFeeCents} onChange={(e) => setFees({ ...fees, minFeeCents: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          Exemple pour une mission à 30 € : le demandeur paie <strong>{formatEUR(example.totalChargedCents)}</strong>, l'intervenant reçoit <strong>{formatEUR(example.providerNetCents)}</strong>, ENTOUR perçoit <strong>{formatEUR(example.platformFeeCents)}</strong>.
        </p>
        <Button loading={pending === "fees"} onClick={() => save("fees", fees)}>
          Enregistrer les frais
        </Button>
      </Card>
      {Object.entries(LABELS).map(([k, label]) => (
        <Card key={k} className="space-y-3 p-5">
          <p className="font-bold">{label}</p>
          <Textarea className="font-mono text-xs" rows={Math.min(14, (json[k] ?? "").split("\n").length + 1)} value={json[k] ?? ""} onChange={(e) => setJson({ ...json, [k]: e.target.value })} />
          <Button
            variant="secondary"
            loading={pending === k}
            onClick={() => {
              let v: unknown;
              try {
                v = JSON.parse(json[k]);
              } catch {
                return run(k, async () => {
                  throw new Error("JSON invalide");
                });
              }
              save(k, v);
            }}
          >
            Enregistrer
          </Button>
        </Card>
      ))}
    </div>
  );
}
