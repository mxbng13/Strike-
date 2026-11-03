"use client";

import { BadgeCheck, CalendarDays, CheckCircle2, Clock, Mail, MapPin, Phone, ShieldCheck, Star } from "lucide-react";
import { CategoryBubble, Icon } from "./icons";
import { Avatar, Badge, Card, Stars } from "./ui";
import { formatEUR } from "@/lib/money";
import { timeAgo } from "@/lib/dates";
import type { PublicProfile } from "@/server/users";

const CRITERIA: Record<string, string> = { punctuality: "Ponctualité", communication: "Communication", seriousness: "Sérieux", quality: "Qualité du travail", commitment: "Respect des engagements" };
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;

export function ProfileHeader({ p, actions }: { p: PublicProfile; actions?: React.ReactNode }) {
  const available = p.availableUntil && new Date(p.availableUntil) > new Date();
  return (
    <Card className="overflow-hidden">
      <div className="h-20 bg-gradient-to-r from-primary to-[#6d5cff]" />
      <div className="-mt-10 px-5 pb-5">
        <Avatar src={p.avatarUrl} name={p.firstName} size={84} className="rounded-full ring-4 ring-surface" online={!!available} />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-1.5 text-2xl font-extrabold tracking-tight">
              {p.firstName} {p.lastName}
              {p.phoneVerified && p.identityVerified && <BadgeCheck className="size-6 text-primary" aria-label="Profil vérifié" />}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <Stars value={p.ratingAvg} count={p.ratingCount} />
              {p.areaLabel && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4" /> {p.areaLabel}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-4" /> Membre depuis {new Date(p.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              </span>
            </div>
            {available && <p className="mt-1 text-sm font-semibold text-success">● Disponible maintenant</p>}
            {p.isDemo && <Badge className="mt-2">Profil de démonstration</Badge>}
          </div>
          {actions}
        </div>
        {p.bio && <p className="mt-4 whitespace-pre-line leading-relaxed text-text/90">{p.bio}</p>}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.emailVerified && <Badge icon={<Mail className="size-3" />}>E-mail vérifié</Badge>}
          {p.phoneVerified && <Badge icon={<Phone className="size-3" />}>Téléphone vérifié</Badge>}
          {p.identityVerified && <Badge tone="primary" icon={<ShieldCheck className="size-3" />}>Identité vérifiée</Badge>}
        </div>
      </div>
    </Card>
  );
}

export function ProfileStats({ p }: { p: PublicProfile }) {
  const items = [
    { l: "Missions réalisées", v: p.missionsDone },
    { l: "Demandes abouties", v: p.missionsRequested },
    { l: "Taux de réalisation", v: p.completionRate != null ? `${p.completionRate} %` : "—" },
    { l: "Ponctualité", v: p.punctualityRate != null ? `${p.punctualityRate} %` : "—" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((x) => (
        <div key={x.l} className="rounded-2xl border border-border bg-surface p-3.5">
          <p className="text-2xl font-extrabold tracking-tight">{x.v}</p>
          <p className="text-xs text-muted">{x.l}</p>
        </div>
      ))}
    </div>
  );
}

export function ProfileBody({ p }: { p: PublicProfile }) {
  return (
    <div className="space-y-6">
      {p.badges.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {p.badges.map((b) => (
              <span key={b.slug} title={b.description} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-sm font-semibold">
                <span className="flex size-7 items-center justify-center rounded-xl" style={{ background: `${b.color}1F`, color: b.color }}>
                  <Icon name={b.icon} className="size-4" />
                </span>
                {b.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {p.skills.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold">Services proposés</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {p.skills.map((s) => (
              <div key={s.categoryId} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3">
                <CategoryBubble icon={s.icon} color={s.color} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {s.name}
                    {s.certified && <CheckCircle2 className="size-4 text-success" aria-label="Compétence certifiée" />}
                  </p>
                  <p className="text-xs text-muted">
                    {s.years ? `${s.years} an${s.years > 1 ? "s" : ""} d'expérience` : "Débutant(e)"}
                    {s.hourlyRateCents ? ` · à partir de ${formatEUR(s.hourlyRateCents)}/h` : ""}
                  </p>
                  {s.description && <p className="mt-1 text-sm">{s.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.availabilities.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <Clock className="size-4" /> Disponibilités habituelles
          </h2>
          <div className="flex flex-wrap gap-2">
            {p.availabilities
              .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
              .map((s) => (
                <span key={s.id} className="rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                  <strong>{DAYS[s.weekday]}</strong> {hhmm(s.startMinute)}–{hhmm(s.endMinute)}
                </span>
              ))}
          </div>
        </section>
      )}

      {p.portfolio.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold">Réalisations</h2>
          <div className="grid grid-cols-3 gap-2">
            {p.portfolio.map((ph) => (
              <figure key={ph.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={ph.caption ?? ""} className="aspect-square w-full rounded-2xl object-cover" />
                {ph.caption && <figcaption className="mt-1 text-xs text-muted">{ph.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-bold">
          Avis <span className="text-muted">({p.ratingCount})</span>
        </h2>
        {p.criteria.length > 0 && (
          <Card className="mb-3 grid gap-2 p-4 sm:grid-cols-2">
            {p.criteria.map((c) => (
              <div key={c.criterion} className="flex items-center gap-3">
                <span className="w-40 text-sm text-muted">{CRITERIA[c.criterion] ?? c.criterion}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-[#F5B014]" style={{ width: `${(c.avg / 5) * 100}%` }} />
                </span>
                <span className="w-8 text-right text-sm font-semibold">{c.avg.toFixed(1).replace(".", ",")}</span>
              </div>
            ))}
          </Card>
        )}
        {p.reviews.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-5 text-sm text-muted">Pas encore d'avis. Les avis ne peuvent être laissés qu'après une mission réellement effectuée sur ENTOUR.</p>
        ) : (
          <div className="space-y-2">
            {p.reviews.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar src={r.authorAvatar} name={r.authorName} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {r.authorName} <span className="font-normal text-muted">· {r.role === "as_requester" ? "a fait appel à ce membre" : "a rendu service à ce membre"}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {r.serviceTitle} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <span className="flex items-center gap-0.5 text-sm font-bold">
                    <Star className="size-4 fill-[#F5B014] text-[#F5B014]" />
                    {r.rating}
                  </span>
                </div>
                {r.comment && <p className="mt-2 text-[15px]">{r.comment}</p>}
                {r.reply && <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"><strong>Réponse :</strong> {r.reply}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
