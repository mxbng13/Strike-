"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { Bell, CalendarDays, Compass, Heart, Home, Map, MessageCircle, Plus, ShieldCheck, User, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "./ui";
import { useMe, useMode } from "./providers";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-extrabold tracking-tight", className)}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="var(--primary)" />
        <circle cx="16" cy="16" r="9" fill="none" stroke="var(--bg)" strokeWidth="2.5" strokeDasharray="44 13" strokeLinecap="round" />
        <circle cx="16" cy="16" r="3.2" fill="var(--bg)" />
      </svg>
      <span className="text-[22px] leading-none">entour</span>
    </span>
  );
}

const tabs = [
  { href: "/accueil", label: "Accueil", icon: Home },
  { href: "/carte", label: "Carte", icon: Map },
  { href: "/publier", label: "Publier", icon: Plus, primary: true },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profil", label: "Profil", icon: User },
];

function Dot({ n }: { n: number }) {
  if (!n) return null;
  return <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">{n > 99 ? "99+" : n}</span>;
}

export function BottomNav() {
  const path = usePathname();
  const { unread } = useMe();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/90 backdrop-blur-xl pb-safe lg:hidden" aria-label="Navigation principale">
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {tabs.map((t) => {
          const active = path === t.href || path.startsWith(t.href + "/");
          const Icon = t.icon;
          if (t.primary)
            return (
              <li key={t.href} className="flex items-center justify-center">
                <Link href={t.href} aria-label="Publier une demande" className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-ink shadow-[0_10px_24px_-8px_var(--primary)] transition active:scale-95">
                  <Plus className="size-7" strokeWidth={2.5} />
                </Link>
              </li>
            );
          return (
            <li key={t.href}>
              <Link href={t.href} className={clsx("relative flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-primary" : "text-muted")}>
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
                  {t.href === "/messages" && <Dot n={unread.messages} />}
                </span>
                {t.label}
                {active && <motion.span layoutId="tab-dot" className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const sideLinks = [
  { href: "/accueil", label: "Accueil", icon: Home },
  { href: "/carte", label: "Carte", icon: Map },
  { href: "/explorer", label: "Explorer", icon: Compass },
  { href: "/messages", label: "Messages", icon: MessageCircle, badge: "messages" as const },
  { href: "/notifications", label: "Notifications", icon: Bell, badge: "notifications" as const },
  { href: "/mes-missions", label: "Mes missions", icon: CalendarDays },
  { href: "/revenus", label: "Revenus & dépenses", icon: Wallet },
  { href: "/communaute", label: "Communauté", icon: Users },
  { href: "/favoris", label: "Favoris", icon: Heart },
];

export function Sidebar() {
  const path = usePathname();
  const { me, unread } = useMe();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface px-4 py-5 lg:flex">
      <Link href="/accueil" className="px-2 text-text">
        <Logo />
      </Link>
      <Link href="/publier" className="mt-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary font-semibold text-primary-ink shadow-[0_10px_24px_-10px_var(--primary)] transition hover:bg-primary-hover active:scale-[0.98]">
        <Plus className="size-5" strokeWidth={2.5} /> Publier une demande
      </Link>
      <ModeSwitch className="mt-4" />
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto">
        {sideLinks.map((l) => {
          const active = path === l.href || path.startsWith(l.href + "/");
          const Icon = l.icon;
          const n = l.badge ? unread[l.badge] : 0;
          return (
            <Link key={l.href} href={l.href} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition", active ? "bg-primary-soft text-primary" : "text-text hover:bg-surface-2")}>
              <Icon className="size-5" />
              <span className="flex-1">{l.label}</span>
              {n > 0 && <span className="rounded-full bg-danger px-1.5 text-xs font-bold text-white">{n}</span>}
            </Link>
          );
        })}
        {me?.adminRole && (
          <Link href="/admin" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-text hover:bg-surface-2">
            <ShieldCheck className="size-5" /> Administration
          </Link>
        )}
      </nav>
      {me && (
        <Link href="/profil" className="mt-3 flex items-center gap-3 rounded-2xl border border-border p-2.5 hover:bg-surface-2">
          <Avatar src={me.avatarUrl} name={`${me.firstName} ${me.lastName}`} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{me.firstName}</span>
            <span className="block text-xs text-muted">Mon profil</span>
          </span>
        </Link>
      )}
    </aside>
  );
}

export function ModeSwitch({ className }: { className?: string }) {
  const { mode, setMode } = useMode();
  return (
    <div className={clsx("grid grid-cols-2 rounded-2xl bg-surface-2 p-1 text-sm font-semibold", className)} role="tablist" aria-label="Mode d'utilisation">
      {(["demandeur", "offreur"] as const).map((m) => (
        <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={clsx("relative rounded-xl py-2 transition", mode === m ? "text-text" : "text-muted")}>
          {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-xl bg-surface shadow-card" transition={{ type: "spring", stiffness: 400, damping: 35 }} />}
          <span className="relative">{m === "demandeur" ? "J'ai besoin d'aide" : "Je rends service"}</span>
        </button>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 lg:pb-12 lg:pt-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

export function TopIcons() {
  const { unread } = useMe();
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <Link href="/notifications" aria-label="Notifications" className="relative flex size-10 items-center justify-center rounded-full border border-border bg-surface">
        <Bell className="size-5" />
        <Dot n={unread.notifications} />
      </Link>
    </div>
  );
}
