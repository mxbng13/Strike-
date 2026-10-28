import Link from "next/link";
import { requirePageUser } from "@/lib/page-auth";
import { currentWorkspaceId } from "@/workspaces/service";
import { listApprovals } from "@/governance/approvals";
import { Card, StatusBadge, Empty, Badge, fmtEur, fmtDate } from "@/components/ui";
import { ApprovalButtons } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function Approvals() {
  const user = await requirePageUser();
  const ws = await currentWorkspaceId(user.id);
  const all = await listApprovals(user.id, ws);
  const pending = all.filter((a) => a.status === "pending");
  const done = all.filter((a) => a.status !== "pending");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Approbations</h1>
      <p className="max-w-3xl text-sm text-ink-2">Actions de niveau L2 : elles engagent ton argent, ton identité ou ont des effets externes. L'IA les a préparées mais ne les exécute jamais sans ton accord. Sans connecteur configuré, une action approuvée reste à réaliser manuellement — le système ne prétend jamais l'avoir faite.</p>
      <Card title={`En attente (${pending.length})`}>
        {pending.length === 0 ? <Empty>Rien à approuver.</Empty> : (
          <ul className="space-y-3">
            {pending.map((a) => (
              <li key={a.id} className="rounded-lg border border-line p-3">
                <p className="font-semibold">{a.title} <Badge tone="violet">L2 · {a.actionType}</Badge></p>
                <p className="text-sm">Objectif : {a.objective}</p>
                <p className="text-sm">Coût estimé : {fmtEur(a.estimatedCostEur)}</p>
                <p className="text-sm">Conséquences : {a.consequences}</p>
                <p className="text-xs text-ink-2">Demandé le {fmtDate(a.createdAt)} · <Link className="underline" href={`/projects/${a.projectId}`}>voir le projet</Link></p>
                <div className="mt-2"><ApprovalButtons approvalId={a.id} /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Historique">
        {done.length === 0 ? <Empty>Aucune décision pour l'instant.</Empty> : (
          <ul className="space-y-2 text-sm">{done.map((a) => <li key={a.id}><StatusBadge status={a.status} /> {a.title} — décidé le {fmtDate(a.decidedAt)}{a.executionNote ? <span className="block text-xs text-ink-2">{a.executionNote}</span> : null}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
