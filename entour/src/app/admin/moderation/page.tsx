"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { useAction } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { api } from "@/lib/client";
import { formatEUR } from "@/lib/money";

type Held = { s: { id: string; title: string; description: string; riskScore: number; moderationReasons: string[]; createdAt: string; budgetCents: number | null }; firstName: string; email: string; category: string };
type Verif = { v: { id: string; type: string; createdAt: string; details: Record<string, unknown>; provider: string }; firstName: string; lastName: string; email: string };
type Svc = { id: string; title: string; status: string; moderation: string; riskScore: number; createdAt: string; isDemo: boolean; firstName: string; category: string; budgetCents: number | null };

export default function ModerationPage() {
  const [tab, setTab] = useState<"annonces" | "verifications" | "toutes">("annonces");
  const { run, pending } = useAction();
  const { data: held, mutate: mHeld } = useSWR<{ queue: Held[] }>(tab === "annonces" ? "/api/admin/moderation" : null);
  const { data: verifs, mutate: mVer } = useSWR<{ verifications: Verif[] }>(tab === "verifications" ? "/api/admin/verifications" : null);
  const [q, setQ] = useState("");
  const { data: all, mutate: mAll } = useSWR<{ services: Svc[] }>(tab === "toutes" ? `/api/admin/services?q=${encodeURIComponent(q)}` : null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const moderate = (id: string, decision: "approve" | "reject" | "remove") =>
    run(`${decision}-${id}`, async () => {
      await api(`/api/admin/services/${id}`, { body: { decision, reason: notes[id] ?? "" } });
      await Promise.all([mHeld(), mAll()]);
    }, { success: decision === "approve" ? "Annonce publiée et diffusée" : "Annonce retirée" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Modération" />
      <Segmented value={tab} onChange={setTab} className="mb-5" options={[{ value: "annonces", label: "Annonces en attente" }, { value: "verifications", label: "Vérifications" }, { value: "toutes", label: "Toutes les annonces" }]} />

      {tab === "annonces" &&
        (!held ? (
          <Skeleton className="h-40" />
        ) : held.queue.length === 0 ? (
          <EmptyState title="Rien à modérer" description="Les annonces dont le score de risque dépasse le seuil apparaissent ici avant publication." />
        ) : (
          <div className="space-y-3">
            {held.queue.map(({ s, firstName, email, category }) => (
              <Card key={s.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/missions/${s.id}`} className="font-bold text-primary">
                      {s.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {category} · {firstName} ({email}) · {formatEUR(s.budgetCents)} · {new Date(s.createdAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <Badge tone="danger">Risque {s.riskScore}</Badge>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm">{s.description}</p>
                {s.moderationReasons.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm text-danger">
                    {s.moderationReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input placeholder="Motif (communiqué à l'auteur en cas de refus)" value={notes[s.id] ?? ""} onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })} className="max-w-md flex-1" />
                  <Button variant="success" loading={pending === `approve-${s.id}`} onClick={() => moderate(s.id, "approve")}>
                    Publier
                  </Button>
                  <Button variant="danger" loading={pending === `reject-${s.id}`} onClick={() => moderate(s.id, "reject")}>
                    Refuser
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ))}

      {tab === "verifications" &&
        (!verifs ? (
          <Skeleton className="h-40" />
        ) : verifs.verifications.length === 0 ? (
          <EmptyState title="Aucune vérification en attente" />
        ) : (
          <div className="space-y-3">
            {verifs.verifications.map(({ v, firstName, lastName, email }) => (
              <Card key={v.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">
                    {v.type === "identity" ? "Identité" : v.type === "reference" ? "Référence" : v.type} — {firstName} {lastName}
                  </p>
                  <span className="text-xs text-muted">
                    {email} · {new Date(v.createdAt).toLocaleString("fr-FR")} · {v.provider}
                  </span>
                </div>
                {Object.keys(v.details).length > 0 && (
                  <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {Object.entries(v.details).map(([k, val]) => (
                      <div key={k}>
                        <dt className="inline text-muted">{k} : </dt>
                        <dd className="inline">{String(val)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {v.type === "identity" && <p className="mt-2 text-xs text-muted">Vérifiez l'identité via le prestataire habilité ou en visioconférence avec présentation d'un justificatif. Ne téléchargez ni ne conservez aucune copie du document.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input placeholder="Note de décision" value={notes[v.id] ?? ""} onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })} className="max-w-md flex-1" />
                  <Button variant="success" loading={pending === `va-${v.id}`} onClick={() => run(`va-${v.id}`, async () => { await api(`/api/admin/verifications/${v.id}`, { body: { approve: true, note: notes[v.id] ?? "" } }); await mVer(); }, { success: "Vérification approuvée" })}>
                    Approuver
                  </Button>
                  <Button variant="danger" loading={pending === `vr-${v.id}`} onClick={() => run(`vr-${v.id}`, async () => { await api(`/api/admin/verifications/${v.id}`, { body: { approve: false, note: notes[v.id] ?? "" } }); await mVer(); }, { success: "Vérification refusée" })}>
                    Refuser
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ))}

      {tab === "toutes" && (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par titre" className="mb-3 max-w-md" />
          {!all ? (
            <Skeleton className="h-40" />
          ) : (
            <Card className="divide-y divide-border">
              {all.services.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/missions/${s.id}`} className="min-w-0 flex-1 truncate font-semibold">
                    {s.title}
                  </Link>
                  <span className="text-muted">
                    {s.category} · {s.firstName}
                  </span>
                  <Badge>{s.status}</Badge>
                  {s.isDemo && <Badge>démo</Badge>}
                  {s.status !== "removed" && (
                    <Button size="sm" variant="ghost" className="text-danger" loading={pending === `remove-${s.id}`} onClick={() => moderate(s.id, "remove")}>
                      Retirer
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
