"use client";

import { CalendarClock, ClipboardList, MessageCircle, Repeat, Star, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { useMode } from "@/components/providers";
import { Avatar, Badge, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, Stars } from "@/components/ui";
import { formatWhen } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import type { MyAssignment } from "@/server/assignments";

type Req = Record<string, unknown>;
type App = { id: string; status: string; proposedPriceCents: number | null; createdAt: string; conversationId: string | null; serviceId: string; title: string; serviceStatus: string; startsAt: string | null; categoryName: string; categoryIcon: string; categoryColor: string; requesterName: string };
type Person = { id: string; first_name: string; avatar_url: string | null; rating_avg: number; rating_count: number; missions: number };

const A_STATUS: Record<string, [string, "primary" | "success" | "warning" | "danger" | "neutral"]> = {
  confirmed: ["Confirmée", "primary"],
  in_progress: ["En cours", "primary"],
  provider_done: ["À valider", "warning"],
  completed: ["Terminée", "success"],
  cancelled: ["Annulée", "danger"],
  disputed: ["Litige", "danger"],
};
const S_STATUS: Record<string, [string, "primary" | "success" | "warning" | "danger" | "neutral"]> = {
  open: ["Ouverte", "success"],
  assigned: ["Attribuée", "primary"],
  in_progress: ["En cours", "primary"],
  completed: ["Terminée", "neutral"],
  cancelled: ["Annulée", "danger"],
  expired: ["Expirée", "neutral"],
  removed: ["Retirée", "danger"],
};
const APP_STATUS: Record<string, [string, "primary" | "success" | "warning" | "danger" | "neutral"]> = {
  pending: ["En attente", "warning"],
  accepted: ["Acceptée", "success"],
  rejected: ["Refusée", "danger"],
  withdrawn: ["Retirée", "neutral"],
  waitlisted: ["Liste d'attente", "primary"],
};

function AssignmentRow({ a }: { a: MyAssignment }) {
  const [label, tone] = A_STATUS[a.status] ?? ["", "neutral"];
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <CategoryBubble icon={a.category.icon} color={a.category.color} size={44} />
      <Link href={`/missions/${a.serviceId}`} className="min-w-0 flex-1">
        <p className="truncate font-semibold">{a.title}</p>
        <p className="truncate text-xs text-muted">
          {a.role === "provider" ? `Pour ${a.other.firstName}` : `Par ${a.other.firstName}`} · {formatWhen(a.startsAt)} · {formatEUR(a.agreedPriceCents)}
        </p>
        <div className="mt-1 flex gap-1.5">
          <Badge tone={tone}>{label}</Badge>
          {a.paymentProvider === "simulation" && <Badge tone="warning">Paiement simulé</Badge>}
        </div>
      </Link>
      <div className="flex shrink-0 flex-col gap-1.5">
        {a.status === "completed" && !a.reviewed && (
          <ButtonLink href={`/avis/${a.id}`} size="sm" icon={<Star className="size-4" />}>
            Noter
          </ButtonLink>
        )}
        {a.conversationId && (
          <ButtonLink href={`/messages/${a.conversationId}`} size="sm" variant="outline" icon={<MessageCircle className="size-4" />}>
            <span className="sr-only">Messages</span>
          </ButtonLink>
        )}
      </div>
    </Card>
  );
}

