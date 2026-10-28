import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requirePageUser } from "@/lib/page-auth";
import { currentWorkspaceId } from "@/workspaces/service";
import { listProjects } from "@/projects/service";
import { db, schema } from "@/db/client";
import { spendSummary } from "@/finops/guard";
import { Card, StatusBadge, Empty, fmtEur, fmtDate } from "@/components/ui";
import { NewProjectButton } from "@/components/client";
import { PHASES, PHASE_INFO } from "@/projects/lifecycle";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requirePageUser();
  const ws = await currentWorkspaceId(user.id);
  const projects = await listProjects(user.id, ws);
  const ids = projects.map((p) => p.id);
  const d = db();
  const [artifacts, approvals, alerts, nextTasks, spend] = await Promise.all([
    ids.length ? d.select({ id: schema.artifacts.id, projectId: schema.artifacts.projectId, title: schema.artifacts.title, status: schema.artifacts.status, updatedAt: schema.artifacts.updatedAt }).from(schema.artifacts).where(inArray(schema.artifacts.projectId, ids)).orderBy(desc(schema.artifacts.updatedAt)).limit(8) : [],
    d.select().from(schema.approvalRequests).where(and(eq(schema.approvalRequests.workspaceId, ws), eq(schema.approvalRequests.status, "pending"))).orderBy(desc(schema.approvalRequests.createdAt)).limit(6),
    d.select().from(schema.budgetAlerts).where(and(eq(schema.budgetAlerts.workspaceId, ws), isNull(schema.budgetAlerts.acknowledgedAt))).orderBy(desc(schema.budgetAlerts.createdAt)).limit(5),
    ids.length ? d.select({ projectId: schema.agentTasks.projectId, label: schema.agentTasks.label, status: schema.agentTasks.status }).from(schema.agentTasks).where(and(inArray(schema.agentTasks.projectId, ids), inArray(schema.agentTasks.status, ["running", "queued", "ready", "pending"]))).orderBy(schema.agentTasks.createdAt) : [],
    spendSummary({ workspaceId: ws }),
  ]);
  const blocked = projects.filter((p) => p.status === "blocked" || p.status === "paused");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-ink-2">Tes businesses en cours de création, leurs étapes et ce qui attend ton action.</p>
        </div>
        <NewProjectButton />
      </div>

      {(alerts.length > 0 || blocked.length > 0) && (
        <Card title="Alertes">
          <ul className="space-y-1 text-sm">
            {blocked.map((p) => <li key={p.id}>⚠ <Link className="underline" href={`/projects/${p.id}`}>{p.name}</Link> : {p.statusReason ?? p.status}</li>)}
            {alerts.map((a) => <li key={a.id}>€ {a.level === "exceeded" ? "Budget dépassé" : "Budget bientôt atteint"} — {a.message}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Projets">
            {projects.length === 0 ? (
              <Empty>Aucun projet. Crée un business : quelques questions sur ton budget, ton temps et tes contraintes suffisent — pas besoin d'idée.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {projects.map((p) => {
                  const next = nextTasks.filter((t) => t.projectId === p.id).slice(0, 2);
                  return (
                    <li key={p.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/projects/${p.id}`} className="font-semibold hover:text-brand-700">{p.name}</Link>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="mt-1 text-xs text-ink-2">Phase : {PHASE_INFO[p.phase].label} · {p.phasesDone}/{PHASES.length} phases terminées · mis à jour {fmtDate(p.updatedAt)}</p>
                      <div className="mt-2 h-1.5 w-full rounded bg-gray-100" role="progressbar" aria-valuenow={p.phasesDone} aria-valuemin={0} aria-valuemax={PHASES.length} aria-label="Phases terminées">
                        <div className="h-1.5 rounded bg-brand-500" style={{ width: `${(p.phasesDone / PHASES.length) * 100}%` }} />
                      </div>
                      {next.length > 0 && <p className="mt-1 text-xs">Prochaines tâches : {next.map((t) => t.label).join(" · ")}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="Livrables récents">
            {artifacts.length === 0 ? <Empty>Les livrables apparaîtront ici dès que les agents les auront produits.</Empty> : (
              <ul className="space-y-1 text-sm">
                {artifacts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link className="hover:text-brand-700" href={`/projects/${a.projectId}/artifacts/${a.id}`}>{a.title}</Link>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Actions en attente d'approbation" actions={<Link href="/approvals" className="text-sm text-brand-700 underline">Tout voir</Link>}>
            {approvals.length === 0 ? <Empty>Aucune action en attente.</Empty> : (
              <ul className="space-y-2 text-sm">
                {approvals.map((a) => <li key={a.id}>✋ {a.title}{a.estimatedCostEur ? ` — ${fmtEur(a.estimatedCostEur)}` : ""}</li>)}
              </ul>
            )}
          </Card>
          <Card title="Budget d'exploitation IA">
            <p className="text-sm">Ce mois : <strong>{fmtEur(spend.workspaceMonth.spent, 2)}</strong> sur {fmtEur(spend.workspaceMonth.limit)}</p>
            <p className="mt-1 text-xs text-ink-2">Coûts réels des appels IA et recherches payantes. Distinct du budget de ton business.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
