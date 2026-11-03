"use client";

import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Skeleton, cx } from "@/components/ui";
import { formatDuration } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import type { MyAssignment } from "@/server/assignments";

const WD = ["L", "M", "M", "J", "V", "S", "D"];
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function CalendarPage() {
  const { data } = useSWR<{ assignments: MyAssignment[] }>("/api/missions");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState(() => new Date());
  const events = useMemo(() => (data?.assignments ?? []).filter((a) => a.startsAt && a.status !== "cancelled"), [data]);
  const byDay = useMemo(() => {
    const m = new Map<string, MyAssignment[]>();
    for (const e of events) {
      const k = key(new Date(e.startsAt!));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [events]);

  const first = new Date(cursor);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    return day >= 1 && day <= daysInMonth ? new Date(cursor.getFullYear(), cursor.getMonth(), day) : null;
  });
  const dayEvents = (byDay.get(key(selected)) ?? []).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  const upcoming = events.filter((e) => new Date(e.startsAt!) >= new Date() && e.status !== "completed").sort((a, b) => a.startsAt!.localeCompare(b.startsAt!)).slice(0, 5);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader back="/mes-missions" title="Calendrier" subtitle="Vos missions planifiées, comme demandeur ou intervenant. Un rappel est envoyé 1 h avant." />
      {!data ? (
        <Skeleton className="h-80" />
      ) : (
        <>
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <button aria-label="Mois précédent" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="rounded-full p-2 hover:bg-surface-2">
                <ChevronLeft className="size-5" />
              </button>
              <p className="font-bold capitalize">{cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
              <button aria-label="Mois suivant" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="rounded-full p-2 hover:bg-surface-2">
                <ChevronRight className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
              {WD.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <span key={i} />;
                const evs = byDay.get(key(d)) ?? [];
                const isSel = key(d) === key(selected);
                const isToday = key(d) === key(new Date());
                return (
                  <button key={i} onClick={() => setSelected(d)} className={cx("flex aspect-square flex-col items-center justify-center rounded-2xl text-sm transition", isSel ? "bg-primary text-primary-ink" : isToday ? "bg-primary-soft font-bold text-primary" : "hover:bg-surface-2")}>
                    {d.getDate()}
                    <span className="mt-0.5 flex gap-0.5">
                      {evs.slice(0, 3).map((e) => (
                        <span key={e.id} className={cx("size-1.5 rounded-full", isSel ? "bg-primary-ink" : e.role === "provider" ? "bg-success" : "bg-primary")} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-success" /> Je rends service
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-primary" /> On m'aide
              </span>
            </p>
          </Card>

          <section>
            <h2 className="mb-2 font-bold capitalize">{selected.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</h2>
            {dayEvents.length === 0 ? (
              <p className="rounded-2xl bg-surface-2 px-4 py-4 text-sm text-muted">Rien de prévu ce jour-là.</p>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((e) => (
                  <Card key={e.id} className="flex items-center gap-3 p-3.5">
                    <div className="w-14 text-center">
                      <p className="font-extrabold">{new Date(e.startsAt!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                      {e.durationMinutes && <p className="text-xs text-muted">{formatDuration(e.durationMinutes)}</p>}
                    </div>
                    <CategoryBubble icon={e.category.icon} color={e.category.color} size={40} />
                    <Link href={`/missions/${e.serviceId}`} className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.title}</p>
                      <p className="text-xs text-muted">
                        {e.role === "provider" ? `Chez ${e.other.firstName}` : `Avec ${e.other.firstName}`} · {e.areaLabel} · {formatEUR(e.agreedPriceCents)}
                      </p>
                    </Link>
                    {e.conversationId && (
                      <ButtonLink href={`/messages/${e.conversationId}`} size="sm" variant="outline" icon={<MessageCircle className="size-4" />}>
                        <span className="sr-only">Messages</span>
                      </ButtonLink>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-bold">Prochaines missions</h2>
            {upcoming.length === 0 ? (
              <EmptyState title="Aucune mission à venir" description="Vos missions confirmées s'afficheront ici." />
            ) : (
              <div className="space-y-2">
                {upcoming.map((e) => (
                  <Link key={e.id} href={`/missions/${e.serviceId}`} className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
                    <span className="truncate font-semibold">{e.title}</span>
                    <Badge tone={e.role === "provider" ? "success" : "primary"}>{new Date(e.startsAt!).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
