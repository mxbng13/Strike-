"use client";

import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { areaLabelFrom, geocode, getBrowserPosition, reverseGeocode, type GeoResult } from "@/lib/client";
import { Button, Input, cx } from "./ui";

export type PickedLocation = { lat: number; lng: number; label: string; postcode: string | null; address?: string };

/**
 * Sélection d'un lieu en France (Base Adresse Nationale) ou par géolocalisation.
 * `label` est un libellé de zone (ville) — l'adresse complète n'est conservée qu'en privé.
 */
export function LocationPicker({ value, onChange, mode = "address", placeholder }: { value: PickedLocation | null; onChange: (v: PickedLocation) => void; mode?: "address" | "city"; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      setLoading(true);
      try {
        setResults(await geocode(q, { type: mode === "city" ? "municipality" : undefined, signal: ctrl.current.signal }));
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Recherche d'adresse indisponible");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft px-3.5 py-3">
          <MapPin className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{value.label}</p>
            {value.address && <p className="truncate text-xs text-muted">{value.address} · visible uniquement par l'intervenant retenu</p>}
          </div>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? (mode === "city" ? "Rechercher une ville" : "Adresse, rue ou ville")} className="pl-10" aria-label="Rechercher un lieu" />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>
      {results.length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
          {results.map((r) => (
            <li key={`${r.lat}${r.lng}${r.label}`}>
              <button
                type="button"
                onClick={() => {
                  onChange({ lat: r.lat, lng: r.lng, label: areaLabelFrom(r), postcode: r.postcode, address: mode === "address" ? r.label : undefined });
                  setQ("");
                  setResults([]);
                }}
                className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                <span>
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-muted">{r.context}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={geoLoading}
        icon={<Crosshair className="size-4" />}
        onClick={async () => {
          setGeoLoading(true);
          setError(null);
          try {
            const pos = await getBrowserPosition();
            const r = await reverseGeocode(pos.lat, pos.lng);
            onChange({ lat: pos.lat, lng: pos.lng, label: r ? areaLabelFrom(r) : "Ma position", postcode: r?.postcode ?? null, address: mode === "address" ? r?.label : undefined });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setGeoLoading(false);
          }
        }}
      >
        Utiliser ma position
      </Button>
      {error && <p className={cx("text-sm text-danger")}>{error}</p>}
    </div>
  );
}
