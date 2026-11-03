"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { CategoryBubble } from "./icons";
import { Button, Chip, Field, Input, Segmented, Sheet, Switch, cx } from "./ui";
import { RADII_KM } from "@/lib/geo";

export type Filters = {
  categories: number[];
  minPrice: string;
  maxPrice: string;
  when: "" | "now" | "today" | "tomorrow" | "week" | "later";
  urgent: boolean;
  recurring: boolean;
  radius: number;
  sort: "relevance" | "distance" | "recent" | "price_desc" | "price_asc" | "date";
};

export const defaultFilters = (radius = 10): Filters => ({ categories: [], minPrice: "", maxPrice: "", when: "", urgent: false, recurring: false, radius, sort: "relevance" });

export function filtersToQuery(f: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams(extra);
  if (f.categories.length) p.set("categories", f.categories.join(","));
  if (f.minPrice) p.set("minPrice", f.minPrice);
  if (f.maxPrice) p.set("maxPrice", f.maxPrice);
  if (f.when) p.set("when", f.when);
  if (f.urgent) p.set("urgent", "1");
  if (f.recurring) p.set("recurring", "1");
  p.set("radius", String(f.radius));
  p.set("sort", f.sort);
  return p.toString();
}

export function activeCount(f: Filters) {
  return f.categories.length + (f.minPrice ? 1 : 0) + (f.maxPrice ? 1 : 0) + (f.when ? 1 : 0) + (f.urgent ? 1 : 0) + (f.recurring ? 1 : 0);
}

type Cat = { id: number; name: string; icon: string; color: string; groupName: string };

export function FilterSheet({ open, onClose, value, onChange, showRadius = true }: { open: boolean; onClose: () => void; value: Filters; onChange: (f: Filters) => void; showRadius?: boolean }) {
  const [draft, setDraft] = useState(value);
  const { data } = useSWR<{ categories: Cat[] }>("/api/categories");
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtres"
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDraft(defaultFilters(value.radius))}>
            Réinitialiser
          </Button>
          <Button
            full
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Afficher les résultats
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Field label="Quand ?">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["", "Peu importe"],
                ["now", "Maintenant"],
                ["today", "Aujourd'hui"],
                ["tomorrow", "Demain"],
                ["week", "Cette semaine"],
                ["later", "Plus tard"],
              ] as const
            ).map(([v, l]) => (
              <Chip key={v} active={draft.when === v} onClick={() => set("when", v)}>
                {l}
              </Chip>
            ))}
          </div>
        </Field>
        {showRadius && (
          <Field label="Distance maximale">
            <div className="flex flex-wrap gap-2">
              {RADII_KM.map((r) => (
                <Chip key={r} active={draft.radius === r} onClick={() => set("radius", r)}>
                  {r} km
                </Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label="Prix (€)">
          <div className="flex items-center gap-2">
            <Input inputMode="numeric" placeholder="Min" value={draft.minPrice} onChange={(e) => set("minPrice", e.target.value.replace(/\D/g, ""))} className="w-28" />
            <span className="text-muted">—</span>
            <Input inputMode="numeric" placeholder="Max" value={draft.maxPrice} onChange={(e) => set("maxPrice", e.target.value.replace(/\D/g, ""))} className="w-28" />
          </div>
        </Field>
        <div>
          <Switch checked={draft.urgent} onChange={(v) => set("urgent", v)} label="Urgentes uniquement" />
          <Switch checked={draft.recurring} onChange={(v) => set("recurring", v)} label="Récurrentes uniquement" />
        </div>
        <Field label="Trier par">
          <Segmented
            size="sm"
            value={draft.sort}
            onChange={(v) => set("sort", v)}
            options={[
              { value: "relevance", label: "Pertinence" },
              { value: "distance", label: "Distance" },
              { value: "recent", label: "Récentes" },
              { value: "price_desc", label: "Prix ↓" },
              { value: "date", label: "Date" },
            ]}
          />
        </Field>
        <Field label={`Catégories${draft.categories.length ? ` (${draft.categories.length})` : ""}`}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data?.categories.map((c) => {
              const on = draft.categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set("categories", on ? draft.categories.filter((x) => x !== c.id) : [...draft.categories, c.id])}
                  className={cx("flex items-center gap-2.5 rounded-2xl border p-2 text-left text-sm", on ? "border-primary bg-primary-soft" : "border-border")}
                >
                  <CategoryBubble icon={c.icon} color={c.color} size={30} />
                  <span className="font-medium leading-tight">{c.name}</span>
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface px-4 text-sm font-semibold shadow-card">
      <SlidersHorizontal className="size-4" /> Filtres
      {count > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-ink">{count}</span>}
    </button>
  );
}
