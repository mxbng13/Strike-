"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, List, Loader2, Map as MapIcon, RefreshCw, Search, X } from "lucide-react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { activeCount, defaultFilters, FilterButton, filtersToQuery, FilterSheet, type Filters } from "@/components/filters";
import { MAP_STYLE } from "@/components/mini-map";
import { useMe, useToast } from "@/components/providers";
import { priceLabel, ServiceCardView } from "@/components/service-card";
import { Chip, EmptyState, Input, cx } from "@/components/ui";
import { api, geocode, getBrowserPosition, type GeoResult } from "@/lib/client";
import type { ServiceCard } from "@/server/services";

const FRANCE: [number, number] = [2.4, 46.6];

export default function MapPage() {
  const { location } = useMe();
  const { push } = useToast();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(10));
  const [filterOpen, setFilterOpen] = useState(false);
  const [services, setServices] = useState<ServiceCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ServiceCard | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const load = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const c = map.getCenter();
    setLoading(true);
    try {
      const qs = filtersToQuery(filtersRef.current, {
        bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(5)).join(","),
        lat: c.lat.toFixed(5),
        lng: c.lng.toFixed(5),
        limit: "300",
      });
      const r = await api<{ services: ServiceCard[] }>(`/api/services?${qs}`);
      setServices(r.services);
      const src = map.getSource("services") as GeoJSONSource | undefined;
      src?.setData({
        type: "FeatureCollection",
        features: r.services.map((s) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
          properties: { id: s.id, price: priceLabel(s), color: s.category.color, urgent: s.urgency === "urgent" ? 1 : 0 },
        })),
      });
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [push]);

  // Initialisation de la carte
  useEffect(() => {
    let disposed = false;
    let map: MLMap | null = null;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (disposed || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: MAP_STYLE,
        center: location ? [location.lng, location.lat] : FRANCE,
        zoom: location ? 12.5 : 5,
        attributionControl: { compact: true },
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      const m = map;
      m.on("load", () => {
        m.addSource("services", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 48, clusterMaxZoom: 15 });
        m.addLayer({
          id: "clusters",
          type: "circle",
          source: "services",
          filter: ["has", "point_count"],
          paint: { "circle-color": "#3b2fd9", "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32], "circle-stroke-width": 4, "circle-stroke-color": "rgba(59,47,217,0.25)" },
        });
        m.addLayer({ id: "cluster-count", type: "symbol", source: "services", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Bold"] }, paint: { "text-color": "#ffffff" } });
        m.addLayer({
          id: "points",
          type: "circle",
          source: "services",
          filter: ["!", ["has", "point_count"]],
          paint: { "circle-color": ["case", ["==", ["get", "urgent"], 1], "#e5533d", ["get", "color"]], "circle-radius": 9, "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" },
        });
        m.addLayer({
          id: "labels",
          type: "symbol",
          source: "services",
          filter: ["!", ["has", "point_count"]],
          layout: { "text-field": ["get", "price"], "text-size": 12, "text-offset": [0, -1.7], "text-font": ["Noto Sans Bold"], "text-allow-overlap": false },
          paint: { "text-color": "#1b1a2e", "text-halo-color": "#ffffff", "text-halo-width": 2 },
        });
        m.on("click", "clusters", async (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const zoom = await (m.getSource("services") as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
          m.easeTo({ center: (f.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom });
        });
        m.on("click", "points", (e) => {
          const id = e.features?.[0]?.properties?.id;
          setSelected((prev) => servicesRef.current.find((s) => s.id === id) ?? prev);
        });
        for (const l of ["clusters", "points"]) {
          m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
        }
        m.on("moveend", () => load());
        setReady(true);
        load();
      });
    })();
    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const servicesRef = useRef(services);
  servicesRef.current = services;

  useEffect(() => {
    if (ready) load();
  }, [filters, ready, load]);

  // Recherche par ville
  useEffect(() => {
    if (q.trim().length < 3) return setResults([]);
    const t = setTimeout(() => geocode(q, { type: "municipality" }).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const locate = async () => {
    try {
      const p = await getBrowserPosition();
      mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 13.5 });
    } catch (e) {
      push({ tone: "error", title: (e as Error).message });
    }
  };

  return (
    <div className="-mx-4 -mb-28 -mt-4 sm:-mx-6 lg:-mb-12 lg:-mt-8">
      <div className="relative h-[calc(100dvh-4rem)] lg:h-dvh">
        <div ref={container} className={cx("absolute inset-0", view === "list" && "invisible")} />

        {/* Barre supérieure */}
        <div className="absolute inset-x-0 top-0 z-10 space-y-2 p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une ville" className="h-11 rounded-2xl pl-10 shadow-card" aria-label="Rechercher une ville" />
              {results.length > 0 && (
                <ul className="absolute inset-x-0 top-12 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
                  {results.map((r) => (
                    <li key={r.label + r.lat}>
                      <button
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-surface-2"
                        onClick={() => {
                          mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 12.5 });
                          setQ("");
                          setResults([]);
                          setView("map");
                        }}
                      >
                        <span className="font-semibold">{r.city}</span> <span className="text-muted">{r.context}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <FilterButton count={activeCount(filters)} onClick={() => setFilterOpen(true)} />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            <Chip active={filters.urgent} onClick={() => setFilters((f) => ({ ...f, urgent: !f.urgent }))} className="shadow-card">
              Urgentes
            </Chip>
            <Chip active={filters.when === "today"} onClick={() => setFilters((f) => ({ ...f, when: f.when === "today" ? "" : "today" }))} className="shadow-card">
              Aujourd'hui
            </Chip>
            <Chip active={filters.recurring} onClick={() => setFilters((f) => ({ ...f, recurring: !f.recurring }))} className="shadow-card">
              Récurrentes
            </Chip>
            <Chip active={filters.maxPrice === "20"} onClick={() => setFilters((f) => ({ ...f, maxPrice: f.maxPrice === "20" ? "" : "20" }))} className="shadow-card">
              Moins de 20 €
            </Chip>
          </div>
        </div>

        {/* Contrôles */}
        <div className="absolute bottom-24 left-3 z-10 flex flex-col gap-2 lg:bottom-8">
          <button aria-label="Me localiser" onClick={locate} className="flex size-11 items-center justify-center rounded-2xl bg-surface shadow-card">
            <Crosshair className="size-5" />
          </button>
          <button aria-label="Actualiser" onClick={load} className="flex size-11 items-center justify-center rounded-2xl bg-surface shadow-card">
            {loading ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />}
          </button>
        </div>
        <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 lg:bottom-8">
          <button onClick={() => setView((v) => (v === "map" ? "list" : "map"))} className="flex h-11 items-center gap-2 rounded-full bg-text px-5 text-sm font-semibold text-bg shadow-xl">
            {view === "map" ? (
              <>
                <List className="size-4" /> Liste ({services.length})
              </>
            ) : (
              <>
                <MapIcon className="size-4" /> Carte
              </>
            )}
          </button>
        </div>

        {/* Vue liste */}
        {view === "list" && (
          <div className="absolute inset-0 overflow-y-auto bg-bg px-4 pb-40 pt-32">
            {services.length === 0 ? (
              <EmptyState title="Aucune demande dans cette zone" description="Déplacez la carte, dézoomez ou modifiez vos filtres." />
            ) : (
              <div className="mx-auto grid max-w-3xl gap-3 md:grid-cols-2">
                {services.map((s, i) => (
                  <ServiceCardView key={s.id} s={s} index={i} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fiche sélectionnée */}
        <AnimatePresence>
          {selected && view === "map" && (
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="absolute inset-x-3 bottom-40 z-20 mx-auto max-w-md lg:bottom-24">
              <button aria-label="Fermer" onClick={() => setSelected(null)} className="absolute -top-3 right-2 z-10 rounded-full bg-text p-1.5 text-bg shadow">
                <X className="size-4" />
              </button>
              <ServiceCardView s={selected} />
            </motion.div>
          )}
        </AnimatePresence>
        {!services.length && ready && !loading && view === "map" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-40 z-10 text-center lg:bottom-24">
            <span className="rounded-full bg-surface px-4 py-2 text-sm font-medium shadow-card">Aucune demande ici — dézoomez pour voir plus loin</span>
          </div>
        )}
      </div>
      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} value={filters} onChange={setFilters} showRadius={false} />
    </div>
  );
}
