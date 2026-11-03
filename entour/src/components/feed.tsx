"use client";

import { motion } from "framer-motion";
import { Heart, MessageSquareHeart, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/client";
import { timeAgo } from "@/lib/dates";
import { useToast } from "./providers";
import { ReportButton } from "./report-button";
import { Avatar, Button, Card, EmptyState, Segmented, Select, Skeleton, Textarea, cx } from "./ui";

type Post = {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
  likesCount: number;
  liked: boolean;
  areaLabel: string;
  author: { id: string; firstName: string; avatarUrl: string | null };
  thanked: { id: string; firstName: string; avatarUrl: string | null } | null;
  group: { name: string; slug: string } | null;
};

export function Feed({ groupId, canPost = true }: { groupId?: string; canPost?: boolean }) {
  const { push } = useToast();
  const key = `/api/community/posts${groupId ? `?groupId=${groupId}` : ""}`;
  const { data, error, mutate } = useSWR<{ posts: Post[] }>(key);
  const { data: people } = useSWR<{ people: { id: string; first_name: string }[] }>("/api/missions");
  const [kind, setKind] = useState<"post" | "thanks" | "offer">("post");
  const [body, setBody] = useState("");
  const [thanked, setThanked] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <div className="space-y-4">
      {canPost && (
        <Card className="space-y-3 p-4">
          <Segmented
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: "post", label: "Message" },
              { value: "offer", label: "Je propose" },
              { value: "thanks", label: "Remercier" },
            ]}
          />
          {kind === "thanks" && (
            <Select value={thanked} onChange={(e) => setThanked(e.target.value)}>
              <option value="">Qui voulez-vous remercier ?</option>
              {people?.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name}
                </option>
              ))}
            </Select>
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            maxLength={1500}
            placeholder={kind === "thanks" ? "Un grand merci à … pour …" : kind === "offer" ? "Ex : je vais à la déchetterie samedi matin, je peux emporter vos encombrants" : "Partagez une info utile avec votre quartier"}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              icon={<Send className="size-4" />}
              loading={sending}
              disabled={body.trim().length < 3 || (kind === "thanks" && !thanked)}
              onClick={async () => {
                setSending(true);
                try {
                  await api("/api/community/posts", { body: { body, kind, groupId: groupId ?? null, thankedUserId: kind === "thanks" ? thanked : null } });
                  setBody("");
                  setThanked("");
                  await mutate();
                } catch (e) {
                  push({ tone: "error", title: (e as Error).message });
                } finally {
                  setSending(false);
                }
              }}
            >
              Publier
            </Button>
          </div>
        </Card>
      )}
      {error && <p className="text-sm text-danger">{(error as Error).message}</p>}
      {!data && !error && <Skeleton className="h-40" />}
      {data && data.posts.length === 0 && <EmptyState icon={<MessageSquareHeart className="size-7" />} title="Le fil est encore vide" description="Soyez le premier à partager une info, proposer un coup de main ou remercier un voisin." />}
      {data?.posts.map((p, i) => (
        <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
          <Card className={cx("p-4", p.kind === "thanks" && "border-success/30")}>
            <div className="flex items-center gap-3">
              <Link href={`/u/${p.author.id}`}>
                <Avatar src={p.author.avatarUrl} name={p.author.firstName} size={40} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link href={`/u/${p.author.id}`} className="font-bold">
                    {p.author.firstName}
                  </Link>
                  {p.kind === "thanks" && p.thanked && (
                    <>
                      {" "}
                      remercie{" "}
                      <Link href={`/u/${p.thanked.id}`} className="font-bold text-success">
                        {p.thanked.firstName}
                      </Link>{" "}
                      💛
                    </>
                  )}
                  {p.kind === "offer" && <span className="text-muted"> propose un coup de main</span>}
                </p>
                <p className="text-xs text-muted">
                  {p.group ? (
                    <Link href={`/communaute/groupes/${p.group.slug}`} className="font-medium text-primary">
                      {p.group.name}
                    </Link>
                  ) : (
                    p.areaLabel
                  )}{" "}
                  · {timeAgo(p.createdAt)}
                </p>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-line text-[15px]">{p.body}</p>
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={async () => {
                  await api(`/api/community/posts/${p.id}/like`, { body: {} });
                  mutate();
                }}
                className={cx("inline-flex items-center gap-1.5 text-sm font-semibold", p.liked ? "text-danger" : "text-muted")}
              >
                <Heart className={cx("size-4", p.liked && "fill-current")} /> {p.likesCount || ""}
              </button>
              <ReportButton targetType="post" targetId={p.id} className="text-xs text-muted hover:text-danger" />
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
