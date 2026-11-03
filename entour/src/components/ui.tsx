"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Star, X } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const cx = clsx;

/* ───────── Boutons ───────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover shadow-[0_6px_16px_-8px_var(--primary)]",
  secondary: "bg-primary-soft text-primary hover:brightness-95",
  ghost: "text-text hover:bg-surface-2",
  outline: "border border-border bg-surface text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-95",
  success: "bg-success text-white hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-xl gap-2",
  lg: "h-13 px-6 text-base rounded-2xl gap-2",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode; full?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading, icon, full, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap",
        variants[variant],
        sizes[size],
        full && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", size = "md", className, children, icon, full }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode; icon?: ReactNode; full?: boolean }) {
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center font-semibold transition active:scale-[0.98]", variants[variant], sizes[size], full && "w-full", className)}>
      {icon}
      {children}
    </Link>
  );
}

/* ───────── Champs ───────── */

export function Field({ label, hint, error, children, className, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-text">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-text placeholder:text-muted/70 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputBase, "py-3 min-h-24 resize-y leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(inputBase, "h-11 pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 fill=%22none%22 stroke=%22%236b6880%22 stroke-width=%222%22><path d=%22m3 4.5 3 3 3-3%22/></svg>')] bg-no-repeat bg-[right_12px_center]", className)} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex items-start justify-between gap-4 py-2", disabled ? "opacity-60" : "cursor-pointer")}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[15px] font-medium">{label}</span>}
          {description && <span className="block text-sm text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-success" : "bg-border")}
      >
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 32 }} className={cx("absolute top-1 size-5 rounded-full bg-white shadow", checked ? "right-1" : "left-1")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cx("inline-flex rounded-2xl bg-surface-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("relative flex-1 rounded-xl font-semibold transition", size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm", value === o.value ? "text-text" : "text-muted hover:text-text")}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-xl bg-surface shadow-card" transition={{ type: "spring", stiffness: 400, damping: 35 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, icon, className }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition active:scale-95",
        active ? "border-primary bg-primary text-primary-ink" : "border-border bg-surface text-text hover:border-primary/40",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ───────── Affichage ───────── */

export function Card({ className, children, as: As = "div", ...rest }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" } & Record<string, unknown>) {
  return (
    <As className={cx("rounded-3xl border border-border bg-surface shadow-card", className)} {...rest}>
      {children}
    </As>
  );
}

export function Badge({ tone = "neutral", children, className, icon }: { tone?: "neutral" | "primary" | "success" | "warning" | "danger"; children: ReactNode; className?: string; icon?: ReactNode }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{icon}{children}</span>;
}

export function Avatar({ src, name, size = 40, className, online }: { src?: string | null; name: string; size?: number; className?: string; online?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span className={cx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full rounded-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full font-bold text-white" style={{ background: `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue + 40) % 360} 65% 45%))`, fontSize: size * 0.38 }}>
          {initials || "?"}
        </span>
      )}
      {online && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-success" />}
    </span>
  );
}

export function Stars({ value, count, size = 14, showValue = true }: { value: number; count?: number; size?: number; showValue?: boolean }) {
  if (count === 0) return <span className="text-xs font-medium text-muted">Nouveau</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="fill-[#F5B014] text-[#F5B014]" style={{ width: size, height: size }} />
      {showValue && <span className="font-semibold">{value.toFixed(1).replace(".", ",")}</span>}
      {count != null && <span className="text-muted">({count})</span>}
    </span>
  );
}

export function StarInput({ value, onChange, size = 32, label }: { value: number; onChange: (v: number) => void; size?: number; label?: string }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button whileTap={{ scale: 0.85 }} key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} onClick={() => onChange(n)}>
          <Star className={cx("transition", n <= value ? "fill-[#F5B014] text-[#F5B014]" : "text-border")} style={{ width: size, height: size }} />
        </motion.button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("relative overflow-hidden rounded-xl bg-surface-2 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent", className)} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-primary-soft text-primary">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Une erreur est survenue";
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
      <p className="font-semibold">Impossible de charger ces informations</p>
      <p className="mt-0.5 opacity-90">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Réessayer
        </button>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} />;
}

export function SectionTitle({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ───────── Fenêtres ───────── */

export function Sheet({ open, onClose, title, children, footer, size = "md" }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "md" | "lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cx("relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")}
          >
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border sm:hidden" />
            {title && (
              <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-4">
                <h2 className="text-lg font-bold">{title}</h2>
                <button onClick={onClose} aria-label="Fermer" className="rounded-full p-2 text-muted hover:bg-surface-2">
                  <X className="size-5" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
            {footer && <div className="border-t border-border px-5 py-4 pb-safe">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Confirm({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  tone = "primary",
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger" | "success";
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" full onClick={onClose}>
            Annuler
          </Button>
          <Button variant={tone} full onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {description && <p className="text-[15px] text-muted">{description}</p>}
      {children}
    </Sheet>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: ReactNode; subtitle?: ReactNode; back?: string | boolean; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start gap-3">
      {back && <BackButton href={typeof back === "string" ? back : undefined} />}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function BackButton({ href }: { href?: string }) {
  const cls = "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text hover:bg-surface-2";
  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
  if (href)
    return (
      <Link href={href} aria-label="Retour" className={cls}>
        {icon}
      </Link>
    );
  return (
    <button type="button" aria-label="Retour" className={cls} onClick={() => history.back()}>
      {icon}
    </button>
  );
}

export function Stat({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function SimulationBanner({ className }: { className?: string }) {
  return (
    <div className={cx("rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning", className)}>
      <strong>Mode simulation</strong> — aucun paiement réel n'est effectué. Les montants sont fictifs et identifiés comme tels.
    </div>
  );
}
