"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown, Award, BadgeCheck, Check, Clock, Heart, MapPin, MessageCircle, Phone, ShieldCheck, Star, Users, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Icon } from "@/components/icons";
import { useAction } from "@/components/providers";
import { Avatar, Badge, Button, ButtonLink, Card, Confirm, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, Stars, cx } from "@/components/ui";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/dates";
import { formatDistance } from "@/lib/geo";
import { formatEUR } from "@/lib/money";
import type { ApplicationForOwner } from "@/server/applications";
import type { ServiceDetail } from "@/server/services";

type SortKey = "score" | "price" | "rating" | "distance" | "missions";

/** Score de comparaison affiché (explicable) : note bayésienne, expérience, distance, vérifications, prix. */
function compareScore(a: ApplicationForOwner, budget: number | null) {
  const p = a.applicant;
  const bayes = (p.ratingAvg * p.ratingCount + 4.2 * 3) / (p.ratingCount + 3);
  let s = (bayes - 3) * 20;
  s += Math.min(15, Math.log2(1 + p.missionsDone) * 4);
  s += Math.min(10, p.similarDone * 3);
  if (p.distanceKm != null) s += Math.max(0, 10 - p.distanceKm);
  if (p.identityVerified) s += 6;
  if (p.phoneVerified) s += 3;
  if (p.trusted) s += 10;
  if (p.workedWithMe) s += 5;
  if (budget && a.proposedPriceCents != null) s += Math.max(-10, Math.min(8, ((budget - a.proposedPriceCents) / budget) * 20));
  if (p.completionRate != null) s += (p.completionRate - 85) / 3;
  return s;
}

