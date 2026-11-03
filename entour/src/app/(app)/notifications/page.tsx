"use client";

import { motion } from "framer-motion";
import { Award, Bell, CalendarClock, CheckCheck, CircleDollarSign, Clock, Megaphone, MessageCircle, ShieldAlert, Star, UserPlus, Users, Zap } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { useMe } from "@/components/providers";
import { Button, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/dates";

type N = { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

const ICONS: Record<string, React.ReactNode> = {
  new_mission: <Bell className="size-4" />,
  urgent_mission: <Zap className="size-4" />,
  application_received: <Users className="size-4" />,
  application_accepted: <CheckCheck className="size-4" />,
  application_rejected: <Users className="size-4" />,
  application_waitlisted: <Clock className="size-4" />,
  message: <MessageCircle className="size-4" />,
  price_change: <CircleDollarSign className="size-4" />,
  schedule_change: <CalendarClock className="size-4" />,
  mission_reminder: <Clock className="size-4" />,
  mission_late: <Clock className="size-4" />,
  payment: <CircleDollarSign className="size-4" />,
  review_received: <Star className="size-4" />,
  badge: <Award className="size-4" />,
  dispute: <ShieldAlert className="size-4" />,
  moderation: <ShieldAlert className="size-4" />,
  announcement: <Megaphone className="size-4" />,
  follow: <UserPlus className="size-4" />,
};

export default function NotificationsPage() {
  const { mutate: mutateMe } = useMe();
  const { data, error, isLoading, mutate } = useSWR<{ notifications: N[]; unread: number }>("/api/notifications");
  const markAll = async () => {
    await api("/api/notifications", { body: {} });
    await Promise.all([mutate(), mutateMe()]);
  };
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        action={
          data?.unread ? (
            <Button size="sm" variant="ghost" onClick={markAll} icon={<CheckCheck className="size-4" />}>
              Tout marquer comme lu
            </Button>
          ) : (
            <Link href="/parametres#notifications" className="text-sm font-semibold text-primary">
              Réglages
            </Link>
          )
        }
      />
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {isLoading && <Skeleton className="h-60" />}
      {data && data.notifications.length === 0 && <EmptyState icon={<Bell className="size-7" />} title="Rien de neuf" description="Vous serez prévenu(e) ici des nouvelles demandes autour de vous, des réponses et des messages." />}
      <ul className="space-y-1">
        {data?.notifications.map((n, i) => {
          const content = (
            <>
              <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-2xl", n.type === "urgent_mission" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary")}>{ICONS[n.type] ?? <Bell className="size-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-[15px]", !n.readAt && "font-bold")}>{n.title}</span>
                {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                <span className="block text-xs text-muted">{timeAgo(n.createdAt)}</span>
              </span>
              {!n.readAt && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" />}
            </>
          );
          return (
            <motion.li key={n.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => !n.readAt && api("/api/notifications", { body: { id: n.id } }).then(() => mutateMe())}
                  className={cx("flex items-start gap-3 rounded-2xl p-3 transition hover:bg-surface", !n.readAt && "bg-surface")}
                >
                  {content}
                </Link>
              ) : (
                <div className={cx("flex items-start gap-3 rounded-2xl p-3", !n.readAt && "bg-surface")}>{content}</div>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
