"use client";

import { motion } from "framer-motion";
import { Archive, BellOff, MessageCircle, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { TopIcons } from "@/components/shell";
import { Avatar, EmptyState, ErrorState, Input, PageHeader, Segmented, Skeleton, cx } from "@/components/ui";
import { timeAgo } from "@/lib/dates";

type Conv = {
  id: string;
  kind: string;
  serviceTitle: string | null;
  serviceStatus: string | null;
  other: { id: string; firstName: string; avatarUrl: string | null };
  lastMessage: { body: string; kind: string; mine: boolean; at: string } | null;
  unread: number;
  archived: boolean;
  muted: boolean;
};

const preview = (m: Conv["lastMessage"]) => {
  if (!m) return "Nouvelle conversation";
  const map: Record<string, string> = { image: "📷 Photo", video: "🎬 Vidéo", file: "📎 Document", audio: "🎤 Message vocal", location: "📍 Position partagée" };
  return `${m.mine ? "Vous : " : ""}${map[m.kind] ?? m.body}`;
};

export default function MessagesPage() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const key = `/api/conversations?${new URLSearchParams({ ...(tab === "archived" ? { archived: "1" } : {}), ...(debounced ? { q: debounced } : {}) })}`;
  const { data, error, isLoading, mutate } = useSWR<{ conversations: Conv[] }>(key, { refreshInterval: 30_000 });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Messages" action={<TopIcons />} />
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout((window as unknown as { __mq?: number }).__mq);
              (window as unknown as { __mq?: number }).__mq = window.setTimeout(() => setDebounced(e.target.value), 300);
            }}
            placeholder="Rechercher une personne, une mission ou un message"
            className="pl-10"
          />
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: "active", label: "Conversations" }, { value: "archived", label: "Archivées" }]} />
      </div>
      {error && <ErrorState error={error} onRetry={() => mutate()} />}
      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}
      {data && data.conversations.length === 0 && (
        <EmptyState
          icon={tab === "archived" ? <Archive className="size-7" /> : <MessageCircle className="size-7" />}
          title={debounced ? "Aucun résultat" : tab === "archived" ? "Aucune conversation archivée" : "Pas encore de conversation"}
          description={debounced ? "Essayez avec d'autres mots." : "Chaque mission a sa propre conversation. Répondez à une demande ou publiez la vôtre pour commencer à échanger."}
        />
      )}
      <ul className="space-y-1">
        {data?.conversations.map((c, i) => (
          <motion.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.025 }}>
            <Link href={`/messages/${c.id}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-surface">
              <Avatar src={c.other.avatarUrl} name={c.other.firstName} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cx("truncate", c.unread ? "font-extrabold" : "font-semibold")}>{c.other.firstName}</p>
                  {c.lastMessage && <span className={cx("shrink-0 text-xs", c.unread ? "font-semibold text-primary" : "text-muted")}>{timeAgo(c.lastMessage.at)}</span>}
                </div>
                {c.serviceTitle && <p className="truncate text-xs font-medium text-primary">{c.serviceTitle}</p>}
                <div className="flex items-center gap-2">
                  <p className={cx("min-w-0 flex-1 truncate text-sm", c.unread ? "font-semibold text-text" : "text-muted")}>{preview(c.lastMessage)}</p>
                  {c.muted && <BellOff className="size-3.5 text-muted" />}
                  {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-ink">{c.unread}</span>}
                </div>
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
