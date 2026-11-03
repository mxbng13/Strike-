"use client";

import {
  Award,
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  Crown,
  Gift,
  Heart,
  HelpCircle,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Wallet,
  Wrench,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useMe, useMode } from "@/components/providers";
import { ModeSwitch, TopIcons } from "@/components/shell";
import { Avatar, Badge, Card, Skeleton, Stars } from "@/components/ui";
import { api } from "@/lib/client";
import type { PublicProfile } from "@/server/users";

type Overview = { profile: PublicProfile; loyalty: { points: number; level: number; name: string; next: number | null; progress: number }; subscription: { plan: string } | null; verifications: { type: string; status: string }[] };

function Row({ href, icon, label, hint, badge }: { href: string; icon: React.ReactNode; label: string; hint?: string; badge?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-surface-2 text-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      {badge}
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}

export default function ProfileHub() {
  const { me } = useMe();
  const { mode } = useMode();
  const router = useRouter();
  const { data } = useSWR<Overview>("/api/me/overview");
  const p = data?.profile;
  const verifiedCount = [me?.emailVerified, me?.phoneVerified, me?.identityVerified].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Profil</h1>
        <TopIcons />
      </div>

      <Card className="p-5">
        {me && p ? (
          <Link href={`/u/${me.id}`} className="flex items-center gap-4">
            <Avatar src={me.avatarUrl} name={`${me.firstName} ${me.lastName}`} size={68} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-xl font-extrabold">
                {me.firstName} {me.lastName}
                {me.phoneVerified && me.identityVerified && <BadgeCheck className="size-5 text-primary" />}
              </p>
              <Stars value={p.ratingAvg} count={p.ratingCount} />
              <p className="text-sm text-primary">Voir mon profil public</p>
            </div>
          </Link>
        ) : (
          <Skeleton className="h-16" />
        )}
        {data && (
          <Link href="/profil/reputation" className="mt-4 block rounded-2xl bg-primary-soft p-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-bold text-primary">
                <Award className="size-4" /> Niveau {data.loyalty.level} · {data.loyalty.name}
              </span>
              <span className="font-semibold">{data.loyalty.points} pts</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(data.loyalty.progress * 100)}%` }} />
            </div>
            {data.loyalty.next && <p className="mt-1 text-xs text-muted">Encore {data.loyalty.next - data.loyalty.points} points pour le niveau suivant</p>}
          </Link>
        )}
      </Card>

      <ModeSwitch />

      <Card className="divide-y divide-border overflow-hidden">
        <Row href="/mes-missions" icon={<ClipboardList className="size-5" />} label="Mes missions" hint={mode === "offreur" ? "Candidatures, missions en cours et historique" : "Mes demandes, intervenants et historique"} />
        <Row href="/calendrier" icon={<CalendarDays className="size-5" />} label="Calendrier" hint="Missions à venir et rappels" />
        <Row href="/revenus" icon={<Wallet className="size-5" />} label={mode === "offreur" ? "Revenus" : "Dépenses"} hint="Historique des transactions et statistiques" />
        <Row href="/favoris" icon={<Heart className="size-5" />} label="Favoris & personnes de confiance" />
      </Card>

      <Card className="divide-y divide-border overflow-hidden">
        <Row href="/profil/modifier" icon={<User className="size-5" />} label="Modifier mon profil" hint="Photo, présentation, réalisations" />
        <Row href="/profil/competences" icon={<Wrench className="size-5" />} label="Mes compétences" hint="Services que je propose et alertes" />
        <Row href="/profil/disponibilites" icon={<Clock className="size-5" />} label="Mes disponibilités" />
        <Row
          href="/profil/verifications"
          icon={<ShieldCheck className="size-5" />}
          label="Vérifications"
          hint="E-mail, téléphone, identité, références"
          badge={<Badge tone={verifiedCount === 3 ? "success" : "warning"}>{verifiedCount}/3</Badge>}
        />
        <Row href="/profil/reputation" icon={<Award className="size-5" />} label="Badges, points et statistiques" />
      </Card>

      <Card className="divide-y divide-border overflow-hidden">
        <Row href="/communaute" icon={<Users className="size-5" />} label="Communauté" hint="Fil du quartier, groupes, classements" />
        <Row href="/parrainage" icon={<Gift className="size-5" />} label="Parrainage" hint="Invitez vos voisins et gagnez des points" />
        <Row href="/premium" icon={<Crown className="size-5" />} label="ENTOUR Plus & Pro" hint={data?.subscription ? `Abonnement ${data.subscription.plan === "pro" ? "Pro" : "Plus"} actif` : "Commission réduite, visibilité"} />
        <Row href="/notifications" icon={<Bell className="size-5" />} label="Notifications" />
        <Row href="/parametres" icon={<Settings className="size-5" />} label="Paramètres" hint="Notifications, confidentialité, sécurité, thème" />
        <Row href="/legal/securite" icon={<HelpCircle className="size-5" />} label="Aide & règles de sécurité" />
        {me?.adminRole && <Row href="/admin" icon={<Sparkles className="size-5" />} label="Administration" hint={me.adminRole} />}
      </Card>

      <button
        onClick={async () => {
          await api("/api/auth/logout", { body: {} });
          router.replace("/");
          router.refresh();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-danger hover:bg-danger-soft"
      >
        <LogOut className="size-5" /> Se déconnecter
      </button>
    </div>
  );
}
