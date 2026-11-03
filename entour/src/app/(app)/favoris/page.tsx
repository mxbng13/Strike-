"use client";

import { Heart, ShieldCheck } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, Stars } from "@/components/ui";
import { formatEUR } from "@/lib/money";

type Data = { services: Record<string, unknown>[]; people: Record<string, unknown>[] };

export default function FavoritesPage() {
  const { data } = useSWR<Data>("/api/favorites");
  if (!data) return <Skeleton className="h-64" />;
  const trusted = data.people.filter((p) => p.kind === "trusted");
  const favs = data.people.filter((p) => p.kind === "user" && !trusted.some((t) => t.id === p.id));
  const Person = ({ p }: { p: Record<string, unknown> }) => (
    <Link href={`/u/${p.id}`} className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5">
      <Avatar src={p.avatar_url as string | null} name={String(p.first_name)} size={48} online={!!p.available_now} />
      <div className="flex-1">
        <p className="font-semibold">{String(p.first_name)}</p>
        <Stars value={Number(p.rating_avg)} count={Number(p.rating_count)} size={12} />
      </div>
      <span className="text-xs text-muted">{String(p.missions_done)} missions</span>
    </Link>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Favoris" subtitle="Vos personnes de confiance sont mises en avant lorsqu'elles répondent à vos demandes." />
      <section>
        <h2 className="mb-2 flex items-center gap-2 font-bold">
          <ShieldCheck className="size-5 text-primary" /> Personnes de confiance
        </h2>
        {trusted.length ? <div className="grid gap-2 sm:grid-cols-2">{trusted.map((p) => <Person key={String(p.id)} p={p} />)}</div> : <p className="rounded-2xl bg-surface-2 px-4 py-4 text-sm text-muted">Marquez comme « de confiance » les personnes avec qui tout s'est bien passé, depuis leur profil.</p>}
      </section>
      <section>
        <h2 className="mb-2 flex items-center gap-2 font-bold">
          <Heart className="size-5 text-danger" /> Profils favoris
        </h2>
        {favs.length ? <div className="grid gap-2 sm:grid-cols-2">{favs.map((p) => <Person key={String(p.id)} p={p} />)}</div> : <p className="rounded-2xl bg-surface-2 px-4 py-4 text-sm text-muted">Aucun profil favori.</p>}
      </section>
      <section>
        <h2 className="mb-2 font-bold">Demandes sauvegardées</h2>
        {data.services.length ? (
          <div className="space-y-2">
            {data.services.map((s) => (
              <Link key={String(s.id)} href={`/missions/${s.id}`} className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5">
                <CategoryBubble icon={String(s.icon)} color={String(s.color)} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{String(s.title)}</p>
                  <p className="text-xs text-muted">
                    {String(s.category_name)} · {String(s.area_label)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{s.budget_cents != null ? formatEUR(Number(s.budget_cents)) : "Offre"}</p>
                  {s.status !== "open" && <Badge>Fermée</Badge>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Heart className="size-7" />} title="Aucune demande sauvegardée" description="Touchez le cœur sur une demande pour la retrouver ici." />
        )}
      </section>
    </div>
  );
}
