"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Badge, Card, Input, PageHeader, Skeleton } from "@/components/ui";

type U = { id: string; email: string; status: string; createdAt: string; isDemo: boolean; riskScore: number; phoneVerifiedAt: string | null; identityVerifiedAt: string | null; firstName: string; lastName: string; ratingAvg: number; missionsDone: number; role: string | null };

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data } = useSWR<{ users: U[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Utilisateurs" />
      <form onSubmit={(e) => { e.preventDefault(); setQuery(q); }} className="relative mb-4 max-w-lg">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, prénom, e-mail ou identifiant" className="pl-10" />
      </form>
      {!data ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="p-3">Membre</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Vérifications</th>
                <th className="p-3">Missions</th>
                <th className="p-3">Risque</th>
                <th className="p-3">Inscription</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="p-3">
                    <Link href={`/admin/utilisateurs/${u.id}`} className="font-semibold text-primary">
                      {u.firstName} {u.lastName}
                    </Link>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
                      {u.role && <Badge tone="primary">{u.role}</Badge>}
                      {u.isDemo && <Badge>démo</Badge>}
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    {u.phoneVerifiedAt ? "📱 " : ""}
                    {u.identityVerifiedAt ? "🪪" : ""}
                    {!u.phoneVerifiedAt && !u.identityVerifiedAt && "—"}
                  </td>
                  <td className="p-3">{u.missionsDone}</td>
                  <td className="p-3">{u.riskScore > 0 ? <Badge tone={u.riskScore >= 45 ? "danger" : "warning"}>{u.riskScore}</Badge> : "—"}</td>
                  <td className="p-3 text-muted">{new Date(u.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
