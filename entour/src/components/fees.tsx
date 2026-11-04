"use client";

import { PiggyBank } from "lucide-react";
import useSWR from "swr";
import { computeFees, DEFAULT_COMMISSION_PCT, formatEUR } from "@/lib/money";
import { cx } from "./ui";

export function useCommissionPct() {
  const { data } = useSWR<{ commissionPct: number }>("/api/fees", { revalidateOnFocus: false });
  return data?.commissionPct ?? DEFAULT_COMMISSION_PCT;
}

/** Phrase courte répétée partout : ce qu'ENTOUR prend, et sur quoi. */
export function CommissionLine({ pct, className }: { pct?: number; className?: string }) {
  const fallback = useCommissionPct();
  return (
    <p className={cx("text-xs text-muted", className)}>
      ENTOUR prend <strong className="text-text">{pct ?? fallback} %</strong> seulement, et uniquement sur la rémunération : jamais sur le prix des achats.
    </p>
  );
}

/**
 * Détail de l'argent d'une mission.
 * perspective « requester » : ce que je bloque dans la tirelire ; « provider » : ce que je recevrai.
 */
export function MoneyBreakdown({ serviceCents, purchaseCents = 0, perspective, otherName, pct, className }: { serviceCents: number | null; purchaseCents?: number | null; perspective: "requester" | "provider"; otherName?: string; pct?: number; className?: string }) {
  const fallback = useCommissionPct();
  const rate = pct ?? fallback;
  if (serviceCents == null) return <CommissionLine pct={rate} className={className} />;
  const f = computeFees(serviceCents, { providerCommissionPct: rate, payerServiceFeePct: 0, payerServiceFeeFixedCents: 0, minFeeCents: 0 }, undefined, purchaseCents ?? 0);
  const Row = ({ l, v, muted, strong }: { l: React.ReactNode; v: string; muted?: boolean; strong?: boolean }) => (
    <div className={cx("flex items-baseline justify-between gap-3", muted && "text-muted", strong && "font-bold")}>
      <span>{l}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{v}</span>
    </div>
  );
  return (
    <div className={cx("space-y-1.5 rounded-2xl bg-surface-2 p-4 text-sm", className)}>
      {f.purchaseCents > 0 && <Row l="Achats à avancer (0 % de commission)" v={formatEUR(f.purchaseCents)} />}
      <Row l="Rémunération du service" v={formatEUR(f.serviceCents)} />
      <Row l={`Commission ENTOUR (${rate} % de la rémunération)`} v={`− ${formatEUR(f.platformFeeCents)}`} muted />
      <div className="my-1 border-t border-border" />
      {perspective === "requester" ? (
        <>
          <Row
            l={
              <span className="inline-flex items-center gap-1.5">
                <PiggyBank className="size-4 text-primary" /> Bloqué dans la tirelire ENTOUR
              </span>
            }
            v={formatEUR(f.totalChargedCents)}
            strong
          />
          <Row l={`Versé à ${otherName ?? "l'intervenant"} à la fin de la mission`} v={formatEUR(f.providerNetCents)} muted />
        </>
      ) : (
        <Row l={f.purchaseCents > 0 ? `Vous recevrez (achats remboursés + rémunération)` : "Vous recevrez"} v={formatEUR(f.providerNetCents)} strong />
      )}
      <p className="pt-1 text-xs text-muted">
        L'argent reste bloqué sur ENTOUR et n'est versé qu'à la fin, une fois la mission confirmée.
        {f.purchaseCents > 0 && perspective === "provider" && " N'avancez aucun achat avant que la tirelire soit remplie."}
      </p>
    </div>
  );
}
