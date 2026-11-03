"use client";

import { Lock, Trophy } from "lucide-react";
import useSWR from "swr";
import { Icon } from "@/components/icons";
import { ProfileStats } from "@/components/profile-view";
import { Badge, Card, PageHeader, Skeleton, Stat, cx } from "@/components/ui";
import type { PublicProfile } from "@/server/users";

type B = { id: number; name: string; description: string; icon: string; color: string; kind: string; awardedAt: string | null };
type Overview = { profile: PublicProfile; badges: B[]; loyalty: { points: number; level: number; name: string; next: number | null; progress: number } };

export default function ReputationPage() {
  const { data } = useSWR<Overview>("/api/me/overview");
  if (!data) return <Skeleton className="h-96" />;
  const owned = data.badges.filter((b) => b.awardedAt);
  const p = data.profile;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader back="/profil" title="Réputation & progression" />
      <Card className="bg-gradient-to-br from-primary to-[#6d5cff] p-6 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <Trophy className="size-4" /> Programme de fidélité
        </p>
        <p className="mt-1 text-3xl font-extrabold">
          Niveau {data.loyalty.level} · {data.loyalty.name}
        </p>
        <p className="text-white/80">{data.loyalty.points} points</p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white" style={{ width: `${Math.round(data.loyalty.progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-sm text-white/80">Gagnez des points en réalisant des missions (+20), en laissant des avis (+5), en parrainant (+100) et en débloquant des badges.</p>
      </Card>

      <ProfileStats p={p} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Note globale" value={p.ratingCount ? p.ratingAvg.toFixed(2).replace(".", ",") : "—"} hint={`${p.ratingCount} avis`} />
        <Stat label="Note en tant qu'intervenant" value={p.providerRatingCount ? p.providerRatingAvg.toFixed(2).replace(".", ",") : "—"} hint={`${p.providerRatingCount} avis`} />
        <Stat label="Annulations" value={p.missionsCancelled} />
        <Stat label="Retards signalés" value={p.lateCount} />
      </div>

      <section>
        <h2 className="mb-3 font-bold">
          Badges <span className="text-muted">({owned.length}/{data.badges.length})</span>
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.badges.map((b) => (
            <div key={b.id} className={cx("flex items-start gap-3 rounded-2xl border p-3", b.awardedAt ? "border-border bg-surface" : "border-dashed border-border opacity-60")}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: b.awardedAt ? `${b.color}1F` : "var(--surface-2)", color: b.awardedAt ? b.color : "var(--muted)" }}>
                {b.awardedAt ? <Icon name={b.icon} className="size-5" /> : <Lock className="size-5" />}
              </span>
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  {b.name} {b.kind === "seasonal" && <Badge tone="primary">Saisonnier</Badge>}
                </p>
                <p className="text-xs text-muted">{b.description}</p>
                {b.awardedAt && <p className="mt-0.5 text-xs text-success">Obtenu le {new Date(b.awardedAt).toLocaleDateString("fr-FR")}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
