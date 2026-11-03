/** Outils géographiques. Les positions exactes ne quittent jamais le serveur. */

export const RADII_KM = [1, 3, 5, 10, 20, 50] as const;
export type RadiusKm = (typeof RADII_KM)[number];

const R = 6371; // rayon terrestre (km)

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** PRNG déterministe (mulberry32) à partir d'une graine texte : le flou reste stable pour une même annonce. */
function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Floute une position : déplacement aléatoire (déterministe selon la graine) de 150 à 400 m,
 * puis arrondi à ~100 m. Empêche de retrouver un domicile à partir de la carte ou des distances.
 */
export function fuzzLocation(lat: number, lng: number, seed: string, minM = 150, maxM = 400) {
  const rnd = seeded(seed);
  const dist = minM + rnd() * (maxM - minM);
  const angle = rnd() * 2 * Math.PI;
  const dLat = (dist * Math.cos(angle)) / 111_320;
  const dLng = (dist * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  const round = (v: number) => Math.round(v * 1000) / 1000; // ~100 m
  return { lat: round(lat + dLat), lng: round(lng + dLng) };
}

/** Distance affichée : volontairement approximative. */
export function formatDistance(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return "";
  if (km < 0.5) return "< 500 m";
  if (km < 1) return "< 1 km";
  if (km < 10) return `${(Math.round(km * 2) / 2).toLocaleString("fr-FR")} km`;
  return `${Math.round(km)} km`;
}

/** Temps de trajet estimé (minutes) selon un mode : marche, vélo, voiture en ville. */
export function travelMinutes(km: number, mode: "walk" | "bike" | "car" = "walk") {
  const speed = { walk: 4.5, bike: 14, car: 25 }[mode];
  return Math.max(1, Math.round((km / speed) * 60 * 1.25));
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Number.isFinite(lat) && Number.isFinite(lng);
}

/** Cellule de grille (~2,2 km) pour les statistiques d'équilibre offre/demande par zone. */
export function gridCell(lat: number, lng: number, sizeDeg = 0.02) {
  const cLat = Math.floor(lat / sizeDeg) * sizeDeg + sizeDeg / 2;
  const cLng = Math.floor(lng / sizeDeg) * sizeDeg + sizeDeg / 2;
  return { key: `${cLat.toFixed(3)}:${cLng.toFixed(3)}`, lat: cLat, lng: cLng };
}
