"use client";

import { AlertTriangle, CalendarClock, Camera, Check, ChevronDown, CircleDollarSign, Clock, CreditCard, Flag, Loader2, PiggyBank, Play, ShieldCheck, Star, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, uploadFile } from "@/lib/client";
import { MoneyBreakdown } from "./fees";
import { formatDuration, formatWhen } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { CategoryBubble } from "./icons";
import { useAction, useToast } from "./providers";
import { Badge, Button, Confirm, Field, Input, Select, Sheet, SimulationBanner, Textarea, cx } from "./ui";

export type MissionCtx = {
  serviceId: string;
  title: string;
  category: { name: string; icon: string; color: string };
  serviceStatus: string;
  budgetCents: number | null;
  purchaseCents: number;
  purchaseNote: string | null;
  pricingType: string;
  startsAt: string | null;
  durationMinutes: number | null;
  role: "requester" | "provider";
  application: { id: string; status: string; proposedPriceCents: number | null } | null;
  assignment: { id: string; status: string; agreedPriceCents: number; lateMinutes: number | null; providerDoneAt: string | null; priceConfirmedByProvider: boolean; priceConfirmedByRequester: boolean } | null;
  pendingOffers: { id: string; kind: "price" | "schedule"; amountCents: number | null; proposedStartsAt: string | null; note: string | null; mine: boolean }[];
  payment: { id: string; status: string; provider: string; amountCents: number; feeCents: number; purchaseCents: number } | null;
  claim: { id: string; status: string; claimedCents: number; refundedCents: number | null; decisionNote: string | null } | null;
  reviewed: boolean;
  dispute: { id: string; status: string } | null;
};

