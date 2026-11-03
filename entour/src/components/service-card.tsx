"use client";

import { motion } from "framer-motion";
import { BadgeCheck, CalendarClock, MapPin, Repeat, Users, Zap } from "lucide-react";
import Link from "next/link";
import { formatWhen } from "@/lib/dates";
import { formatDistance } from "@/lib/geo";
import { formatEUR } from "@/lib/money";
import type { ServiceCard as Card } from "@/server/services";
import { CategoryBubble } from "./icons";
import { Avatar, Badge, Stars, cx } from "./ui";

export function priceLabel(s: { pricingType: string; budgetCents: number | null }) {
  if (s.pricingType === "offer") return s.budgetCents ? `≈ ${formatEUR(s.budgetCents, { compact: true })}` : "Faites une offre";
  return formatEUR(s.budgetCents, { compact: true });
}

export function ServiceCardView({ s, index = 0, compact }: { s: Card; index?: number; compact?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.25 }}>
      <Link
        href={`/missions/${s.id}`}
        className={cx("group flex gap-3 rounded-3xl border border-border bg-surface p-3.5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/30", compact ? "w-72 shrink-0" : "")}
      >
        {s.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.imageUrl} alt="" className="size-20 shrink-0 rounded-2xl object-cover" />
        ) : (
          <CategoryBubble icon={s.category.icon} color={s.category.color} size={56} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 font-bold leading-snug">{s.title}</p>
            <span className="shrink-0 rounded-xl bg-primary-soft px-2 py-1 text-sm font-extrabold text-primary">{priceLabel(s)}</span>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-muted">{s.category.name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {s.distanceKm != null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {formatDistance(s.distanceKm)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {s.timingType === "immediate" ? "Maintenant" : formatWhen(s.startsAt ?? null, { withTime: !!s.startsAt })}
            </span>
            {s.peopleNeeded > 1 && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                {s.peopleNeeded} pers.
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-xs">
              <Avatar src={s.requester.avatarUrl} name={s.requester.firstName} size={20} />
              <span className="truncate font-medium">{s.requester.firstName}</span>
              {s.requester.verified && <BadgeCheck className="size-3.5 text-primary" aria-label="Profil vérifié" />}
              <Stars value={s.requester.ratingAvg} count={s.requester.ratingCount} size={12} />
            </span>
            <span className="flex shrink-0 gap-1">
              {s.urgency === "urgent" && (
                <Badge tone="danger" icon={<Zap className="size-3" />}>
                  Urgent
                </Badge>
              )}
              {s.recurrence ? (
                <Badge tone="primary" icon={<Repeat className="size-3" />}>
                  Récurrent
                </Badge>
              ) : null}
              {s.isDemo && <Badge>Démo</Badge>}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
