"use client";

import useSWR from "swr";
import { Card, PageHeader, Skeleton } from "@/components/ui";

type L = { l: { id: number; action: string; targetType: string | null; targetId: string | null; details: Record<string, unknown>; ip: string | null; createdAt: string }; firstName: string | null };

export default function LogsPage() {
  const { data } = useSWR<{ logs: L[] }>("/api/admin/logs");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Journal des actions administratives" subtitle="Journal en ajout seul : aucune entrée ne peut être modifiée ni supprimée (contrainte en base de données)." />
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="p-3">Date</th>
                <th className="p-3">Administrateur</th>
                <th className="p-3">Action</th>
                <th className="p-3">Cible</th>
                <th className="p-3">Détails</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map(({ l, firstName }) => (
                <tr key={l.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap p-3 text-muted">{new Date(l.createdAt).toLocaleString("fr-FR")}</td>
                  <td className="p-3">{firstName ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{l.action}</td>
                  <td className="p-3 font-mono text-xs">
                    {l.targetType}:{l.targetId?.slice(0, 8)}
                  </td>
                  <td className="max-w-md truncate p-3 font-mono text-xs text-muted" title={JSON.stringify(l.details)}>
                    {JSON.stringify(l.details)}
                  </td>
                </tr>
              ))}
              {data.logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted">
                    Aucune action enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
