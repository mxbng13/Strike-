"use client";

import { BarChart3, Flag, Gavel, Globe2, LayoutGrid, Megaphone, ScrollText, Settings, ShieldCheck, Users, Wallet, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./shell";
import { cx } from "./ui";

const ROLE: Record<string, string> = { super_admin: "Super-administrateur", moderator: "Modérateur", support: "Support" };

export function AdminNav({ role, name, perms }: { role: string; name: string; perms: Record<string, boolean> }) {
  const path = usePathname();
  const links = [
    { href: "/admin", label: "Tableau de bord", icon: BarChart3, show: true },
    { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, show: perms.users },
    { href: "/admin/moderation", label: "Modération", icon: ShieldCheck, show: perms.moderation },
    { href: "/admin/signalements", label: "Signalements", icon: Flag, show: perms.reports },
    { href: "/admin/litiges", label: "Litiges", icon: Gavel, show: perms.disputes },
    { href: "/admin/zones", label: "Zones & lancement", icon: Globe2, show: true },
    { href: "/admin/finances", label: "Finances", icon: Wallet, show: perms.finance },
    { href: "/admin/catalogue", label: "Catégories & badges", icon: LayoutGrid, show: perms.catalog },
    { href: "/admin/communication", label: "Communication", icon: Megaphone, show: perms.comms },
    { href: "/admin/parametres", label: "Paramètres", icon: Settings, show: perms.settings },
    { href: "/admin/journaux", label: "Journaux", icon: ScrollText, show: perms.logs },
  ].filter((l) => l.show);
  return (
    <aside className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/admin" className="text-text">
          <Logo />
        </Link>
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase text-primary">Admin</span>
      </div>
      <p className="px-4 pb-2 text-xs text-muted">
        {name} · {ROLE[role]}
      </p>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-3 scrollbar-none lg:flex-col lg:overflow-visible">
        {links.map((l) => {
          const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={cx("flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-primary-soft text-primary" : "hover:bg-surface-2")}>
              <l.icon className="size-4" /> {l.label}
            </Link>
          );
        })}
        <Link href="/accueil" className="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 lg:mt-4">
          <ArrowLeft className="size-4" /> Retour à l'app
        </Link>
      </nav>
    </aside>
  );
}
