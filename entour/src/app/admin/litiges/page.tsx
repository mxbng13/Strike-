"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { PurchaseClaimsAdmin } from "@/components/admin-claims";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Skeleton, Switch, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { formatEUR } from "@/lib/money";

type D = Record<string, unknown>;

export default function DisputesPage() {
  const [all, setAll] = useState(false);
  const { run, pending } = useAction();
  const { data, mutate } = useSWR<{ disputes: D[] }>(`/api/admin/disputes${all ? "?all=1" : ""}`);
  const [form, setForm] = useState<Record<string, { outcome: string; resolution: string; refund: string }>>({});
  const f = (id: string) => form[id] ?? { outcome: "under_review", resolution: "", refund: "" };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Litiges" subtitle="Le paiement reste gelé jusqu'à la décision. Chaque décision est journalisée et notifiée aux deux parties." action={<Switch checked={all} onChange={setAll} label={<span className="text-sm">Historique</span>} />} />
      <PurchaseClaimsAdmin all={all} />
      <h2 className="mb-3 mt-8 text-lg font-bold">Litiges</h2>
      {!data ? (
        <Skeleton className="h-40" />
      ) : data.disputes.length === 0 ? (
        <EmptyState title="Aucun litige en cours" />
      ) : (
        <div className="space-y-3">
          {data.disputes.map((d) => {
            const id = String(d.id);
            const st = f(id);
            const open = ["open", "under_review"].includes(String(d.status));
            return (
              <Card key={id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/missions/${d.service_id}`} className="font-bold text-primary">
                      {String(d.service_title)}
                    </Link>
                    <p className="text-xs text-muted">
                      Demandeur : {String(d.requester_name)} · Intervenant : {String(d.provider_name)} · Ouvert par {String(d.opened_by_name)} le {new Date(String(d.created_at)).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Badge tone={open ? "warning" : "neutral"}>{String(d.status)}</Badge>
                    {d.payment_status ? <Badge tone={d.payment_provider === "simulation" ? "warning" : "primary"}>{String(d.payment_status)} · {formatEUR(Number(d.payment_amount))}</Badge> : <Badge>Sans paiement</Badge>}
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold">{String(d.reason)}</p>
                <p className="whitespace-pre-line text-sm">{String(d.description)}</p>
                {!open && d.resolution ? <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">Décision : {String(d.resolution)}</p> : null}
                {open && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr]">
                    <Field label="Décision">
                      <Select value={st.outcome} onChange={(e) => setForm({ ...form, [id]: { ...st, outcome: e.target.value } })}>
                        <option value="under_review">Mettre en examen</option>
                        <option value="resolved_requester">En faveur du demandeur (remboursement)</option>
                        <option value="resolved_provider">En faveur de l'intervenant (versement)</option>
                        <option value="resolved_split">Partage (remboursement partiel)</option>
                      </Select>
                    </Field>
                    <Field label="Motivation (envoyée aux deux parties)">
                      <Textarea rows={2} value={st.resolution} onChange={(e) => setForm({ ...form, [id]: { ...st, resolution: e.target.value } })} />
                    </Field>
                    {st.outcome === "resolved_split" && (
                      <Field label="Montant remboursé (€)">
                        <Input inputMode="decimal" value={st.refund} onChange={(e) => setForm({ ...form, [id]: { ...st, refund: e.target.value } })} />
                      </Field>
                    )}
                    <div className="flex items-end gap-2 sm:col-span-2">
                      {d.conversation_id ? (
                        <span className="text-xs text-muted">Conversation : {String(d.conversation_id).slice(0, 8)}… (consultable via les signalements si signalée)</span>
                      ) : null}
                      <Button
                        className="ml-auto"
                        disabled={st.resolution.trim().length < 3}
                        loading={pending === id}
                        onClick={() =>
                          run(id, async () => {
                            await api(`/api/admin/disputes/${id}`, { body: { outcome: st.outcome, resolution: st.resolution, refundCents: st.refund ? Math.round(Number(st.refund.replace(",", ".")) * 100) : undefined } });
                            await mutate();
                          }, { success: "Décision enregistrée" })
                        }
                      >
                        Valider la décision
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
