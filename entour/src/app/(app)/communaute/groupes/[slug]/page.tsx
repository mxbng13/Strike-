"use client";

import { Users } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Feed } from "@/components/feed";
import { Button, ButtonLink, Card, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/client";

type G = { id: string; name: string; description: string; kind: string; areaLabel: string; membersCount: number; isMember: boolean; role: string | null };

export default function GroupPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, error, mutate } = useSWR<{ group: G }>(`/api/community/groups/${slug}/info`);
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-64" />;
  const g = data.group;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader back="/communaute" title={g.name} subtitle={`${g.kind === "neighborhood" ? "Groupe de quartier" : "Groupe thématique"} · ${g.areaLabel}`} />
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Users className="size-6 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{g.membersCount} membre{g.membersCount > 1 ? "s" : ""}</p>
          {g.description && <p className="text-sm text-muted">{g.description}</p>}
        </div>
        {g.isMember && <ButtonLink href="/publier" variant="secondary" size="sm">Demande réservée au groupe</ButtonLink>}
        <Button
          size="sm"
          variant={g.isMember ? "outline" : "primary"}
          onClick={async () => {
            await api(`/api/community/groups/${g.id}/join`, { body: { join: !g.isMember } });
            mutate();
          }}
        >
          {g.isMember ? "Quitter" : "Rejoindre"}
        </Button>
      </Card>
      {g.isMember ? <Feed groupId={g.id} /> : <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-muted">Rejoignez le groupe pour voir et publier dans son fil.</p>}
    </div>
  );
}
