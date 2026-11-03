"use client";

/** Client HTTP côté navigateur : JSON, erreurs lisibles, compatible SWR. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    signal: opts.signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? "Une erreur est survenue", e.details);
  }
  return data as T;
}

export const fetcher = <T,>(url: string) => api<T>(url);

export async function uploadFile(file: File, purpose: "public" | "message", conversationId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("purpose", purpose);
  if (conversationId) fd.append("conversationId", conversationId);
  const res = await fetch("/api/uploads", { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Échec du téléversement");
  return data as { key: string; url: string; mimeType: string; kind: string; sizeBytes: number; fileName: string };
}

/** Géocodage France (Base Adresse Nationale, service public gratuit, sans clé). */
export type GeoResult = { label: string; city: string; postcode: string | null; lat: number; lng: number; context: string };

export async function geocode(q: string, opts: { type?: "municipality" | "street" | "housenumber"; signal?: AbortSignal } = {}): Promise<GeoResult[]> {
  if (q.trim().length < 3) return [];
  const url = new URL("https://api-adresse.data.gouv.fr/search/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  if (opts.type) url.searchParams.set("type", opts.type);
  const res = await fetch(url, { signal: opts.signal });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features ?? []).map((f: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }) => ({
    label: f.properties.label,
    city: f.properties.city,
    postcode: f.properties.postcode ?? null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    context: f.properties.context,
  }));
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  try {
    const res = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lng}&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const f = data.features?.[0];
    if (!f) return null;
    return { label: f.properties.label, city: f.properties.city, postcode: f.properties.postcode ?? null, lat, lng, context: f.properties.context };
  } catch {
    return null;
  }
}

/** Libellé de zone approximatif (quartier/ville), jamais l'adresse exacte. */
export function areaLabelFrom(r: GeoResult) {
  return r.postcode ? `${r.city} (${r.postcode.slice(0, 2)})` : r.city;
}

export function getBrowserPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Géolocalisation non disponible sur cet appareil"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? "Autorisation de localisation refusée" : "Position introuvable")),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
}
