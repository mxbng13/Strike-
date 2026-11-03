"use client";

import { useState } from "react";
import { cx } from "./ui";

/**
 * Graphiques légers (sans bibliothèque) : une seule série par graphique (pas de double axe),
 * barres fines à bout arrondi ancrées sur la ligne de base, survol avec info-bulle, vue tableau.
 */
export function DailyBars({ data, color = "var(--chart-1)", label, height = 140 }: { data: { day: string; value: number }[]; color?: string; label: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <button onClick={() => setTable((t) => !t)} className="text-xs font-medium text-muted underline-offset-2 hover:underline">
          {table ? "Graphique" : "Tableau"}
        </button>
      </div>
      {table ? (
        <div className="max-h-48 overflow-y-auto text-sm">
          <table className="w-full">
            <tbody>
              {data.map((d) => (
                <tr key={d.day} className="border-b border-border last:border-0">
                  <td className="py-1 text-muted">{fmt(d.day)}</td>
                  <td className="py-1 text-right font-semibold tabular-nums">{d.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-end gap-[2px] border-b border-chart-grid" style={{ height }} onMouseLeave={() => setHover(null)} role="img" aria-label={`${label} : ${total} sur ${data.length} jours`}>
            {data.map((d, i) => (
              <div key={d.day} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
                <div className={cx("w-full rounded-t-[4px] transition-opacity", hover != null && hover !== i && "opacity-40")} style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, background: color }} />
              </div>
            ))}
          </div>
          {hover != null && (
            <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs shadow-xl" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
              <p className="text-muted">{fmt(data[hover].day)}</p>
              <p className="font-bold tabular-nums">{data[hover].value}</p>
            </div>
          )}
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>{data[0] && fmt(data[0].day)}</span>
            <span>Max {max}</span>
            <span>{data.at(-1) && fmt(data.at(-1)!.day)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function HBars({ data, color = "var(--chart-1)", format = (n: number) => String(n) }: { data: { label: string; value: number }[]; color?: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-muted">Pas encore de données.</p>;
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm" title={`${d.label} : ${format(d.value)}`}>
          <span className="truncate">{d.label}</span>
          <span className="font-semibold tabular-nums">{format(d.value)}</span>
          <span className="col-span-2 h-2 overflow-hidden rounded-r-[4px] bg-surface-2">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
