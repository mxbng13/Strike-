"use client";

import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, MapPin, Search, Siren, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "@/components/icons";
import { useAction, useMe, useMode } from "@/components/providers";
import { ServiceCardView } from "@/components/service-card";
import { ModeSwitch, TopIcons } from "@/components/shell";
import { Avatar, Button, ButtonLink, Card, EmptyState, ErrorState, SectionTitle, Skeleton, Stars, Switch } from "@/components/ui";
import { api } from "@/lib/client";
import type { ServiceCard } from "@/server/services";

type Home = {
  location: { label: string; radiusKm: number } | null;
  availableUntil?: string | null;
  urgent: ServiceCard[];
  recent: ServiceCard[];
  recommended: ServiceCard[];
  popular: ServiceCard[];
  neighbors: { id: string; firstName: string; avatarUrl: string | null; ratingAvg: number; ratingCount: number; availableNow: boolean; verified: boolean; distanceKm: number; skills: { name: string; icon: string; color: string }[] }[];
  openCount: number;
};
type Cat = { id: number; name: string; icon: string; color: string; slug: string };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

function Row({ items, empty }: { items: ServiceCard[]; empty: string }) {
  if (!items.length) return <p className="rounded-2xl bg-surface-2 px-4 py-5 text-sm text-muted">{empty}</p>;
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0">
      {items.map((s, i) => (
        <div key={s.id} className="snap-start">
          <ServiceCardView s={s} index={i} compact />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { me } = useMe();
  const { mode } = useMode();
  const router = useRouter();
  const { run, pending } = useAction();
  const [q, setQ] = useState("");
  const { data, error, isLoading, mutate } = useSWR<Home>("/api/home");
  const { data: cats } = useSWR<{ categories: Cat[] }>("/api/categories");
  const available = !!data?.availableUntil;

  return (
    <div className="space-y-7">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{greeting()},</p>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{me?.firstName ?? "…"}</h1>
          {data?.location && (
            <Link href="/parametres#localisation" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">
              <MapPin className="size-4" /> {data.location.label} · {data.location.radiusKm} km
            </Link>
          )}
        </div>
        <TopIcons />
      </header>

      <ModeSwitch className="lg:hidden" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/explorer?q=${encodeURIComponent(q)}`);
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mode === "offreur" ? "Rechercher une mission (jardin, livraison…)" : "Rechercher un service ou une personne"}
          className="h-13 w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-[15px] shadow-card focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
          aria-label="Rechercher"
        />
      </form>

      {mode === "demandeur" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <motion.div whileTap={{ scale: 0.98 }}>
            <Link href="/publier?urgent=1" className="flex items-center gap-4 rounded-3xl bg-danger p-4 text-white shadow-[0_12px_28px_-14px_var(--danger)]">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
                <Siren className="size-6" />
              </span>
              <span className="flex-1">
                <span className="block font-bold">J'ai besoin d'aide maintenant</span>
                <span className="block text-sm text-white/80">Alerte immédiate aux voisins disponibles</span>
              </span>
              <ArrowRight className="size-5" />
            </Link>
          </motion.div>
          <motion.div whileTap={{ scale: 0.98 }}>
            <Link href="/publier" className="flex items-center gap-4 rounded-3xl bg-primary p-4 text-primary-ink shadow-[0_12px_28px_-14px_var(--primary)]">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
                <Sparkles className="size-6" />
              </span>
              <span className="flex-1">
                <span className="block font-bold">Publier en une phrase</span>
                <span className="block text-sm opacity-80">L'assistant rédige l'annonce pour vous</span>
              </span>
              <ArrowRight className="size-5" />
            </Link>
          </motion.div>
        </div>
      ) : (
        <Card className="p-4">
          <Switch
            checked={available}
            disabled={pending === "avail"}
            onChange={(v) =>
              run("avail", async () => {
                await api("/api/me/available-now", { body: { hours: v ? 3 : null } });
                await mutate();
              }, { success: v ? "Vous êtes visible comme disponible pendant 3 h" : "Disponibilité désactivée" })
            }
            label={
              <span className="flex items-center gap-2">
                <Zap className="size-4 text-success" /> Je suis disponible maintenant
              </span>
            }
            description={available ? `Visible jusqu'à ${new Date(data!.availableUntil!).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} — vous recevez en priorité les demandes immédiates.` : "Recevez en priorité les demandes immédiates autour de vous pendant 3 heures."}
          />
        </Card>
      )}

      <section>
        <SectionTitle title="Catégories" action={<Link href="/explorer" className="text-sm font-semibold text-primary">Tout voir</Link>} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
          {(cats?.categories ?? []).slice(0, 14).map((c) => (
            <Link key={c.id} href={mode === "demandeur" ? `/publier?categorie=${c.id}` : `/explorer?categories=${c.id}`} className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 text-center">
              <CategoryBubble icon={c.icon} color={c.color} size={56} />
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {data && !data.location && (
        <EmptyState icon={<MapPin className="size-7" />} title="Où êtes-vous ?" description="Indiquez votre quartier pour découvrir les demandes et les voisins autour de vous." action={<ButtonLink href="/onboarding">Définir ma zone</ButtonLink>} />
      )}

      {data?.location && (
        <>
          <section>
            <SectionTitle
              title={
                <span className="flex items-center gap-2">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
                  </span>
                  Urgent près de vous
                </span>
              }
              action={<Link href="/explorer?urgent=1" className="text-sm font-semibold text-primary">Voir tout</Link>}
            />
            <Row items={data.urgent} empty="Aucune demande urgente autour de vous pour le moment." />
          </section>

          {mode === "offreur" && (
            <section>
              <SectionTitle title="Recommandées pour vous" subtitle="Selon vos compétences et vos missions passées" action={<Link href="/profil/competences" className="text-sm font-semibold text-primary">Mes compétences</Link>} />
              <Row items={data.recommended} empty="Ajoutez vos compétences pour recevoir des recommandations personnalisées." />
            </section>
          )}

          <section>
            <SectionTitle title="Nouvelles demandes" subtitle={`${data.openCount} demande${data.openCount > 1 ? "s" : ""} ouverte${data.openCount > 1 ? "s" : ""} dans votre rayon`} action={<Link href="/explorer?sort=recent" className="text-sm font-semibold text-primary">Explorer</Link>} />
            {data.recent.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {data.recent.slice(0, 6).map((s, i) => (
                  <ServiceCardView key={s.id} s={s} index={i} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Sparkles className="size-7" />}
                title="Le quartier est calme"
                description="Aucune demande dans votre rayon pour l'instant. Élargissez la zone ou soyez le premier à publier !"
                action={
                  <div className="flex gap-2">
                    <ButtonLink href="/parametres#localisation" variant="outline">
                      Élargir le rayon
                    </ButtonLink>
                    <ButtonLink href="/publier">Publier</ButtonLink>
                  </div>
                }
              />
            )}
          </section>

          {mode === "demandeur" && (
            <section>
              <SectionTitle title="Voisins disponibles" subtitle="Personnes proposant leurs services autour de vous" action={<Link href="/communaute?onglet=voisins" className="text-sm font-semibold text-primary">Voir tout</Link>} />
              {data.neighbors.length ? (
                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0">
                  {data.neighbors.map((n) => (
                    <Link key={n.id} href={`/u/${n.id}`} className="w-40 shrink-0 rounded-3xl border border-border bg-surface p-4 text-center shadow-card">
                      <Avatar src={n.avatarUrl} name={n.firstName} size={56} className="mx-auto" online={n.availableNow} />
                      <p className="mt-2 flex items-center justify-center gap-1 font-bold">
                        {n.firstName} {n.verified && <BadgeCheck className="size-4 text-primary" />}
                      </p>
                      <div className="mt-0.5 flex justify-center">
                        <Stars value={n.ratingAvg} count={n.ratingCount} size={12} />
                      </div>
                      <p className="mt-1 text-xs text-muted">~{n.distanceKm.toLocaleString("fr-FR")} km</p>
                      <div className="mt-2 flex justify-center gap-1">
                        {n.skills.slice(0, 3).map((s) => (
                          <CategoryBubble key={s.name} icon={s.icon} color={s.color} size={26} />
                        ))}
                      </div>
                      {n.availableNow && <p className="mt-2 text-xs font-semibold text-success">Disponible maintenant</p>}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-surface-2 px-4 py-5 text-sm text-muted">Pas encore de voisins proposant leurs services dans votre rayon. Invitez vos proches avec votre code de parrainage !</p>
              )}
            </section>
          )}

          {data.popular.length > 0 && (
            <section>
              <SectionTitle title="Demandes populaires" subtitle="Celles qui suscitent le plus de réponses" />
              <Row items={data.popular} empty="" />
            </section>
          )}

          <Card className="flex items-center gap-4 p-5">
            <div className="flex-1">
              <p className="font-bold">Invitez vos voisins</p>
              <p className="text-sm text-muted">Plus vous êtes nombreux, plus les demandes trouvent preneur rapidement.</p>
            </div>
            <Button variant="secondary" onClick={() => router.push("/parrainage")}>
              Parrainer
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