export default function MyMissions() {
  const { mode } = useMode();
  const [tab, setTab] = useState<"active" | "requests" | "applications" | "history" | "people">(mode === "offreur" ? "active" : "requests");
  const { data, error, isLoading, mutate } = useSWR<{ assignments: MyAssignment[]; requests: Req[]; applications: App[]; people: Person[] }>("/api/missions");
  const active = data?.assignments.filter((a) => ["confirmed", "in_progress", "provider_done", "disputed"].includes(a.status)) ?? [];
  const history = data?.assignments.filter((a) => ["completed", "cancelled"].includes(a.status)) ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mes missions" action={<ButtonLink href="/calendrier" variant="outline" size="sm" icon={<CalendarClock className="size-4" />}>Calendrier</ButtonLink>} />
      <div className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none">
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: `En cours (${active.length})` },
            { value: "requests", label: "Mes demandes" },
            { value: "applications", label: "Candidatures" },
            { value: "history", label: "Historique" },
            { value: "people", label: "Personnes" },
          ]}
        />
      </div>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {isLoading && <Skeleton className="h-40" />}
      {data && (
        <div className="space-y-2">
          {tab === "active" &&
            (active.length ? active.map((a) => <AssignmentRow key={a.id} a={a} />) : <EmptyState icon={<ClipboardList className="size-7" />} title="Aucune mission en cours" description="Les missions confirmées, en tant que demandeur ou intervenant, apparaîtront ici." action={<ButtonLink href="/explorer">Trouver une mission</ButtonLink>} />)}
          {tab === "history" &&
            (history.length ? history.map((a) => <AssignmentRow key={a.id} a={a} />) : <EmptyState title="Pas encore d'historique" description="Vos missions terminées et annulées apparaîtront ici." />)}
          {tab === "requests" &&
            (data.requests.length ? (
              data.requests.map((r) => {
                const [label, tone] = S_STATUS[String(r.status)] ?? ["", "neutral"];
                return (
                  <Card key={String(r.id)} className="flex items-center gap-3 p-3.5">
                    <CategoryBubble icon={String(r.category_icon)} color={String(r.category_color)} size={44} />
                    <Link href={`/missions/${r.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{String(r.title)}</p>
                      <p className="text-xs text-muted">
                        {String(r.category_name)} · {formatWhen(r.starts_at as string | null)} · {r.budget_cents != null ? formatEUR(Number(r.budget_cents)) : "Sur proposition"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone={tone}>{label}</Badge>
                        {r.moderation === "pending_review" && <Badge tone="warning">En vérification</Badge>}
                        {Number(r.pending_apps) > 0 && <Badge tone="primary">{String(r.pending_apps)} réponse(s) à examiner</Badge>}
                      </div>
                    </Link>
                    {["open", "assigned"].includes(String(r.status)) ? (
                      <ButtonLink href={`/missions/${r.id}/candidatures`} size="sm" variant="secondary" icon={<Users className="size-4" />}>
                        {String(r.assigned)}/{String(r.people_needed)}
                      </ButtonLink>
                    ) : (
                      <ButtonLink href={`/publier?renouveler=${r.id}`} size="sm" variant="outline" icon={<Repeat className="size-4" />}>
                        Renouveler
                      </ButtonLink>
                    )}
                  </Card>
                );
              })
            ) : (
              <EmptyState title="Aucune demande publiée" description="Besoin d'un coup de main ? Publiez votre première demande en moins d'une minute." action={<ButtonLink href="/publier">Publier</ButtonLink>} />
            ))}
          {tab === "applications" &&
            (data.applications.length ? (
              data.applications.map((a) => {
                const [label, tone] = APP_STATUS[a.status] ?? ["", "neutral"];
                return (
                  <Card key={a.id} className="flex items-center gap-3 p-3.5">
                    <CategoryBubble icon={a.categoryIcon} color={a.categoryColor} size={44} />
                    <Link href={`/missions/${a.serviceId}`} className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.title}</p>
                      <p className="text-xs text-muted">
                        {a.requesterName} · {formatWhen(a.startsAt)} · {a.proposedPriceCents != null ? formatEUR(a.proposedPriceCents) : "—"}
                      </p>
                      <Badge tone={tone} className="mt-1">
                        {label}
                      </Badge>
                    </Link>
                    {a.conversationId && (
                      <ButtonLink href={`/messages/${a.conversationId}`} size="sm" variant="outline" icon={<MessageCircle className="size-4" />}>
                        <span className="sr-only">Messages</span>
                      </ButtonLink>
                    )}
                  </Card>
                );
              })
            ) : (
              <EmptyState title="Aucune candidature" description="Répondez aux demandes de vos voisins pour gagner de l'argent en rendant service." action={<ButtonLink href="/explorer">Voir les demandes</ButtonLink>} />
            ))}
          {tab === "people" &&
            (data.people.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {data.people.map((p) => (
                  <Link key={p.id} href={`/u/${p.id}`} className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5">
                    <Avatar src={p.avatar_url} name={p.first_name} size={44} />
                    <div className="flex-1">
                      <p className="font-semibold">{p.first_name}</p>
                      <Stars value={Number(p.rating_avg)} count={Number(p.rating_count)} size={12} />
                    </div>
                    <span className="text-xs text-muted">
                      {p.missions} mission{p.missions > 1 ? "s" : ""} ensemble
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Personne pour l'instant" description="Les personnes avec qui vous avez réalisé une mission apparaîtront ici, pour les retrouver facilement." />
            ))}
        </div>
      )}
    </div>
  );
}
