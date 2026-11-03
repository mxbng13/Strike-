"use client";

import useSWR from "swr";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui";

type Cell = { lat: number; lng: number; demand: number; unanswered: number; supply: number; status: "manque_offreurs" | "manque_demandeurs" | "tension" | "equilibre" };

const ST: Record<Cell["status"], { label: string; tone: "danger" | "warning" | "primary" | "success"; action: string }> = {
  manque_offreurs: { label: "Manque d'offreurs", tone: "danger", action: "Recruter des intervenants : partenariats associatifs, étudiants, affichage local, bonus de parrainage ciblé." },
  tension: { label: "Demandes sans réponse", tone: "warning", action: "Plus de la moitié des demandes restent sans réponse après 2 h : élargir la diffusion, relancer les offreurs proches." },
  manque_demandeurs: { label: "Manque de demandeurs", tone: "primary", action: "Communication locale auprès des habitants, commerçants partenaires, offre de lancement." },
  equilibre: { label: "Équilibré", tone: "success", action: "Zone saine : candidate à une extension vers les communes voisines." },
};

export default function ZonesPage() {
  const { data } = useSWR<{ cells: Cell[] }>("/api/admin/market");
  const { data: settings } = useSWR<{ settings: { launch: { activeZones: { label: string; lat: number; lng: number; radiusKm: number }[] } } }>("/api/admin/settings");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Zones & lancement" subtitle="Équilibre offre / demande sur 30 jours, par carré d'environ 2 km. Objectif : que chaque demande trouve une réponse." />
      {settings && (
        <Card className="p-5">
          <p className="font-bold">Zones de lancement actives</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {settings.settings.launch.activeZones.map((z) => (
              <Badge key={z.label} tone="primary">
                {z.label} · {z.radiusKm} km
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Modifiables dans Paramètres › Zones de lancement. Stratégie : densifier une première ville avant d'ouvrir les villes voisines une fois l'équilibre atteint.</p>
        </Card>
      )}
      {!data ? (
        <Skeleton className="h-64" />
      ) : data.cells.length === 0 ? (
        <p className="rounded-2xl bg-surface-2 p-6 text-center text-sm text-muted">Pas encore assez d'activité pour analyser les zones.</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="p-3">Zone (centre)</th>
                <th className="p-3">Demandes</th>
                <th className="p-3">Sans réponse</th>
                <th className="p-3">Offreurs</th>
                <th className="p-3">Diagnostic</th>
              </tr>
            </thead>
            <tbody>
              {data.cells.map((c) => (
                <tr key={`${c.lat}${c.lng}`} className="border-b border-border align-top last:border-0">
                  <td className="p-3">
                    <a className="font-mono text-xs text-primary" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=13/${c.lat}/${c.lng}`}>
                      {c.lat.toFixed(2)}, {c.lng.toFixed(2)}
                    </a>
                  </td>
                  <td className="p-3 tabular-nums">{c.demand}</td>
                  <td className="p-3 tabular-nums">{c.unanswered}</td>
                  <td className="p-3 tabular-nums">{c.supply}</td>
                  <td className="p-3">
                    <Badge tone={ST[c.status].tone}>{ST[c.status].label}</Badge>
                    <p className="mt-1 max-w-sm text-xs text-muted">{ST[c.status].action}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
