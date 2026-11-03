"use client";

import { BadgeCheck, Crown, Medal, Plus, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { Feed } from "@/components/feed";
import { CategoryBubble } from "@/components/icons";
import { useToast } from "@/components/providers";
import { Avatar, Badge, Button, Card, Chip, EmptyState, Field, Input, PageHeader, Segmented, Select, Sheet, Skeleton, Stars, Textarea } from "@/components/ui";
import { api } from "@/lib/client";

type Group = { id: string; slug: string; name: string; description: string; kind: string; areaLabel: string; membersCount: number; distanceKm: number; isMember: boolean };
type Neighbor = { id: string; firstName: string; avatarUrl: string | null; ratingAvg: number; ratingCount: number; missionsDone: number; availableNow: boolean; verified: boolean; distanceKm: number; skills: { name: string; icon: string; color: string }[] };
type Board = { mostActive: { id: string; firstName: string; avatarUrl: string | null; ratingAvg: number; ratingCount: number; score: number }[]; byCategory: { group: string; id: string; firstName: string; avatarUrl: string | null; ratingAvg: number; score: number; rank: number }[] };

function Groups() {
  const { push } = useToast();
  const { data, error, mutate } = useSWR<{ groups: Group[] }>("/api/community/groups");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", kind: "neighborhood" as "neighborhood" | "topic", categoryGroup: "" });
  if (error) return <p className="text-sm text-danger">{(error as Error).message}</p>;
  if (!data) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-3">
      <Button icon={<Plus className="size-4" />} variant="secondary" onClick={() => setOpen(true)}>
        Créer un groupe
      </Button>
      {data.groups.length === 0 && <EmptyState icon={<Users className="size-7" />} title="Aucun groupe près de chez vous" description="Créez le groupe de votre rue, de votre immeuble ou d'une passion commune (jardinage, animaux…)." />}
      <div className="grid gap-2 sm:grid-cols-2">
        {data.groups.map((g) => (
          <Card key={g.id} className="flex flex-col p-4">
            <Link href={`/communaute/groupes/${g.slug}`} className="flex-1">
              <p className="font-bold">{g.name}</p>
              <p className="text-xs text-muted">
                {g.kind === "neighborhood" ? "Quartier" : "Thématique"} · {g.areaLabel} · {g.membersCount} membre{g.membersCount > 1 ? "s" : ""}
              </p>
              {g.description && <p className="mt-2 line-clamp-2 text-sm">{g.description}</p>}
            </Link>
            <Button
              size="sm"
              className="mt-3 self-start"
              variant={g.isMember ? "outline" : "primary"}
              onClick={async () => {
                await api(`/api/community/groups/${g.id}/join`, { body: { join: !g.isMember } });
                mutate();
              }}
            >
              {g.isMember ? "Quitter" : "Rejoindre"}
            </Button>
          </Card>
        ))}
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau groupe"
        footer={
          <Button
            full
            disabled={form.name.trim().length < 3}
            onClick={async () => {
              try {
                await api("/api/community/groups", { body: { ...form, categoryGroup: form.categoryGroup || null } });
                setOpen(false);
                setForm({ name: "", description: "", kind: "neighborhood", categoryGroup: "" });
                mutate();
              } catch (e) {
                push({ tone: "error", title: (e as Error).message });
              }
            }}
          >
            Créer
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nom">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex : Voisins de la rue des Lilas" maxLength={80} />
          </Field>
          <Field label="Type">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "neighborhood" | "topic" })}>
              <option value="neighborhood">Groupe de quartier</option>
              <option value="topic">Groupe thématique</option>
            </Select>
          </Field>
          {form.kind === "topic" && (
            <Field label="Thème">
              <Select value={form.categoryGroup} onChange={(e) => setForm({ ...form, categoryGroup: e.target.value })}>
                <option value="">Choisir…</option>
                {["Jardin & extérieur", "Animaux", "Bricolage & travaux", "Famille & proches", "Numérique & créatif", "Événements"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Description">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}

function Neighbors() {
  const [now, setNow] = useState(false);
  const { data } = useSWR<{ neighbors: Neighbor[] }>(`/api/neighbors${now ? "?now=1" : ""}`);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Chip active={!now} onClick={() => setNow(false)}>
          Tous
        </Chip>
        <Chip active={now} onClick={() => setNow(true)} icon={<Zap className="size-3.5" />}>
          Disponibles maintenant
        </Chip>
      </div>
      {!data ? (
        <Skeleton className="h-40" />
      ) : data.neighbors.length === 0 ? (
        <EmptyState icon={<Users className="size-7" />} title="Personne pour l'instant" description={now ? "Aucun voisin ne s'est déclaré disponible maintenant." : "Aucun voisin proposant ses services dans votre rayon."} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.neighbors.map((n) => (
            <Link key={n.id} href={`/u/${n.id}`} className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5">
              <Avatar src={n.avatarUrl} name={n.firstName} size={48} online={n.availableNow} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">
                  {n.firstName} {n.verified && <BadgeCheck className="size-4 text-primary" />}
                </p>
                <Stars value={n.ratingAvg} count={n.ratingCount} size={12} />
                <div className="mt-1 flex gap-1">
                  {n.skills.map((s) => (
                    <CategoryBubble key={s.name} icon={s.icon} color={s.color} size={22} />
                  ))}
                </div>
              </div>
              <div className="text-right text-xs text-muted">
                ~{n.distanceKm.toLocaleString("fr-FR")} km
                {n.availableNow && <p className="font-semibold text-success">Dispo</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Leaderboards() {
  const { data, error } = useSWR<Board>("/api/community/leaderboard");
  if (error) return <p className="text-sm text-danger">{(error as Error).message}</p>;
  if (!data) return <Skeleton className="h-40" />;
  const groups = [...new Set(data.byCategory.map((b) => b.group))];
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 flex items-center gap-2 font-bold">
          <Crown className="size-5 text-[#F5B014]" /> Membres les plus actifs (30 jours, 20 km)
        </h2>
        {data.mostActive.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-4 text-sm text-muted">Le classement se remplira avec les premières missions terminées dans votre secteur.</p>
        ) : (
          <Card className="divide-y divide-border">
            {data.mostActive.map((m, i) => (
              <Link key={m.id} href={`/u/${m.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 text-center font-extrabold text-muted">{i + 1}</span>
                <Avatar src={m.avatarUrl} name={m.firstName} size={36} />
                <span className="flex-1 font-semibold">{m.firstName}</span>
                <Stars value={m.ratingAvg} count={m.ratingCount} size={12} />
                <Badge tone="primary">{m.score} mission{m.score > 1 ? "s" : ""}</Badge>
              </Link>
            ))}
          </Card>
        )}
      </section>
      {groups.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-bold">
            <Medal className="size-5 text-primary" /> Meilleurs intervenants par catégorie
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <Card key={g} className="p-4">
                <p className="mb-2 text-sm font-bold">{g}</p>
                {data.byCategory
                  .filter((b) => b.group === g)
                  .map((b) => (
                    <Link key={b.id} href={`/u/${b.id}`} className="flex items-center gap-2 py-1 text-sm">
                      <span className="w-4 font-bold text-muted">{b.rank}</span>
                      <Avatar src={b.avatarUrl} name={b.firstName} size={24} />
                      <span className="flex-1">{b.firstName}</span>
                      <span className="text-muted">{b.score}</span>
                    </Link>
                  ))}
              </Card>
            ))}
          </div>
        </section>
      )}
      <p className="text-xs text-muted">Classements calculés uniquement à partir de missions réellement terminées et confirmées.</p>
    </div>
  );
}

function Community() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"fil" | "groupes" | "voisins" | "classements">((sp.get("onglet") as "voisins") ?? "fil");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Communauté" subtitle="Le quartier, ses groupes et ses voisins serviables." />
      <div className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-none">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "fil", label: "Fil local" },
            { value: "groupes", label: "Groupes" },
            { value: "voisins", label: "Voisins" },
            { value: "classements", label: "Classements" },
          ]}
        />
      </div>
      {tab === "fil" && <Feed />}
      {tab === "groupes" && <Groups />}
      {tab === "voisins" && <Neighbors />}
      {tab === "classements" && <Leaderboards />}
    </div>
  );
}

export default function CommunityPage() {
  return (
    <Suspense>
      <Community />
    </Suspense>
  );
}