const ASSIGN_STATUS: Record<string, { label: string; tone: "primary" | "success" | "warning" | "danger" | "neutral" }> = {
  confirmed: { label: "Confirmée", tone: "primary" },
  in_progress: { label: "En cours", tone: "primary" },
  provider_done: { label: "À valider", tone: "warning" },
  completed: { label: "Terminée", tone: "success" },
  cancelled: { label: "Annulée", tone: "danger" },
  disputed: { label: "Litige en cours", tone: "danger" },
};
const PAY_STATUS: Record<string, string> = {
  requires_payment: "Paiement à sécuriser",
  authorized: "Paiement sécurisé",
  captured: "Payé",
  refunded: "Remboursé",
  partially_refunded: "Partiellement remboursé",
  cancelled: "Paiement annulé",
  failed: "Paiement refusé",
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MissionBox({ m, conversationId, otherName, onChange }: { m: MissionCtx; conversationId: string; otherName: string; onChange: () => void }) {
  const { run, pending } = useAction();
  const { push } = useToast();
  const [open, setOpen] = useState(true);
  const [sheet, setSheet] = useState<null | "price" | "schedule" | "late" | "cancel" | "dispute" | "pay" | "complete" | "claim">(null);
  const [receipt, setReceipt] = useState<{ key: string; url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [claimAmount, setClaimAmount] = useState(m.purchaseCents ? String(m.purchaseCents / 100) : "");
  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState(toLocalInput(new Date(Date.now() + 3600_000)));
  const [note, setNote] = useState("");
  const [late, setLate] = useState("10");
  const [reason, setReason] = useState("");
  const [disputeReason, setDisputeReason] = useState("Prestation non réalisée");
  const [simPayment, setSimPayment] = useState<{ paymentId: string; fees: { totalChargedCents: number; platformFeeCents: number; providerNetCents: number } } | null>(null);

  const a = m.assignment;
  const isReq = m.role === "requester";
  const price = a?.agreedPriceCents ?? m.application?.proposedPriceCents ?? m.budgetCents;
  const active = a && ["confirmed", "in_progress", "provider_done"].includes(a.status);
  const paySecured = m.payment && ["authorized", "captured"].includes(m.payment.status);
  const act = (key: string, path: string, body: unknown = {}, success?: string) =>
    run(key, async () => {
      await api(path, { body });
      setSheet(null);
      onChange();
    }, { success });

  const offerFor = (kind: "price" | "schedule") =>
    act(`offer-${kind}`, `/api/conversations/${conversationId}/offers`, kind === "price" ? { kind, amountCents: Math.round(Number(amount.replace(",", ".")) * 100), note: note || undefined } : { kind, startsAt: new Date(when).toISOString(), note: note || undefined }, "Proposition envoyée");

  return (
    <div className="border-b border-border bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
        <CategoryBubble icon={m.category.icon} color={m.category.color} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{m.title}</p>
          <p className="flex items-center gap-2 truncate text-xs text-muted">
            <span className="font-semibold text-primary">{price != null ? formatEUR(price) : "Prix à définir"}</span>· {formatWhen(m.startsAt)}
            {m.durationMinutes ? ` · ${formatDuration(m.durationMinutes)}` : ""}
          </p>
        </div>
        {a ? (
          <Badge tone={ASSIGN_STATUS[a.status]?.tone ?? "neutral"}>{ASSIGN_STATUS[a.status]?.label}</Badge>
        ) : m.application ? (
          <Badge tone={m.application.status === "pending" ? "warning" : "neutral"}>{{ pending: "Candidature", waitlisted: "Liste d'attente", rejected: "Non retenue", withdrawn: "Retirée", accepted: "Acceptée" }[m.application.status]}</Badge>
        ) : (
          <Badge>Question</Badge>
        )}
        <ChevronDown className={cx("size-4 text-muted transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-2.5 px-4 pb-3">
          {/* Propositions en attente */}
          {m.pendingOffers.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft p-3 text-sm">
              {o.kind === "price" ? <CircleDollarSign className="size-4 text-primary" /> : <CalendarClock className="size-4 text-primary" />}
              <span className="flex-1">
                {o.mine ? "Vous proposez" : `${otherName} propose`} {o.kind === "price" ? <strong>{formatEUR(o.amountCents)}</strong> : <strong>{formatWhen(o.proposedStartsAt)}</strong>}
                {o.note && <span className="block text-xs text-muted">« {o.note} »</span>}
              </span>
              {o.mine ? (
                <span className="text-xs text-muted">En attente de réponse</span>
              ) : (
                <>
                  <Button size="sm" variant="outline" loading={pending === `rej-${o.id}`} onClick={() => act(`rej-${o.id}`, `/api/offers/${o.id}`, { accept: false })}>
                    Refuser
                  </Button>
                  <Button size="sm" variant="success" loading={pending === `acc-${o.id}`} icon={<Check className="size-4" />} onClick={() => act(`acc-${o.id}`, `/api/offers/${o.id}`, { accept: true }, "Proposition acceptée")}>
                    Accepter
                  </Button>
                </>
              )}
            </div>
          ))}

          {m.payment && (
            <div className={cx("flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium", paySecured ? "bg-success-soft text-success" : "bg-surface-2 text-muted")}>
              <ShieldCheck className="size-4" /> {PAY_STATUS[m.payment.status]} · {formatEUR(m.payment.amountCents)}
              {m.payment.provider === "simulation" && <span className="ml-auto rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">Simulation</span>}
            </div>
          )}
          {m.purchaseCents > 0 && (
            <div className={cx("flex items-start gap-2 rounded-xl px-3 py-2 text-xs", paySecured ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
              <PiggyBank className="size-4 shrink-0" />
              <span>
                Achats à avancer : <strong>{formatEUR(m.purchaseCents)}</strong>
                {m.purchaseNote ? ` (${m.purchaseNote})` : ""}.{" "}
                {paySecured
                  ? isReq
                    ? "La tirelire est remplie."
                    : "La tirelire est remplie : vous pouvez acheter. Gardez le ticket."
                  : isReq
                    ? `Remplissez la tirelire pour que ${otherName} puisse acheter.`
                    : "N'achetez rien tant que la tirelire n'est pas remplie."}
              </span>
            </div>
          )}
          {m.claim?.status === "pending" && <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">Signalement « client injoignable » en cours d'examen par ENTOUR (preuve d'achat de {formatEUR(m.claim.claimedCents)}).</p>}
          {m.claim?.status === "approved" && <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">ENTOUR a remboursé {formatEUR(m.claim.refundedCents)} d'achats à l'intervenant.</p>}
          {m.claim?.status === "rejected" && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Signalement non retenu{m.claim.decisionNote ? ` : ${m.claim.decisionNote}` : ""}.</p>}
          {a?.status === "provider_done" && isReq && (
            <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">{otherName} indique avoir terminé. Vérifiez puis confirmez la fin de mission pour libérer le paiement.</p>
          )}
          {m.dispute && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Litige en cours d'examen par l'équipe ENTOUR. Le paiement est gelé.</p>}

          {/* Actions rapides */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
            {!a && isReq && m.application && ["pending", "waitlisted"].includes(m.application.status) && (
              <Button size="sm" variant="success" icon={<Check className="size-4" />} loading={pending === "choose"} onClick={() => act("choose", `/api/applications/${m.application!.id}/accept`, {}, "Mission confirmée !")}>
                Choisir {otherName}
              </Button>
            )}
            {(!a || active) && !paySecured && (
              <Button size="sm" variant="outline" icon={<CircleDollarSign className="size-4" />} onClick={() => { setAmount(price != null ? String(price / 100) : ""); setSheet("price"); }}>
                {a ? "Modifier le prix" : "Proposer un prix"}
              </Button>
            )}
            {(!a || active) && (
              <Button size="sm" variant="outline" icon={<CalendarClock className="size-4" />} onClick={() => setSheet("schedule")}>
                Changer l'horaire
              </Button>
            )}
            {active && a && (isReq ? !a.priceConfirmedByRequester : !a.priceConfirmedByProvider) && (
              <Button size="sm" variant="outline" onClick={() => act("cprice", `/api/assignments/${a.id}/confirm-price`, {}, "Prix confirmé")}>
                Confirmer le prix
              </Button>
            )}
            {active && a && (
              <Button size="sm" variant="outline" onClick={() => act("csched", `/api/assignments/${a.id}/confirm-schedule`, {}, "Horaire confirmé")}>
                Confirmer l'horaire
              </Button>
            )}
            {active && a && isReq && !paySecured && (
              <Button
                size="sm"
                icon={<CreditCard className="size-4" />}
                loading={pending === "pay"}
                onClick={() =>
                  run("pay", async () => {
                    const r = await api<{ paymentId: string; provider: string; redirectUrl: string | null; fees: { totalChargedCents: number; platformFeeCents: number; providerNetCents: number } }>(`/api/assignments/${a.id}/pay`, { body: {} });
                    if (r.redirectUrl) window.location.href = r.redirectUrl;
                    else {
                      setSimPayment({ paymentId: r.paymentId, fees: r.fees });
                      setSheet("pay");
                    }
                  })
                }
              >
                {m.purchaseCents > 0 ? "Remplir la tirelire" : "Sécuriser le paiement"}
              </Button>
            )}
            {a?.status === "confirmed" && !isReq && (
              <Button size="sm" icon={<Play className="size-4" />} loading={pending === "start"} onClick={() => act("start", `/api/assignments/${a.id}/start`, {}, "Mission démarrée")}>
                Démarrer
              </Button>
            )}
            {a && ["confirmed", "in_progress"].includes(a.status) && (
              <Button size="sm" variant="outline" icon={<Clock className="size-4" />} onClick={() => setSheet("late")}>
                Signaler un retard
              </Button>
            )}
            {a && ["confirmed", "in_progress"].includes(a.status) && !isReq && (
              <Button size="sm" variant="success" icon={<Check className="size-4" />} loading={pending === "done"} onClick={() => act("done", `/api/assignments/${a.id}/done`, {}, "Le demandeur a été prévenu")}>
                J'ai terminé
              </Button>
            )}
            {active && a && isReq && (
              <Button size="sm" variant="success" icon={<Check className="size-4" />} onClick={() => setSheet("complete")}>
                Confirmer la fin
              </Button>
            )}
            {a?.status === "completed" && !m.reviewed && (
              <Link href={`/avis/${a.id}`} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-ink">
                <Star className="size-4" /> Laisser un avis
              </Link>
            )}
            {active && a && (
              <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setSheet("cancel")}>
                Annuler la mission
              </Button>
            )}
            {active && a && !isReq && m.purchaseCents > 0 && paySecured && m.claim?.status !== "pending" && (
              <Button size="sm" variant="ghost" icon={<Camera className="size-4" />} onClick={() => setSheet("claim")}>
                Client injoignable ?
              </Button>
            )}
            {a && ["confirmed", "in_progress", "provider_done", "completed"].includes(a.status) && !m.dispute && (
              <Button size="sm" variant="ghost" icon={<Flag className="size-4" />} onClick={() => setSheet("dispute")}>
                Litige
              </Button>
            )}
            <Link href={`/missions/${m.serviceId}`} className="inline-flex h-9 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-primary">
              Fiche mission →
            </Link>
          </div>
        </div>
      )}

      {/* ───── Fenêtres ───── */}
      <Sheet open={sheet === "price"} onClose={() => setSheet(null)} title="Proposer un prix" footer={<Button full loading={pending === "offer-price"} disabled={!(Number(amount.replace(",", ".")) >= 0) || !amount} onClick={() => offerFor("price")}>Envoyer la proposition</Button>}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{otherName} devra accepter ce nouveau montant. Le changement sera enregistré dans la conversation.</p>
          <div className="relative max-w-[220px]">
            <Input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} className="pr-10 text-lg font-bold" />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted">€</span>
          </div>
          <Field label="Note (facultatif)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex : il y a 2 étages sans ascenseur" />
          </Field>
        </div>
      </Sheet>

      <Sheet open={sheet === "schedule"} onClose={() => setSheet(null)} title="Proposer un autre horaire" footer={<Button full loading={pending === "offer-schedule"} onClick={() => offerFor("schedule")}>Envoyer la proposition</Button>}>
        <div className="space-y-4">
          <Field label="Nouvelle date et heure">
            <Input type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Note (facultatif)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </Field>
        </div>
      </Sheet>

      <Sheet open={sheet === "late"} onClose={() => setSheet(null)} title="Signaler un retard" footer={<Button full loading={pending === "late"} onClick={() => act("late", `/api/assignments/${a?.id}/late`, { minutes: Number(late) }, `${otherName} a été prévenu(e)`)}>Prévenir {otherName}</Button>}>
        <Field label="Retard estimé">
          <Select value={late} onChange={(e) => setLate(e.target.value)}>
            {[5, 10, 15, 20, 30, 45, 60, 90].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </Select>
        </Field>
      </Sheet>

      <Confirm
        open={sheet === "cancel"}
        onClose={() => setSheet(null)}
        title="Annuler la mission ?"
        tone="danger"
        confirmLabel="Annuler la mission"
        loading={pending === "cancel"}
        onConfirm={() => (reason.trim().length < 3 ? push({ tone: "error", title: "Indiquez un motif" }) : act("cancel", `/api/assignments/${a?.id}/cancel`, { reason }, "Mission annulée"))}
        description="L'annulation est visible dans votre historique de fiabilité. Si un paiement a été sécurisé, il est automatiquement levé ou remboursé."
      >
        <Field label="Motif (obligatoire)" className="mt-4">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </Confirm>

      <Confirm
        open={sheet === "complete"}
        onClose={() => setSheet(null)}
        title="Confirmer la fin de mission ?"
        tone="success"
        confirmLabel="Oui, c'est terminé"
        loading={pending === "complete"}
        onConfirm={() => act("complete", `/api/assignments/${a?.id}/complete`, {}, "Mission terminée 🎉")}
        description={paySecured ? `Le paiement de ${formatEUR(m.payment!.amountCents)} sera versé à ${otherName}.` : "Aucun paiement n'a été sécurisé via ENTOUR pour cette mission."}
      />

      <Sheet
        open={sheet === "dispute"}
        onClose={() => setSheet(null)}
        title="Ouvrir un litige"
        footer={<Button full variant="danger" loading={pending === "dispute"} onClick={() => act("dispute", `/api/assignments/${a?.id}/dispute`, { reason: disputeReason, description: note }, "Litige ouvert : notre équipe vous recontacte")}>Ouvrir le litige</Button>}
      >
        <div className="space-y-4">
          <p className="flex gap-2 text-sm text-muted">
            <AlertTriangle className="size-4 shrink-0 text-warning" /> Essayez d'abord de trouver une solution avec {otherName}. Un litige gèle le paiement jusqu'à la décision de l'équipe.
          </p>
          <Field label="Motif">
            <Select value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}>
              {["Prestation non réalisée", "Prestation incomplète ou mal réalisée", "Absence / retard important", "Désaccord sur le prix", "Dommage matériel", "Comportement inapproprié", "Autre"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description détaillée" hint="20 caractères minimum">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={3000} />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "claim"}
        onClose={() => setSheet(null)}
        title="Le client ne répond plus ?"
        footer={
          <Button
            full
            loading={pending === "claim"}
            disabled={!receipt || !(Number(claimAmount.replace(",", ".")) > 0)}
            onClick={() =>
              act("claim", `/api/assignments/${a?.id}/purchase-claim`, { receiptKey: receipt!.key, claimedCents: Math.round(Number(claimAmount.replace(",", ".")) * 100), note }, "Preuve envoyée à ENTOUR")
            }
          >
            Envoyer la preuve à ENTOUR
          </Button>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Vous avez avancé les achats et {otherName} ne répond plus ? Envoyez la photo du ticket. ENTOUR l'analyse et, si tout concorde, vous rembourse <strong className="text-text">le prix des achats</strong> (jusqu'à {formatEUR(m.purchaseCents)}) depuis la tirelire. La rémunération n'est pas versée si la mission n'a pas eu lieu.
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-border p-4">
            {uploading ? <Loader2 className="size-6 animate-spin text-muted" /> : <Camera className="size-6 text-primary" />}
            <span className="flex-1">{receipt ? <strong>{receipt.name}</strong> : "Photo ou PDF du ticket de caisse"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  const r = await uploadFile(f, "message", conversationId);
                  setReceipt({ key: r.key, url: r.url, name: r.fileName });
                } catch (err) {
                  push({ tone: "error", title: (err as Error).message });
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          {receipt && receipt.url && /\.(jpg|png|webp)$/.test(receipt.key) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receipt.url} alt="Ticket" className="max-h-48 rounded-2xl object-contain" />
          )}
          <Field label="Montant payé (€)">
            <Input inputMode="decimal" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value.replace(/[^\d,.]/g, ""))} className="w-32" />
          </Field>
          <Field label="Ce qui s'est passé">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Ex. : commande récupérée à 19 h 40, plus de réponse depuis, personne à l'adresse." />
          </Field>
          <p className="text-xs text-muted">Possible uniquement si {otherName} n'a pas écrit depuis au moins 2 heures. Les faux signalements entraînent la suspension du compte.</p>
        </div>
      </Sheet>

      <Sheet open={sheet === "pay"} onClose={() => setSheet(null)} title={m.purchaseCents > 0 ? "Remplir la tirelire" : "Sécuriser le paiement"}>
        {simPayment && (
          <div className="space-y-4">
            <SimulationBanner />
            <MoneyBreakdown serviceCents={a?.agreedPriceCents ?? 0} purchaseCents={m.purchaseCents} perspective="requester" otherName={otherName} />
            <p className="text-sm text-muted">En production, cette étape ouvre la page de paiement sécurisée de notre prestataire (Stripe). Le montant est seulement bloqué, puis prélevé à la confirmation de fin de mission.</p>
            <Button full size="lg" loading={pending === "sim"} onClick={() => act("sim", `/api/payments/${simPayment.paymentId}/simulate`, {}, "Paiement simulé sécurisé")}>
              Confirmer le paiement simulé
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
