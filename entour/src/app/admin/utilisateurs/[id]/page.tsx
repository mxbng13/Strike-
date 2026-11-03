"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { useAction, useMe } from "@/components/providers";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Skeleton, Stat } from "@/components/ui";
import { api } from "@/lib/client";

type D = {
  user: { id: string; email: string; status: string; birthDate: string; phone: string | null; emailVerifiedAt: string | null; phoneVerifiedAt: string | null; identityVerifiedAt: string | null; createdAt: string; suspendedUntil: string | null; suspensionReason: string | null; riskScore: number; isDemo: boolean; lastSeenAt: string | null };
  profile: { firstName: string; lastName: string; ratingAvg: number; ratingCount: number; missionsDone: number; missionsCancelled: number; points: number };
  role: string | null;
  verifications: { id: string; type: string; status: string; createdAt: string }[];
  reports: { id: string; reason: string; status: string; createdAt: string; targetType: string }[];
  services: { id: string; title: string; status: string; moderation: string; createdAt: string }[];
  missions: { id: string; status: string; agreedPriceCents: number; serviceId: string }[];
  history: { id: number; action: string; createdAt: string; details: Record<string, unknown> }[];
};

export default function AdminUser() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { run, pending } = useAction();
  const { data, mutate } = useSWR<D>(`/api/admin/users/${id}`);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  const [role, setRole] = useState("");
  if (!data) return <Skeleton className="h-96" />;
  const { user: u, profile: p } = data;
  const act = (action: "suspend" | "ban" | "reactivate") =>
    run(action, async () => {
      await api(`/api/admin/users/${id}/status`, { body: { action, reason: reason || (action === "reactivate" ? "Réactivation" : ""), days: action === "suspend" ? Number(days) : undefined } });
      setReason("");
      await mutate();
    }, { success: "Action enregistrée et journalisée" });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader back="/admin/utilisateurs" title={`${p.firstName} ${p.lastName}`} subtitle={u.email} action={<Link href={`/u/${u.id}`} className="text-sm font-semibold text-primary">Profil public →</Link>} />
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
        {data.role && <Badge tone="primary">{data.role}</Badge>}
        {u.isDemo && <Badge>démo</Badge>}
        {u.emailVerifiedAt && <Badge>e-mail vérifié</Badge>}
        {u.phoneVerifiedAt && <Badge>téléphone vérifié</Badge>}
        {u.identityVerifiedAt && <Badge tone="primary">identité vérifiée</Badge>}
        {u.riskScore > 0 && <Badge tone="danger">risque {u.riskScore}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Note" value={p.ratingCount ? p.ratingAvg.toFixed(2) : "—"} hint={`${p.ratingCount} avis`} />
        <Stat label="Missions" value={p.missionsDone} />
        <Stat label="Annulations" value={p.missionsCancelled} />
        <Stat label="Points" value={p.points} />
        <Stat label="Inscription" value={new Date(u.createdAt).toLocaleDateString("fr-FR")} hint={u.lastSeenAt ? `vu le ${new Date(u.lastSeenAt).toLocaleDateString("fr-FR")}` : undefined} />
      </div>
      {u.suspensionReason && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">Motif de sanction : {u.suspensionReason}{u.suspendedUntil ? ` (jusqu'au ${new Date(u.suspendedUntil).toLocaleDateString("fr-FR")})` : ""}</p>}

      <Card className="space-y-3 p-5">
        <p className="font-bold">Sanctions</p>
        <Field label="Motif (obligatoire, communiqué au membre)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Durée de suspension">
            <Select value={days} onChange={(e) => setDays(e.target.value)} className="w-36">
              {[1, 3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {d} jour{d > 1 ? "s" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="outline" disabled={!reason || u.status !== "active"} loading={pending === "suspend"} onClick={() => act("suspend")}>
            Suspendre
          </Button>
          <Button variant="danger" disabled={!reason || u.status === "banned"} loading={pending === "ban"} onClick={() => act("ban")}>
            Bannir
          </Button>
          <Button variant="success" disabled={u.status === "active"} loading={pending === "reactivate"} onClick={() => act("reactivate")}>
            Réactiver
          </Button>
        </div>
      </Card>

      {me?.adminRole === "super_admin" && (
        <Card className="flex flex-wrap items-end gap-2 p-5">
          <Field label="Rôle d'administration">
            <Select value={role || data.role || ""} onChange={(e) => setRole(e.target.value)} className="w-52">
              <option value="">Aucun</option>
              <option value="support">Support</option>
              <option value="moderator">Modérateur</option>
              <option value="super_admin">Super-administrateur</option>
            </Select>
          </Field>
          <Button variant="secondary" loading={pending === "role"} onClick={() => run("role", async () => { await api(`/api/admin/users/${id}/role`, { body: { role: role || null } }); await mutate(); }, { success: "Rôle mis à jour" })}>
            Appliquer
          </Button>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="mb-2 font-bold">Demandes publiées</p>
          {data.services.length === 0 && <p className="text-sm text-muted">Aucune</p>}
          {data.services.map((s) => (
            <Link key={s.id} href={`/missions/${s.id}`} className="flex justify-between py-1 text-sm">
              <span className="truncate">{s.title}</span>
              <Badge>{s.status}</Badge>
            </Link>
          ))}
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-bold">Signalements le concernant</p>
          {data.reports.length === 0 && <p className="text-sm text-muted">Aucun</p>}
          {data.reports.map((r) => (
            <div key={r.id} className="flex justify-between py-1 text-sm">
              <span>
                {r.reason} ({r.targetType})
              </span>
              <Badge tone={r.status === "open" ? "warning" : "neutral"}>{r.status}</Badge>
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-bold">Vérifications</p>
          {data.verifications.map((v) => (
            <div key={v.id} className="flex justify-between py-1 text-sm">
              <span>{v.type}</span>
              <Badge tone={v.status === "approved" ? "success" : v.status === "rejected" ? "danger" : "warning"}>{v.status}</Badge>
            </div>
          ))}
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-bold">Historique administratif</p>
          {data.history.length === 0 && <p className="text-sm text-muted">Aucune action</p>}
          {data.history.map((h) => (
            <div key={h.id} className="py-1 text-sm">
              <span className="font-mono text-xs">{h.action}</span> <span className="text-muted">· {new Date(h.createdAt).toLocaleString("fr-FR")}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
