"use client";

import { CheckCircle2, HelpCircle, ImageIcon, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { useAction } from "./providers";
import { Badge, Button, Card, Input } from "./ui";
import { api } from "@/lib/client";
import { formatEUR } from "@/lib/money";

type C = Record<string, unknown> & { analysis: { source: string; totalCents?: number | null; merchant?: string | null; date?: string | null; readable?: boolean; consistent?: boolean | null; notes?: string } };

/** Signalements « client injoignable » : preuve d'achat, analyse, décision. */
export function PurchaseClaimsAdmin({ all }: { all: boolean }) {
  const { data, mutate } = useSWR<{ claims: C[] }>(`/api/admin/purchase-claims${all ? "?all=1" : ""}`);
  const { run, pending } = useAction();
  const [form, setForm] = useState<Record<string, { amount: string; note: string }>>({});
  if (!data) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Achats avancés — client injoignable ({data.claims.length})</h2>
      {data.claims.length === 0 && <p className="rounded-2xl bg-surface-2 px-4 py-5 text-sm text-muted">Aucun signalement en attente.</p>}
      {data.claims.map((c) => {
        const id = String(c.id);
        const f = form[id] ?? { amount: String(Number(c.claimed_cents) / 100), note: "" };
        const a = c.analysis;
        const open = c.status === "pending";
        return (
          <Card key={id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/missions/${c.service_id}`} className="font-bold text-primary">
                  {String(c.service_title)}
                </Link>
                <p className="text-xs text-muted">
                  Intervenant : {String(c.provider_name)} · Demandeur : {String(c.requester_name)} · {new Date(String(c.created_at)).toLocaleString("fr-FR")}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge tone={open ? "warning" : c.status === "approved" ? "success" : "neutral"}>{String(c.status)}</Badge>
                <Badge tone={c.payment_provider === "simulation" ? "warning" : "primary"}>Tirelire {formatEUR(Number(c.escrow_cents))}</Badge>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr]">
              <a href={`/api/files/${c.receipt_key}`} target="_blank" rel="noreferrer" className="flex min-h-32 items-center justify-center overflow-hidden rounded-2xl bg-surface-2">
                {/\.(jpg|png|webp|gif)$/.test(String(c.receipt_key)) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${c.receipt_key}`} alt="Preuve d'achat" className="max-h-56 object-contain" />
                ) : (
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <ImageIcon className="size-5" /> Ouvrir la preuve
                  </span>
                )}
              </a>
              <div className="space-y-2 text-sm">
                <p>
                  Achats prévus : <strong>{formatEUR(Number(c.purchase_cents))}</strong>
                  {c.purchase_note ? ` (${String(c.purchase_note)})` : ""} · Montant réclamé : <strong>{formatEUR(Number(c.claimed_cents))}</strong>
                </p>
                <p className="text-muted">Dernier message du demandeur : {c.requester_last_message ? new Date(String(c.requester_last_message)).toLocaleString("fr-FR") : "aucun"}</p>
                {c.note ? <p className="rounded-xl bg-surface-2 p-3">« {String(c.note)} »</p> : null}
                <div className="rounded-xl border border-border p-3">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {a.consistent === true ? <CheckCircle2 className="size-4 text-success" /> : a.consistent === false ? <XCircle className="size-4 text-danger" /> : <HelpCircle className="size-4 text-muted" />}
                    Analyse {a.source === "claude" ? "automatique du ticket" : "automatique indisponible"}
                  </p>
                  {a.source === "claude" && (
                    <p className="mt-1 text-muted">
                      Total lu : {a.totalCents != null ? formatEUR(a.totalCents) : "illisible"} · Enseigne : {a.merchant ?? "?"} · Date : {a.date ?? "?"} · {a.consistent ? "cohérent avec le montant réclamé" : "à vérifier"}
                    </p>
                  )}
                  {a.notes && <p className="mt-1 text-muted">{a.notes}</p>}
                </div>
                {open ? (
                  <div className="flex flex-wrap items-end gap-2 pt-1">
                    <label className="text-xs font-semibold">
                      Remboursement (€)
                      <Input inputMode="decimal" value={f.amount} onChange={(e) => setForm({ ...form, [id]: { ...f, amount: e.target.value } })} className="mt-1 w-28" />
                    </label>
                    <Input placeholder="Motif communiqué aux deux parties" value={f.note} onChange={(e) => setForm({ ...form, [id]: { ...f, note: e.target.value } })} className="min-w-48 flex-1" />
                    <Button variant="success" loading={pending === `ok-${id}`} onClick={() => run(`ok-${id}`, async () => { await api(`/api/admin/purchase-claims/${id}`, { body: { approve: true, refundCents: Math.round(Number(f.amount.replace(",", ".")) * 100), note: f.note } }); await mutate(); }, { success: "Achats remboursés à l'intervenant" })}>
                      Rembourser les achats
                    </Button>
                    <Button variant="ghost" loading={pending === `no-${id}`} onClick={() => run(`no-${id}`, async () => { await api(`/api/admin/purchase-claims/${id}`, { body: { approve: false, note: f.note } }); await mutate(); }, { success: "Signalement refusé" })}>
                      Refuser
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted">
                    Décision : {c.status === "approved" ? `${formatEUR(Number(c.refunded_cents))} remboursés` : "refusé"}
                    {c.decision_note ? ` — ${String(c.decision_note)}` : ""}
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
      <p className="text-xs text-muted">Seul le prix des achats est versé, sans commission ; le reste de la tirelire revient au demandeur. Chaque décision est journalisée.</p>
    </section>
  );
}
