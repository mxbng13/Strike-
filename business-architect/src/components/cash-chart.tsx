"use client";

import { useState } from "react";

type Row = { month: number; cashBalance: number };
type Series = { key: string; label: string; color: string; rows: Row[] };

/**
 * Cash balance per scenario (real projections from the financial engine).
 * Palette: categorical slots 1-3 of the reference palette, validated (light);
 * the low-contrast slot is relieved by the legend, direct end labels and the table view.
 */
export function CashChart({ series }: { series: Series[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 260, L = 64, R = 96, T = 16, B = 32;
  const months = series[0]?.rows.map((r) => r.month) ?? [];
  const all = series.flatMap((s) => s.rows.map((r) => r.cashBalance));
  const min = Math.min(0, ...all), max = Math.max(0, ...all);
  const pad = (max - min) * 0.08 || 100;
  const y0 = min - pad, y1 = max + pad;
  const x = (m: number) => L + ((m - 1) / Math.max(1, months.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  const fmt = (v: number) => v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold">Trésorerie fin de mois par scénario (€)</figcaption>
      <div className="mb-2 flex flex-wrap gap-4 text-xs" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1 text-ink-2"><span className="inline-block h-0.5 w-4" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Courbes de trésorerie des scénarios pessimiste, central et optimiste" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const m = Math.round(((px - L) / (W - L - R)) * (months.length - 1)) + 1;
          setHover(m >= 1 && m <= months.length ? m : null);
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e4e3de" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#55544e">{fmt(t)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#1c1c1a" strokeWidth={1} strokeDasharray="4 3" />
        {months.filter((m) => m === 1 || m % 6 === 0).map((m) => <text key={m} x={x(m)} y={H - 10} textAnchor="middle" fontSize="10" fill="#55544e">M{m}</text>)}
        {series.map((s) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" points={s.rows.map((r) => `${x(r.month)},${y(r.cashBalance)}`).join(" ")} />
            {s.rows.length > 0 && <text x={W - R + 6} y={y(s.rows.at(-1)!.cashBalance) + 4} fontSize="10" fill="#1c1c1a">{s.label}</text>}
          </g>
        ))}
        {hover && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#55544e" strokeWidth={1} />
            {series.map((s) => {
              const r = s.rows.find((q) => q.month === hover);
              return r ? <circle key={s.key} cx={x(hover)} cy={y(r.cashBalance)} r={4} fill={s.color} stroke="#fcfcfb" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      <p className="min-h-5 text-xs text-ink-2" aria-live="polite">
        {hover ? `Mois ${hover} : ${series.map((s) => `${s.label} ${fmt(s.rows.find((r) => r.month === hover)?.cashBalance ?? 0)}`).join(" · ")}` : "Survole le graphique pour lire les valeurs. Le tableau détaillé figure dans le modèle financier."}
      </p>
    </figure>
  );
}
