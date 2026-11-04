"use client";

import { motion } from "framer-motion";
import {
  BadgeCheck,
  CalendarClock,
  Clock,
  Eye,
  Heart,
  HelpCircle,
  Lock,
  MapPin,
  MessageCircle,
  Repeat,
  Rocket,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { MiniMap } from "@/components/mini-map";
import { useAction, useMe, useToast } from "@/components/providers";
import { ReportButton } from "@/components/report-button";
import { priceLabel } from "@/components/service-card";
import { Avatar, BackButton, Badge, Button, ButtonLink, Card, Confirm, ErrorState, Field, Input, Segmented, Sheet, Skeleton, Stars, Textarea } from "@/components/ui";
import { api } from "@/lib/client";
import { formatTimeNeeded, formatWhen, timeAgo } from "@/lib/dates";
import { formatDistance } from "@/lib/geo";
import { formatEUR } from "@/lib/money";
import type { ServiceDetail } from "@/server/services";

const STATUS: Record<string, { label: string; tone: "success" | "primary" | "warning" | "danger" | "neutral" }> = {
  open: { label: "Ouverte", tone: "success" },
  assigned: { label: "Attribuée", tone: "primary" },
  in_progress: { label: "En cours", tone: "primary" },
  completed: { label: "Terminée", tone: "neutral" },
  cancelled: { label: "Annulée", tone: "danger" },
  expired: { label: "Expirée", tone: "neutral" },
  removed: { label: "Retirée", tone: "danger" },
};
const APP_STATUS: Record<string, string> = { pending: "En attente de réponse", accepted: "Acceptée 🎉", rejected: "Non retenue", withdrawn: "Retirée", waitlisted: "En liste d'attente" };

function MissionPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { me, location } = useMe();
  const { push } = useToast();
  const { run, pending } = useAction();
  const invite = sp.get("invite");
  const key = `/api/services/${id}?${new URLSearchParams({ ...(invite ? { invite } : {}), ...(location ? { lat: String(location.lat), lng: String(location.lng) } : {}) })}`;
  const { data, error, isLoading, mutate } = useSWR<{ service: ServiceDetail }>(key);
  const [applyOpen, setApplyOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [fav, setFav] = useState<boolean | null>(null);

  if (error) return <ErrorState error={error} onRetry={() => mutate()} />;
  if (isLoading || !data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-56" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24" />
      </div>
    );

  const s = data.service;
  const v = s.viewer;
  const st = STATUS[s.status] ?? STATUS.open;
  const share = async () => {
    const url = `${location ? window.location.origin : window.location.origin}/missions/${s.id}${s.inviteCode ? `?invite=${s.inviteCode}` : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: s.title, text: `${s.title} — ${priceLabel(s)} sur ENTOUR`, url });
      else {
        await navigator.clipboard.writeText(url);
        push({ tone: "success", title: "Lien copié", body: "Envoyez-le à un proche qui pourrait aider." });
      }
    } catch {
      /* partage annulé */
    }
  };

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <div className="mb-4 flex items-center justify-between">
        <BackButton />
        <div className="flex items-center gap-2">
          {me && !v?.isOwner && (
            <button
              aria-label="Ajouter aux favoris"
              onClick={() =>
                run("fav", async () => {
                  const r = await api<{ active: boolean }>("/api/favorites", { body: { kind: "service", targetId: s.id } });
                  setFav(r.active);
                }, { success: undefined })
              }
              className="flex size-10 items-center justify-center rounded-full border border-border bg-surface"
            >
              <motion.span whileTap={{ scale: 1.4 }}>
                <Heart className={fav ? "size-5 fill-danger text-danger" : "size-5"} />
              </motion.span>
            </button>
          )}
          <button aria-label="Partager" onClick={share} className="flex size-10 items-center justify-center rounded-full border border-border bg-surface">
            <Share2 className="size-5" />
          </button>
        </div>
      </div>

      {s.images.length > 0 && (
        <div className="-mx-4 mb-5 flex snap-x gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          {s.images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-60 w-[85%] shrink-0 snap-center rounded-3xl object-cover sm:w-[60%]" />
          ))}
        </div>
      )}

      {s.moderation === "pending_review" && (
        <div className="mb-4 flex gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-warning">
          <ShieldAlert className="size-5 shrink-0" /> Demande en cours de vérification par l'équipe ENTOUR : elle n'est pas encore visible des autres membres.
        </div>
      )}
      {s.moderation === "rejected" && (
        <div className="mb-4 flex gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          <XCircle className="size-5 shrink-0" /> Demande retirée par la modération{s.cancelReason ? ` : ${s.cancelReason}` : "."}
        </div>
      )}

      <div className="flex items-start gap-4">
        <CategoryBubble icon={s.category.icon} color={s.category.color} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-muted">{s.category.name}</p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{s.title}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={st.tone}>{st.label}</Badge>
            {s.urgency === "urgent" && (
              <Badge tone="danger" icon={<Zap className="size-3" />}>
                Urgent
              </Badge>
            )}
            {s.recurrence ? (
              <Badge tone="primary" icon={<Repeat className="size-3" />}>
                {{ daily: "Tous les jours", weekly: "Chaque semaine", monthly: "Chaque mois" }[(s.recurrence as { freq: string }).freq]}
              </Badge>
            ) : null}
            {s.visibility !== "public" && (
              <Badge icon={<Lock className="size-3" />}>{s.visibility === "invite" ? "Sur invitation" : "Groupe"}</Badge>
            )}
            {s.isGroupBuy && <Badge tone="primary">Demande groupée</Badge>}
            {s.isDemo && <Badge>Donnée de démonstration</Badge>}
          </div>
        </div>
      </div>

      <Card className="mt-5 grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
        {[
          { i: <span className="text-lg font-extrabold text-primary">{priceLabel(s)}</span>, l: { fixed: "Prix fixe", negotiable: "Prix négociable", offer: "Sur proposition" }[s.pricingType] },
          { i: <CalendarClock className="size-5" />, l: s.timingType === "immediate" ? "Maintenant" : formatWhen(s.startsAt, { withTime: !!s.startsAt }) },
          { i: <Timer className="size-5" />, l: `${s.durationExact ? "Horaire précis" : "Estimation"} : ${formatTimeNeeded(s.startsAt, s.durationMinutes, s.durationExact)}` },
          { i: <Users className="size-5" />, l: `${s.peopleNeeded} personne${s.peopleNeeded > 1 ? "s" : ""}${s.peopleNeeded > 1 ? ` · ${s.seatsLeft} place${s.seatsLeft > 1 ? "s" : ""} libre${s.seatsLeft > 1 ? "s" : ""}` : ""}` },
        ].map((x, i) => (
          <div key={i} className="flex flex-col items-center justify-center gap-1 bg-surface p-3 text-center">
            {x.i}
            <span className="text-xs font-medium text-muted">{x.l}</span>
          </div>
        ))}
      </Card>

      <section className="mt-6">
        <h2 className="mb-2 font-bold">Description</h2>
        <p className="whitespace-pre-line leading-relaxed text-text/90">{s.description}</p>
        {s.skillsRequired.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.skillsRequired.map((k) => (
              <Badge key={k} tone="primary">
                {k}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {s.category.safetyNotice && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-primary/20 bg-primary-soft p-4 text-sm">
          <ShieldCheck className="size-5 shrink-0 text-primary" />
          <p>{s.category.safetyNotice}</p>
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 flex items-center justify-between font-bold">
          <span>Lieu</span>
          <span className="flex items-center gap-1 text-sm font-medium text-muted">
            <MapPin className="size-4" /> {s.areaLabel}
            {s.distanceKm != null && ` · ${formatDistance(s.distanceKm)}`}
          </span>
        </h2>
        {s.exactLocation ? (
          <>
            <MiniMap lat={s.exactLocation.lat} lng={s.exactLocation.lng} exact />
            <p className="mt-2 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success">
              <Lock className="mr-1 inline size-4" />
              {s.exactLocation.address ? <strong>{s.exactLocation.address}</strong> : "Adresse exacte"} — visible uniquement par vous{v?.isOwner ? " et les intervenants retenus" : " et le demandeur"}.
            </p>
          </>
        ) : (
          <>
            <MiniMap lat={s.publicLat} lng={s.publicLng} />
            <p className="mt-2 text-xs text-muted">Zone approximative. L'adresse exacte sera communiquée à la personne retenue.</p>
          </>
        )}
      </section>

      <Card className="mt-6 p-4">
        <Link href={`/u/${s.requester.id}`} className="flex items-center gap-3">
          <Avatar src={s.requester.avatarUrl} name={s.requester.firstName} size={52} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-bold">
              {s.requester.firstName}
              {s.requester.phoneVerified && s.requester.identityVerified && <BadgeCheck className="size-4 text-primary" />}
            </p>
            <Stars value={s.requester.ratingAvg} count={s.requester.ratingCount} />
            <p className="text-xs text-muted">
              Membre depuis {new Date(s.requester.memberSince).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} · {s.requester.missionsRequested} demande{s.requester.missionsRequested > 1 ? "s" : ""} aboutie{s.requester.missionsRequested > 1 ? "s" : ""}
            </p>
          </div>
          <span className="text-sm font-semibold text-primary">Profil</span>
        </Link>
      </Card>

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Publiée {timeAgo(s.createdAt)}</span>
        <span>
          {s.applicationsCount} réponse{s.applicationsCount > 1 ? "s" : ""}
        </span>
        {s.viewsCount != null && (
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" /> {s.viewsCount} vue{s.viewsCount > 1 ? "s" : ""}
          </span>
        )}
        {s.boostedUntil && new Date(s.boostedUntil) > new Date() && <span className="font-semibold text-primary">Mise en avant jusqu'à {formatWhen(s.boostedUntil)}</span>}
      </p>
      {me && !v?.isOwner && (
        <div className="mt-3">
          <ReportButton targetType="service" targetId={s.id} label="cette demande" />
        </div>
      )}

      {/* ───────── Actions ───────── */}
      <div className={`fixed inset-x-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 ${me ? "bottom-16 lg:left-64" : "bottom-0"}`}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          {!me && (
            <ButtonLink href={`/connexion?next=${encodeURIComponent(`/missions/${s.id}${invite ? `?invite=${invite}` : ""}`)}`} full size="lg">
              Se connecter pour répondre
            </ButtonLink>
          )}

          {v?.isOwner && (
            <>
              {["open", "assigned", "in_progress"].includes(s.status) && (
                <ButtonLink href={`/missions/${s.id}/candidatures`} className="flex-1" size="lg" icon={<Users className="size-5" />}>
                  Candidatures ({s.applicationsCount})
                </ButtonLink>
              )}
              {s.status === "open" && (
                <Button variant="outline" size="lg" onClick={() => run("boost", async () => { await api(`/api/services/${s.id}/boost`, { body: {} }); await mutate(); }, { success: "Demande mise en avant pendant 24 h (offert)" })} loading={pending === "boost"} icon={<Rocket className="size-4" />}>
                  Booster
                </Button>
              )}
              {["open", "assigned"].includes(s.status) && (
                <Button variant="ghost" size="lg" onClick={() => setCancelOpen(true)}>
                  Annuler
                </Button>
              )}
              {["completed", "expired", "cancelled"].includes(s.status) && (
                <ButtonLink href={`/publier?renouveler=${s.id}`} className="flex-1" size="lg" icon={<Repeat className="size-5" />}>
                  Renouveler cette demande
                </ButtonLink>
              )}
            </>
          )}

          {me && v && !v.isOwner && (
            <>
              {v.myAssignment ? (
                <ButtonLink href={`/messages/${v.myAssignment.conversationId}`} full size="lg" icon={<MessageCircle className="size-5" />}>
                  Mission confirmée — ouvrir la conversation
                </ButtonLink>
              ) : v.myApplication && v.myApplication.status !== "withdrawn" ? (
                <>
                  <div className="flex-1 text-sm">
                    <p className="font-semibold">Votre réponse : {APP_STATUS[v.myApplication.status]}</p>
                    {v.myApplication.proposedPriceCents != null && <p className="text-muted">Tarif proposé : {formatEUR(v.myApplication.proposedPriceCents)}</p>}
                  </div>
                  {v.myApplication.conversationId && (
                    <ButtonLink href={`/messages/${v.myApplication.conversationId}`} icon={<MessageCircle className="size-4" />}>
                      Discuter
                    </ButtonLink>
                  )}
                  {["pending", "waitlisted"].includes(v.myApplication.status) && (
                    <Button variant="ghost" loading={pending === "withdraw"} onClick={() => run("withdraw", async () => { await api(`/api/applications/${v.myApplication!.id}/withdraw`, { body: {} }); await mutate(); }, { success: "Candidature retirée" })}>
                      Retirer
                    </Button>
                  )}
                </>
              ) : ["open", "assigned"].includes(s.status) ? (
                v.eligibility.ok ? (
                  <>
                    <Button variant="outline" size="lg" icon={<HelpCircle className="size-5" />} onClick={() => setQuestionOpen(true)}>
                      Question
                    </Button>
                    <Button size="lg" className="flex-1" onClick={() => setApplyOpen(true)}>
                      {s.seatsLeft === 0 ? "Rejoindre la liste d'attente" : s.pricingType === "offer" ? "Faire une offre" : `Je suis disponible · ${priceLabel(s)}`}
                    </Button>
                  </>
                ) : (
                  <div className="w-full rounded-2xl bg-warning-soft p-3 text-sm text-warning">
                    <p className="font-semibold">Vérifications requises pour cette catégorie</p>
                    <p>{v.eligibility.reasons.join(" · ")}</p>
                    <Link href="/profil/verifications" className="mt-1 inline-block font-semibold underline">
                      Compléter mes vérifications
                    </Link>
                  </div>
                )
              ) : (
                <p className="w-full text-center text-sm text-muted">Cette demande n'accepte plus de réponses.</p>
              )}
            </>
          )}
        </div>
      </div>

      {v?.isOwner && s.assignments.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-bold">Intervenants</h2>
          <div className="space-y-2">
            {s.assignments.map((a) => (
              <Card key={a.id} className="flex items-center gap-3 p-3">
                <Avatar src={a.avatarUrl} name={a.firstName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.firstName}</p>
                  <p className="text-xs text-muted">
                    {formatEUR(a.agreedPriceCents)} · {{ confirmed: "Confirmée", in_progress: "En cours", provider_done: "Terminée par l'intervenant", completed: "Terminée", cancelled: "Annulée", disputed: "Litige" }[a.status]}
                  </p>
                </div>
                {a.conversationId && (
                  <ButtonLink href={`/messages/${a.conversationId}`} size="sm" variant="secondary" icon={<MessageCircle className="size-4" />}>
                    Messages
                  </ButtonLink>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {v?.isOwner && s.visibility === "invite" && s.inviteCode && (
        <Card className="mt-6 p-4">
          <p className="font-semibold">Lien d'invitation privé</p>
          <p className="mt-1 break-all rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs">{`${typeof window !== "undefined" ? window.location.origin : ""}/missions/${s.id}?invite=${s.inviteCode}`}</p>
          <Button className="mt-2" size="sm" variant="secondary" onClick={share}>
            Copier / partager
          </Button>
        </Card>
      )}

      <ApplySheet open={applyOpen} onClose={() => setApplyOpen(false)} s={s} onDone={async (convId) => { await mutate(); router.push(`/messages/${convId}`); }} />

      <QuestionSheet open={questionOpen} onClose={() => setQuestionOpen(false)} serviceId={s.id} onDone={(convId) => router.push(`/messages/${convId}`)} />

      <Confirm
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Annuler la demande ?"
        description="Les personnes ayant répondu seront prévenues. Si une mission est confirmée, l'autorisation de paiement sera levée."
        confirmLabel="Annuler la demande"
        tone="danger"
        loading={pending === "cancel"}
        onConfirm={() =>
          run("cancel", async () => {
            await api(`/api/services/${s.id}/cancel`, { body: { reason: cancelReason } });
            setCancelOpen(false);
            await mutate();
          }, { success: "Demande annulée" })
        }
      >
        <Field label="Motif (facultatif)" className="mt-4">
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ex : j'ai trouvé une solution" />
        </Field>
      </Confirm>
    </div>
  );
}

function ApplySheet({ open, onClose, s, onDone }: { open: boolean; onClose: () => void; s: ServiceDetail; onDone: (conversationId: string) => void }) {
  const [mode, setMode] = useState<"accept" | "offer">(s.pricingType === "offer" || s.budgetCents == null ? "offer" : "accept");
  const [price, setPrice] = useState(s.budgetCents ? String(s.budgetCents / 100) : "");
  const [message, setMessage] = useState("");
  const [experience, setExperience] = useState("");
  const [loading, setLoading] = useState(false);
  const { push } = useToast();
  const canOffer = s.pricingType !== "fixed";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={s.seatsLeft === 0 ? "Rejoindre la liste d'attente" : "Proposer mon aide"}
      footer={
        <Button
          full
          size="lg"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const r = await api<{ conversationId: string }>(`/api/services/${s.id}/apply`, {
                body: { message, experience, acceptsBudget: mode === "accept", proposedPriceCents: mode === "offer" && price ? Math.round(Number(price.replace(",", ".")) * 100) : null },
              });
              push({ tone: "success", title: "Réponse envoyée !", body: "Le demandeur est prévenu. Vous pouvez discuter dans la conversation." });
              onClose();
              onDone(r.conversationId);
            } catch (e) {
              push({ tone: "error", title: (e as Error).message });
            } finally {
              setLoading(false);
            }
          }}
        >
          {mode === "accept" ? `Accepter ${formatEUR(s.budgetCents)}` : "Envoyer ma proposition"}
        </Button>
      }
    >
      <div className="space-y-4">
        {canOffer && s.budgetCents != null && (
          <Segmented
            value={mode}
            onChange={setMode}
            className="w-full"
            options={[
              { value: "accept", label: `Accepter ${formatEUR(s.budgetCents)}` },
              { value: "offer", label: "Proposer un tarif" },
            ]}
          />
        )}
        {mode === "offer" && (
          <Field label="Votre tarif" hint={`Repère : ${formatEUR(s.priceSuggestion.lowCents)} – ${formatEUR(s.priceSuggestion.highCents)}${s.priceSuggestion.basis === "reference" ? " (indicatif)" : ""}`}>
            <div className="relative max-w-[200px]">
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, ""))} className="pr-10 text-lg font-bold" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-muted">€</span>
            </div>
          </Field>
        )}
        <Field label="Message au demandeur" hint="Présentez-vous en quelques mots et précisez vos disponibilités.">
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="Bonjour ! Je suis disponible ce soir et j'ai l'habitude de…" />
        </Field>
        <Field label="Votre expérience (facultatif)">
          <Input value={experience} onChange={(e) => setExperience(e.target.value)} maxLength={600} placeholder="Ex : 3 ans de baby-sitting, BAFA" />
        </Field>
        <p className="flex items-start gap-2 text-xs text-muted">
          <Clock className="mt-0.5 size-3.5 shrink-0" /> Rien n'est engagé tant que le demandeur ne vous a pas choisi(e). Le paiement passe exclusivement par ENTOUR.
        </p>
      </div>
    </Sheet>
  );
}

function QuestionSheet({ open, onClose, serviceId, onDone }: { open: boolean; onClose: () => void; serviceId: string; onDone: (c: string) => void }) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const { push } = useToast();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Poser une question"
      footer={
        <Button
          full
          loading={loading}
          disabled={!body.trim()}
          onClick={async () => {
            setLoading(true);
            try {
              const r = await api<{ conversationId: string }>(`/api/services/${serviceId}/question`, { body: { body } });
              onClose();
              onDone(r.conversationId);
            } catch (e) {
              push({ tone: "error", title: (e as Error).message });
            } finally {
              setLoading(false);
            }
          }}
        >
          Envoyer
        </Button>
      }
    >
      <Textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ex : Faut-il apporter du matériel ?" maxLength={1000} />
      <p className="mt-2 text-xs text-muted">Une conversation privée s'ouvre avec le demandeur, sans engagement.</p>
    </Sheet>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MissionPage />
    </Suspense>
  );
}
