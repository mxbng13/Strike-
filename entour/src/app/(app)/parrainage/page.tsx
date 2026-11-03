"use client";

import { Copy, Gift, Share2 } from "lucide-react";
import useSWR from "swr";
import { useToast } from "@/components/providers";
import { Badge, Button, Card, PageHeader, Skeleton } from "@/components/ui";

type R = { code: string; rewardPoints: number; referrals: { id: string; status: string; createdAt: string; firstName: string }[] };

export default function ReferralPage() {
  const { data } = useSWR<R>("/api/referrals");
  const { push } = useToast();
  if (!data) return <Skeleton className="h-64" />;
  const link = typeof window !== "undefined" ? `${window.location.origin}/inscription?parrain=${data.code}` : "";
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader back="/profil" title="Parrainage" />
      <Card className="bg-gradient-to-br from-primary to-[#6d5cff] p-6 text-center text-white">
        <Gift className="mx-auto size-10" />
        <p className="mt-3 text-xl font-extrabold">Invitez vos voisins</p>
        <p className="mt-1 text-white/80">
          Vous gagnez <strong>{data.rewardPoints} points</strong> et votre filleul {Math.round(data.rewardPoints / 2)} points dès sa première mission terminée. Plus le quartier est actif, plus vite chacun trouve de l'aide !
        </p>
        <p className="mx-auto mt-5 w-fit rounded-2xl bg-white/15 px-6 py-3 font-mono text-2xl font-bold tracking-[0.3em]">{data.code}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            className="bg-white !text-[#3b2fd9]"
            icon={<Copy className="size-4" />}
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              push({ tone: "success", title: "Lien copié" });
            }}
          >
            Copier le lien
          </Button>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10"
            icon={<Share2 className="size-4" />}
            onClick={() => navigator.share?.({ title: "Rejoins-moi sur ENTOUR", text: "Les services entre voisins, simplement.", url: link }).catch(() => {})}
          >
            Partager
          </Button>
        </div>
      </Card>
      <section>
        <h2 className="mb-2 font-bold">Mes filleuls ({data.referrals.length})</h2>
        {data.referrals.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-4 text-sm text-muted">Aucun filleul pour l'instant.</p>
        ) : (
          <Card className="divide-y divide-border">
            {data.referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-semibold">{r.firstName}</span>
                <Badge tone={r.status === "rewarded" ? "success" : "warning"}>{r.status === "rewarded" ? "Récompensé" : "En attente de 1ʳᵉ mission"}</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
