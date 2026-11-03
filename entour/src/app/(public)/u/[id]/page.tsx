"use client";

import { Ban, Heart, MessageCircle, Share2, ShieldCheck, UserPlus, UserCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ProfileBody, ProfileHeader, ProfileStats } from "@/components/profile-view";
import { useAction, useMe, useToast } from "@/components/providers";
import { ReportButton } from "@/components/report-button";
import { BackButton, Button, ButtonLink, Confirm, ErrorState, Skeleton } from "@/components/ui";
import { api } from "@/lib/client";
import type { PublicProfile } from "@/server/users";

type Rel = { favorite: boolean; trusted: boolean; following: boolean; blocked: boolean; followers: number };

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useMe();
  const { push } = useToast();
  const { run, pending } = useAction();
  const { data, error, mutate } = useSWR<{ profile: PublicProfile; relation: Rel | null }>(`/api/users/${id}`);
  const [blockOpen, setBlockOpen] = useState(false);
  if (error) return <ErrorState error={error} />;
  if (!data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-56" />
        <Skeleton className="h-24" />
      </div>
    );
  const { profile: p, relation: r } = data;

  const toggle = (kind: "user" | "trusted") =>
    run(kind, async () => {
      await api("/api/favorites", { body: { kind, targetId: id } });
      await mutate();
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <BackButton />
        <button
          aria-label="Partager le profil"
          onClick={async () => {
            const url = `${window.location.origin}/u/${id}`;
            try {
              if (navigator.share) await navigator.share({ title: `${p.firstName} sur ENTOUR`, url });
              else {
                await navigator.clipboard.writeText(url);
                push({ tone: "success", title: "Lien du profil copié" });
              }
            } catch {
              /* annulé */
            }
          }}
          className="flex size-10 items-center justify-center rounded-full border border-border bg-surface"
        >
          <Share2 className="size-5" />
        </button>
      </div>

      <ProfileHeader
        p={p}
        actions={
          p.isSelf ? (
            <ButtonLink href="/profil/modifier" variant="outline" size="sm">
              Modifier mon profil
            </ButtonLink>
          ) : me && r ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<MessageCircle className="size-4" />}
                loading={pending === "dm"}
                onClick={() =>
                  run("dm", async () => {
                    const c = await api<{ id: string }>("/api/conversations", { body: { userId: id } });
                    router.push(`/messages/${c.id}`);
                  })
                }
              >
                Contacter
              </Button>
              <Button size="sm" variant={r.following ? "secondary" : "outline"} icon={r.following ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />} loading={pending === "follow"} onClick={() => run("follow", async () => { await api("/api/follows", { body: { userId: id } }); await mutate(); })}>
                {r.following ? "Suivi" : "Suivre"}
              </Button>
            </div>
          ) : null
        }
      />

      {me && r && !p.isSelf && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={r.favorite ? "secondary" : "outline"} icon={<Heart className={r.favorite ? "size-4 fill-current" : "size-4"} />} onClick={() => toggle("user")} loading={pending === "user"}>
            {r.favorite ? "Dans mes favoris" : "Ajouter aux favoris"}
          </Button>
          <Button size="sm" variant={r.trusted ? "secondary" : "outline"} icon={<ShieldCheck className="size-4" />} onClick={() => toggle("trusted")} loading={pending === "trusted"}>
            {r.trusted ? "Personne de confiance" : "Marquer comme de confiance"}
          </Button>
          <span className="self-center text-sm text-muted">
            {r.followers} abonné{r.followers > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <ProfileStats p={p} />
      <ProfileBody p={p} />

      {me && r && !p.isSelf && (
        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          <ReportButton targetType="user" targetId={id} label="ce profil" />
          <button onClick={() => setBlockOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-danger">
            <Ban className="size-4" /> {r.blocked ? "Débloquer" : "Bloquer"}
          </button>
        </div>
      )}

      <Confirm
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={r?.blocked ? `Débloquer ${p.firstName} ?` : `Bloquer ${p.firstName} ?`}
        tone={r?.blocked ? "primary" : "danger"}
        confirmLabel={r?.blocked ? "Débloquer" : "Bloquer"}
        description={r?.blocked ? undefined : "Vous ne verrez plus ses demandes et cette personne ne pourra plus vous contacter ni répondre à vos annonces."}
        onConfirm={async () => {
          await api("/api/blocks", { method: r?.blocked ? "DELETE" : "POST", body: { userId: id } });
          setBlockOpen(false);
          await mutate();
          push({ tone: "success", title: r?.blocked ? "Débloqué" : "Bloqué" });
        }}
      />
    </div>
  );
}
