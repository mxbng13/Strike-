"use client";

import { useEffect, useRef } from "react";

export const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";

/** Charge MapLibre et pointe vers son worker servi depuis /public (cf. scripts/copy-map-worker.mjs). */
export async function loadMaplibre() {
  const maplibregl = await import("maplibre-gl");
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
  return maplibregl;
}

/** Cercle de ~400 m autour de la position floutée : on montre une zone, jamais un point précis. */
export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 48) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lng + (radiusM * Math.sin(a)) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (radiusM * Math.cos(a)) / 111_320]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

export function MiniMap({ lat, lng, exact, className }: { lat: number; lng: number; exact?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;
    (async () => {
      const maplibregl = await loadMaplibre();
      if (cancelled || !ref.current) return;
      map = new maplibregl.Map({ container: ref.current, style: MAP_STYLE, center: [lng, lat], zoom: exact ? 15 : 13.5, interactive: false, attributionControl: { compact: true } });
      const m = map;
      m.on("load", () => {
        if (!map) return;
        if (exact) {
          new maplibregl.Marker({ color: "#3b2fd9" }).setLngLat([lng, lat]).addTo(map);
        } else {
          map.addSource("zone", { type: "geojson", data: circlePolygon(lat, lng, 450) });
          map.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#3b2fd9", "fill-opacity": 0.15 } });
          map.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#3b2fd9", "line-width": 2, "line-dasharray": [2, 2] } });
        }
      });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, exact]);
  return <div ref={ref} className={className ?? "h-48 w-full overflow-hidden rounded-3xl bg-surface-2"} aria-label={exact ? "Adresse de la mission" : "Zone approximative de la mission"} role="img" />;
}
