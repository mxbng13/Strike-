"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { activeCount, defaultFilters, FilterButton, filtersToQuery, FilterSheet, type Filters } from "@/components/filters";
import { useMe } from "@/components/providers";
import { ServiceCardView } from "@/components/service-card";
import { Button, ButtonLink, EmptyState, ErrorState, Input, PageHeader, Skeleton } from "@/components/ui";
import type { ServiceCard } from "@/server/services";

const PAGE = 24;

function Explorer() {
  const sp = useSearchParams();
  const { location } = useMe();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [query, setQuery] = useState(sp.get("q") ?? "");
  const [filters, setFilters] = useState<Filters>(() => ({
    ...defaultFilters(location?.radiusKm ?? 10),
    categories: sp.get("categories")?.split(",").map(Number).filter(Boolean) ?? [],
    urgent: sp.get("urgent") === "1",
    sort: (sp.get("sort") as Filters["sort"]) ?? "relevance",
  }));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (location?.radiusKm) setFilters((f) => ({ ...f, radius: location.radiusKm }));
  }, [location?.radiusKm]);

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<{ services: ServiceCard[] }>(
    (i, prev) => (prev && prev.services.length < PAGE ? null : `/api/services?${filtersToQuery(filters, { ...(query ? { q: query } : {}), limit: String(PAGE), offset: String(i * PAGE) })}`),
    { revalidateFirstPage: false },
  );
  const items = data?.flatMap((d) => d.services) ?? [];
  const end = data && data[data.length - 1]?.services.length < PAGE;

  return (
    <div>
      <PageHeader title="Explorer" subtitle={location ? `Autour de ${location.label} · ${filters.radius} km` : "Toutes les demandes"} />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q);
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mots-clés : déménagement, chat, ikea…" className="pl-10" />
        </div>
        <FilterButton count={activeCount(filters)} onClick={() => setOpen(true)} />
      </form>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {isLoading && (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}
      {data && items.length === 0 && (
        <EmptyState
          icon={<Search className="size-7" />}
          title="Aucune demande ne correspond"
          description="Élargissez le rayon, retirez des filtres ou publiez vous-même votre besoin."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setFilters(defaultFilters(50)); setQuery(""); setQ(""); }}>
                Élargir à 50 km
              </Button>
              <ButtonLink href="/publier">Publier</ButtonLink>
            </div>
          }
        />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((s, i) => (
          <ServiceCardView key={s.id} s={s} index={i % PAGE} />
        ))}
      </div>
      {items.length > 0 && !end && (
        <div className="mt-6 text-center">
          <Button variant="outline" loading={isValidating} onClick={() => setSize(size + 1)}>
            Afficher plus
          </Button>
        </div>
      )}
      <FilterSheet open={open} onClose={() => setOpen(false)} value={filters} onChange={setFilters} />
    </div>
  );
}

export default function ExplorerPage() {
  return (
    <Suspense>
      <Explorer />
    </Suspense>
  );
}
