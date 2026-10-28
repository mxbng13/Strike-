import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-white p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  gray: "bg-gray-100 text-gray-800",
  blue: "bg-brand-50 text-brand-700",
  green: "bg-green-50 text-green-800",
  amber: "bg-amber-50 text-amber-900",
  red: "bg-red-50 text-red-800",
  violet: "bg-violet-50 text-violet-800",
} as const;

export function Badge({ tone = "gray", children, title }: { tone?: keyof typeof TONES; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

const STATUS: Record<string, { label: string; tone: keyof typeof TONES; icon: string }> = {
  intake: { label: "Questions initiales", tone: "gray", icon: "✎" },
  ready: { label: "Prêt à lancer", tone: "blue", icon: "▶" },
  running: { label: "En cours", tone: "blue", icon: "⟳" },
  paused: { label: "En pause", tone: "amber", icon: "⏸" },
  awaiting_approval: { label: "Approbations en attente", tone: "violet", icon: "✋" },
  blocked: { label: "Bloqué", tone: "red", icon: "⚠" },
  completed: { label: "Terminé", tone: "green", icon: "✓" },
  failed: { label: "Échec", tone: "red", icon: "✕" },
  pending: { label: "En attente", tone: "gray", icon: "…" },
  queued: { label: "En file", tone: "gray", icon: "…" },
  succeeded: { label: "Terminé", tone: "green", icon: "✓" },
  paused_budget: { label: "Suspendu (budget)", tone: "amber", icon: "€" },
  cancelled: { label: "Remplacé / annulé", tone: "gray", icon: "–" },
  in_progress: { label: "En cours", tone: "blue", icon: "⟳" },
  done: { label: "Terminé", tone: "green", icon: "✓" },
  skipped: { label: "Ignoré", tone: "gray", icon: "–" },
  draft: { label: "Brouillon", tone: "gray", icon: "✎" },
  in_review: { label: "En revue", tone: "blue", icon: "👁" },
  validated: { label: "Validé QA", tone: "green", icon: "✓" },
  incomplete: { label: "Incomplet", tone: "red", icon: "⚠" },
  rejected: { label: "Rejeté", tone: "red", icon: "✕" },
  approved: { label: "Approuvé", tone: "green", icon: "✓" },
  executed: { label: "Exécuté", tone: "green", icon: "✓" },
  execution_failed: { label: "Exécution échouée", tone: "red", icon: "✕" },
  selected: { label: "Retenu", tone: "green", icon: "★" },
  shortlisted: { label: "Comparé", tone: "blue", icon: "≡" },
  proposed: { label: "Proposé", tone: "gray", icon: "·" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "gray" as const, icon: "·" };
  return (
    <Badge tone={s.tone}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </Badge>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  if (mode === "heuristic") return <Badge tone="amber" title="Produit sans modèle de langage, à partir des données de recherche et de règles déterministes">Mode heuristique</Badge>;
  if (mode === "llm") return <Badge tone="violet">Généré par IA</Badge>;
  if (mode === "deterministic") return <Badge tone="blue">Calcul déterministe</Badge>;
  if (mode === "user") return <Badge tone="gray">Idée utilisateur</Badge>;
  return null;
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const cls = variant === "primary" ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-line bg-white text-ink hover:bg-gray-50";
  return (
    <Link href={href} className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${cls}`}>
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-2">{children}</p>;
}

export const fmtEur = (n: number | null | undefined, d = 0) => (n == null ? "n/d" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: d, minimumFractionDigits: d }));
export const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