export default function ApplicationsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { run, pending } = useAction();
  const { data: sd } = useSWR<{ service: ServiceDetail }>(`/api/services/${id}`);
  const { data, error, isLoading, mutate } = useSWR<{ applications: ApplicationForOwner[] }>(`/api/services/${id}/applications`);
  const [sort, setSort] = useState<SortKey>("score");
  const [confirm, setConfirm] = useState<ApplicationForOwner | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");

  const s = sd?.service;
  const list = useMemo(() => {
    const apps = data?.applications ?? [];
    const active = apps.filter((a) => ["pending", "waitlisted", "accepted"].includes(a.status));
    const sorted = [...active].sort((a, b) => {
      if (a.status === "accepted" && b.status !== "accepted") return -1;
      if (b.status === "accepted" && a.status !== "accepted") return 1;
      switch (sort) {
        case "price":
          return (a.proposedPriceCents ?? 1e9) - (b.proposedPriceCents ?? 1e9);
        case "rating":
          return b.applicant.ratingAvg * Math.min(b.applicant.ratingCount, 10) - a.applicant.ratingAvg * Math.min(a.applicant.ratingCount, 10);
        case "distance":
          return (a.applicant.distanceKm ?? 99) - (b.applicant.distanceKm ?? 99);
        case "missions":
          return b.applicant.missionsDone - a.applicant.missionsDone;
        default:
          return compareScore(b, s?.budgetCents ?? null) - compareScore(a, s?.budgetCents ?? null);
      }
    });
    return { active: sorted, past: apps.filter((a) => !["pending", "waitlisted", "accepted"].includes(a.status)) };
  }, [data, sort, s?.budgetCents]);

  const bestId = sort === "score" ? list.active.find((a) => a.status !== "accepted")?.id : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader back={`/missions/${id}`} title="Candidatures" subtitle={s ? `${s.title} · ${s.seatsLeft} place${s.seatsLeft > 1 ? "s" : ""} restante${s.seatsLeft > 1 ? "s" : ""} sur ${s.peopleNeeded}` : undefined} />
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {isLoading && <Skeleton className="h-40" />}
      {data && list.active.length === 0 && (
        <EmptyState icon={<Users className="size-7" />} title="Pas encore de réponse" description="Les voisins correspondant à votre demande ont été prévenus. Vous recevrez une notification à chaque réponse." action={<ButtonLink href={`/missions/${id}`} variant="outline">Retour à la demande</ButtonLink>} />
      )}

      {list.active.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
              <ArrowUpDown className="size-4 shrink-0 text-muted" />
              <Segmented
                size="sm"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "score", label: "Pertinence" },
                  { value: "price", label: "Prix" },
                  { value: "rating", label: "Note" },
                  { value: "distance", label: "Distance" },
                  { value: "missions", label: "Expérience" },
                ]}
              />
            </div>
            <Segmented size="sm" value={view} onChange={setView} options={[{ value: "cards", label: "Fiches" }, { value: "table", label: "Comparer" }]} />
          </div>

          {view === "table" ? (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="p-3">Intervenant</th>
                    <th className="p-3">Prix</th>
                    <th className="p-3">Note</th>
                    <th className="p-3">Missions</th>
                    <th className="p-3">Similaires</th>
                    <th className="p-3">Réalisation</th>
                    <th className="p-3">Ponctualité</th>
                    <th className="p-3">Distance</th>
                    <th className="p-3">Vérifié</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {list.active.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0">
                      <td className="p-3">
                        <Link href={`/u/${a.applicant.id}`} className="flex items-center gap-2 font-semibold">
                          <Avatar src={a.applicant.avatarUrl} name={a.applicant.firstName} size={28} /> {a.applicant.firstName}
                        </Link>
                      </td>
                      <td className="p-3 font-bold">{a.proposedPriceCents != null ? formatEUR(a.proposedPriceCents) : "—"}</td>
                      <td className="p-3">
                        <Stars value={a.applicant.ratingAvg} count={a.applicant.ratingCount} size={12} />
                      </td>
                      <td className="p-3">{a.applicant.missionsDone}</td>
                      <td className="p-3">{a.applicant.similarDone}</td>
                      <td className="p-3">{a.applicant.completionRate != null ? `${a.applicant.completionRate} %` : "—"}</td>
                      <td className="p-3">{a.applicant.punctualityRate != null ? `${a.applicant.punctualityRate} %` : "—"}</td>
                      <td className="p-3">{a.applicant.distanceKm != null ? formatDistance(a.applicant.distanceKm) : "—"}</td>
                      <td className="p-3">{a.applicant.identityVerified ? <BadgeCheck className="size-4 text-primary" /> : a.applicant.phoneVerified ? <Phone className="size-4 text-muted" /> : "—"}</td>
                      <td className="p-3 text-right">
                        {a.status === "accepted" ? <Badge tone="success">Retenu</Badge> : <Button size="sm" onClick={() => setConfirm(a)} disabled={(s?.seatsLeft ?? 0) === 0}>Choisir</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence>
                {list.active.map((a, i) => {
                  const p = a.applicant;
                  return (
                    <motion.div key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <Card className={cx("relative p-4", a.status === "accepted" && "border-success", a.id === bestId && "ring-2 ring-primary/40")}>
                        {a.id === bestId && <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-ink">Meilleur profil</span>}
                        <div className="flex items-start gap-3">
                          <Link href={`/u/${p.id}`}>
                            <Avatar src={p.avatarUrl} name={p.firstName} size={52} />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link href={`/u/${p.id}`} className="flex items-center gap-1 font-bold">
                              {p.firstName}
                              {p.identityVerified && <BadgeCheck className="size-4 text-primary" aria-label="Identité vérifiée" />}
                              {p.trusted && <Heart className="size-4 fill-danger text-danger" aria-label="Personne de confiance" />}
                            </Link>
                            <Stars value={p.ratingAvg} count={p.ratingCount} />
                            <p className="text-xs text-muted">Répondu {timeAgo(a.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-extrabold text-primary">{a.proposedPriceCents != null ? formatEUR(a.proposedPriceCents) : "À définir"}</p>
                            <p className="text-xs text-muted">{a.acceptsBudget ? "Accepte votre prix" : "Proposition"}</p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="rounded-xl bg-surface-2 p-2">
                            <p className="font-bold">{p.missionsDone}</p>
                            <p className="text-muted">missions</p>
                          </div>
                          <div className="rounded-xl bg-surface-2 p-2">
                            <p className="font-bold">{p.completionRate != null ? `${p.completionRate}%` : "—"}</p>
                            <p className="text-muted">réalisées</p>
                          </div>
                          <div className="rounded-xl bg-surface-2 p-2">
                            <p className="font-bold">{p.punctualityRate != null ? `${p.punctualityRate}%` : "—"}</p>
                            <p className="text-muted">à l'heure</p>
                          </div>
                          <div className="rounded-xl bg-surface-2 p-2">
                            <p className="font-bold">{p.distanceKm != null ? formatDistance(p.distanceKm) : "—"}</p>
                            <p className="text-muted">distance</p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {p.phoneVerified && <Badge icon={<Phone className="size-3" />}>Téléphone vérifié</Badge>}
                          {p.identityVerified && <Badge tone="primary" icon={<ShieldCheck className="size-3" />}>Identité vérifiée</Badge>}
                          {p.similarDone > 0 && <Badge tone="success" icon={<Award className="size-3" />}>{p.similarDone} mission{p.similarDone > 1 ? "s" : ""} similaire{p.similarDone > 1 ? "s" : ""}</Badge>}
                          {p.skillYears ? <Badge icon={<Clock className="size-3" />}>{p.skillYears} an{p.skillYears > 1 ? "s" : ""} d'expérience</Badge> : null}
                          {p.skillCertified && <Badge tone="success">Compétence certifiée</Badge>}
                          {p.workedWithMe > 0 && <Badge tone="primary">Déjà travaillé ensemble</Badge>}
                          {p.badges.slice(0, 3).map((b) => (
                            <Badge key={b.name} icon={<Icon name={b.icon} className="size-3" />}>
                              {b.name}
                            </Badge>
                          ))}
                        </div>
                        {(a.message || a.experience) && (
                          <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-sm">
                            {a.message && <p className="whitespace-pre-line">{a.message}</p>}
                            {a.experience && <p className="mt-1 text-muted">Expérience : {a.experience}</p>}
                          </div>
                        )}
                        <div className="mt-3 flex gap-2">
                          {a.conversationId && (
                            <ButtonLink href={`/messages/${a.conversationId}`} variant="outline" size="sm" icon={<MessageCircle className="size-4" />}>
                              Discuter
                            </ButtonLink>
                          )}
                          {a.status === "accepted" ? (
                            <Badge tone="success" className="ml-auto self-center" icon={<Check className="size-3" />}>
                              Retenu(e)
                            </Badge>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" loading={pending === `rej-${a.id}`} onClick={() => run(`rej-${a.id}`, async () => { await api(`/api/applications/${a.id}/reject`, { body: {} }); await mutate(); }, { success: "Candidature déclinée" })} icon={<X className="size-4" />}>
                                Décliner
                              </Button>
                              <Button size="sm" className="ml-auto" onClick={() => setConfirm(a)} disabled={(s?.seatsLeft ?? 0) === 0} icon={<Check className="size-4" />}>
                                {a.status === "waitlisted" && (s?.seatsLeft ?? 0) === 0 ? "Liste d'attente" : "Choisir"}
                              </Button>
                            </>
                          )}
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {list.past.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Candidatures déclinées ou retirées ({list.past.length})</summary>
          <div className="mt-3 space-y-2">
            {list.past.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
                <Avatar src={a.applicant.avatarUrl} name={a.applicant.firstName} size={32} />
                <span className="flex-1">{a.applicant.firstName}</span>
                <span className="text-muted">{a.status === "rejected" ? "Déclinée" : "Retirée"}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <Confirm
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Confier la mission à ${confirm?.applicant.firstName} ?`}
        tone="success"
        confirmLabel={`Confirmer${confirm?.proposedPriceCents != null ? ` · ${formatEUR(confirm.proposedPriceCents)}` : ""}`}
        loading={pending === "accept"}
        onConfirm={() =>
          run("accept", async () => {
            const r = await api<{ assignment: { conversationId: string } }>(`/api/applications/${confirm!.id}/accept`, { body: {} });
            setConfirm(null);
            await mutate();
            router.push(`/messages/${r.assignment.conversationId}`);
          }, { success: "Mission confirmée !" })
        }
        description={
          <>
            Le prix convenu sera de <strong>{confirm?.proposedPriceCents != null ? formatEUR(confirm.proposedPriceCents) : "—"}</strong>. L'adresse exacte deviendra visible pour {confirm?.applicant.firstName}. Vous pourrez ensuite sécuriser le paiement depuis la conversation.
          </>
        }
      />
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted">
        <Star className="size-3.5" /> Les notes et statistiques proviennent exclusivement de missions réellement effectuées sur ENTOUR.
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <MapPin className="size-3.5" /> Les distances sont approximatives pour protéger la vie privée de chacun.
      </p>
    </div>
  );
}
