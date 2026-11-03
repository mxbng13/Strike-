"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton, Switch } from "@/components/ui";
import { api } from "@/lib/client";
import { REPORT_REASONS } from "@/lib/validators";

type R = { r: { id: string; targetType: string; targetId: string; targetUserId: string | null; reason: string; details: string; status: string; resolution: string | null; createdAt: string }; reporterName: string };

function Preview({ type, id }: { type: string; id: string }) {
  const { data } = useSWR<{ preview: { label: string; body: string } | null }>(`/api/admin/reports/${id}/preview?type=${type}`);
  if (!data) return null;
  if (!data.preview) return <p className="text-xs text-muted">Élément introuvable (supprimé ?)</p>;
  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
      <p className="font-semibold">{data.preview.label}</p>
      <p className="line-clamp-4 whitespace-pre-line text-muted">{data.preview.body}</p>
    </div>
  );
}

export default function ReportsPage() {
  const [all, setAll] = useState(false);
  const { run, pending } = useAction();
  const { data, mutate } = useSWR<{ reports: R[] }>(`/api/admin/reports${all ? "?all=1" : ""}`);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = (id: string, decision: "actioned" | "dismissed" | "reviewing") =>
    run(`${decision}-${id}`, async () => {
      await api(`/api/admin/reports/${id}`, { body: { decision, resolution: notes[id] ?? "" } });
      await mutate();
    }, { success: "Signalement traité" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Signalements" action={<Switch checked={all} onChange={setAll} label={<span className="text-sm">Afficher l'historique</span>} />} />
      {!data ? (
        <Skeleton className="h-40" />
      ) : data.reports.length === 0 ? (
        <EmptyState title="Aucun signalement en attente" />
      ) : (
        <div className="space-y-3">
          {data.reports.map(({ r, reporterName }) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">
                  {REPORT_REASONS[r.reason] ?? r.reason} <span className="font-normal text-muted">· {r.targetType}</span>
                </p>
                <div className="flex items-center gap-2 text-xs text-muted">
                  par {reporterName} · {new Date(r.createdAt).toLocaleString("fr-FR")}
                  <Badge tone={r.status === "open" ? "warning" : r.status === "actioned" ? "danger" : "neutral"}>{r.status}</Badge>
                </div>
              </div>
              {r.details && <p className="mt-1 text-sm">« {r.details} »</p>}
              <Preview type={r.targetType} id={r.targetId} />
              <div className="mt-2 flex gap-3 text-sm">
                {r.targetUserId && (
                  <Link href={`/admin/utilisateurs/${r.targetUserId}`} className="font-semibold text-primary">
                    Fiche de la personne signalée →
                  </Link>
                )}
                {r.targetType === "service" && (
                  <Link href={`/missions/${r.targetId}`} className="font-semibold text-primary">
                    Voir l'annonce →
                  </Link>
                )}
              </div>
              {["open", "reviewing"].includes(r.status) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input placeholder="Résolution / note interne" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} className="max-w-md flex-1" />
                  {r.status === "open" && (
                    <Button variant="outline" loading={pending === `reviewing-${r.id}`} onClick={() => decide(r.id, "reviewing")}>
                      Prendre en charge
                    </Button>
                  )}
                  <Button variant="danger" loading={pending === `actioned-${r.id}`} onClick={() => decide(r.id, "actioned")}>
                    Sanctionner le contenu
                  </Button>
                  <Button variant="ghost" loading={pending === `dismissed-${r.id}`} onClick={() => decide(r.id, "dismissed")}>
                    Classer sans suite
                  </Button>
                </div>
              ) : (
                r.resolution && <p className="mt-2 text-sm text-muted">Résolution : {r.resolution}</p>
              )}
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">« Sanctionner le contenu » masque l'avis, la publication ou le message, ou retire l'annonce. Pour suspendre la personne, ouvrez sa fiche.</p>
    </div>
  );
}
