import Link from "next/link";
import { notFound as nextNotFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requirePageUser } from "@/lib/page-auth";
import { requireProjectAccess } from "@/projects/service";
import { getIntakeState } from "@/intake/engine";
import { db, schema } from "@/db/client";
import { isAppError } from "@/lib/errors";
import { Card, StatusBadge, ModeBadge, Empty, Badge, fmtEur, fmtDate } from "@/components/ui";
import { IntakeChat, LiveProgress, RunControls, ApprovalButtons, JsonForm } from "@/components/client";
import { CashChart } from "@/components/cash-chart";
import { renderMarkdown } from "@/components/markdown";
import { PHASES, PHASE_INFO } from "@/projects/lifecycle";
import { AGENTS } from "@/agents/registry";
import { spendSummary, costBreakdown } from "@/finops/guard";
import type { UserProfile } from "@/intake/profile";
import { HORIZON_LABEL, MODE_LABEL } from "@/intake/profile";
import type { ScoreCard } from "@/discovery/types";
import { latestVersion } from "@/artifacts/service";

export const dynamic = "force-dynamic";

const TABS: Array<[string, string]> = [
  ["overview", "Vue d'ensemble"],
  ["opportunities", "Opportunités"],
  ["research", "Recherches & sources"],
  ["strategy", "Stratégie"],
  ["finance", "Finances"],
  ["product", "Produit"],
  ["brand", "Marque"],
  ["marketing", "Marketing & ventes"],
  ["operations", "Opérations & lancement"],
  ["deliverables", "Livrables"],
  ["agents", "Agents"],
  ["history", "Historique"],
  ["tasks", "Tâches"],
  ["settings", "Paramètres"],
];

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const access = await requireProjectAccess(user.id, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") nextNotFound();
    throw e;
  });
  const project = access.project;

  if (project.status === "intake" || (project.status === "ready" && !(await db().query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.projectId, id) })))) {
    const intake = await getIntakeState(id);
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">Nouveau business</h1>
        <p className="text-sm text-ink-2">Quelques questions sur tes contraintes. Tu n'as pas besoin d'avoir d'idée : c'est l'IA qui la trouve.</p>
        <Card><IntakeChat projectId={id} initial={intake} /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-2">Projet</p>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={project.status} />
            <span className="text-ink-2">Phase : {PHASE_INFO[project.phase].label}</span>
          </div>
          {project.statusReason && <p className="mt-1 max-w-3xl text-sm text-ink-2">{project.statusReason}</p>}
        </div>
        <RunControls projectId={id} status={project.status} hasRun />
      </div>
      <nav aria-label="Sections du projet" className="flex gap-1 overflow-x-auto border-b border-line pb-px">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/projects/${id}?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`whitespace-nowrap rounded-t-md px-3 py-2 text-sm ${tab === k ? "border-b-2 border-brand-600 font-semibold text-brand-700" : "text-ink-2 hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <TabContent tab={tab} projectId={id} workspaceId={project.workspaceId} selectedId={project.selectedOpportunityId} />
    </div>
  );
}

async function ArtifactView({ projectId, keys }: { projectId: string; keys: string[] }) {
  const found = (await Promise.all(keys.map((k) => latestVersion(projectId, k)))).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!found.length) return <Empty>Ce livrable n'a pas encore été produit. Il apparaîtra lorsque l'agent responsable aura terminé.</Empty>;
  return (
    <div className="space-y-4">
      {found.map(({ artifact, version }) => (
        <Card key={artifact.id} title={artifact.title} actions={<div className="flex items-center gap-2"><StatusBadge status={artifact.status} /><ModeBadge mode={version.generationMode} /><Link className="text-sm text-brand-700 underline" href={`/projects/${projectId}/artifacts/${artifact.id}`}>Ouvrir · v{version.version}</Link></div>}>
          {version.format === "markdown" ? <div className="prose-ba max-w-none" dangerouslySetInnerHTML={{ __html: renderMarkdown(version.content) }} /> : <p className="text-sm">{version.content}</p>}
        </Card>
      ))}
    </div>
  );
}

async function TabContent({ tab, projectId, workspaceId, selectedId }: { tab: string; projectId: string; workspaceId: string; selectedId: string | null }) {
  const d = db();
  switch (tab) {
    case "overview": {
      const run = await d.query.orchestrationRuns.findFirst({ where: eq(schema.orchestrationRuns.projectId, projectId), orderBy: desc(schema.orchestrationRuns.startedAt) });
      const tasks = run ? await d.select().from(schema.agentTasks).where(eq(schema.agentTasks.orchestrationRunId, run.id)).orderBy(asc(schema.agentTasks.createdAt)) : [];
      const events = await d.select().from(schema.workflowEvents).where(eq(schema.workflowEvents.projectId, projectId)).orderBy(desc(schema.workflowEvents.id)).limit(40);
      const milestones = await d.select().from(schema.projectMilestones).where(eq(schema.projectMilestones.projectId, projectId));
      const selected = selectedId ? await d.query.opportunityCandidates.findFirst({ where: eq(schema.opportunityCandidates.id, selectedId) }) : null;
      const approvals = await d.select().from(schema.approvalRequests).where(and(eq(schema.approvalRequests.projectId, projectId), eq(schema.approvalRequests.status, "pending")));
      const project = (await d.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }))!;
      return (
        <div className="space-y-4">
          <Card title="Progression en temps réel">
            <LiveProgress projectId={projectId} initial={{ project: { status: project.status, statusReason: project.statusReason }, run: run ? { status: run.status, iteration: run.discoveryIteration } : null, tasks: tasks.map((t) => ({ id: t.id, label: t.label, status: t.status, agentId: t.agentId, attempts: t.attempts, lastError: t.lastError, phase: t.phase, input: t.input as { generation?: number } })), events: events.reverse().map((e) => ({ id: e.id, type: e.type, message: e.message, createdAt: e.createdAt.toISOString() })) }} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Cycle de vie">
              <ol className="space-y-1 text-sm">
                {PHASES.map((ph) => {
                  const m = milestones.find((x) => x.phase === ph);
                  return (
                    <li key={ph} className="flex items-center justify-between gap-2">
                      <span>{PHASE_INFO[ph].label} <span className="text-xs text-ink-2">— {PHASE_INFO[ph].deliverable}</span></span>
                      <StatusBadge status={m?.status ?? "pending"} />
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-xs text-ink-2">Lancement et optimisation nécessitent des données réelles (intégrations et approbations) : sans elles, aucune performance n'est affichée.</p>
            </Card>
            <Card title="Concept retenu">
              {selected ? (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">{selected.title}</p>
                  <p>{selected.summary}</p>
                  <p className="text-ink-2">Score de comparaison : {selected.totalScore}/100 · <ModeBadge mode={selected.generationMode} /></p>
                  <Link className="text-brand-700 underline" href={`/projects/${projectId}?tab=opportunities`}>Voir la comparaison et les raisons du choix</Link>
                </div>
              ) : <Empty>L'IA n'a pas encore choisi d'opportunité.</Empty>}
            </Card>
          </div>
          <Card title="Actions qui exigent ton intervention">
            {approvals.length === 0 ? <Empty>Aucune approbation en attente pour l'instant.</Empty> : (
              <ul className="space-y-3">
                {approvals.map((a) => (
                  <li key={a.id} className="rounded-lg border border-line p-3">
                    <p className="font-semibold">{a.title} <Badge tone="violet">L2</Badge></p>
                    <p className="text-sm">Objectif : {a.objective}</p>
                    <p className="text-sm">Coût estimé : {fmtEur(a.estimatedCostEur)} · Conséquences : {a.consequences}</p>
                    <div className="mt-2"><ApprovalButtons approvalId={a.id} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      );
    }
    case "opportunities": {
      const cands = await d.select().from(schema.opportunityCandidates).where(eq(schema.opportunityCandidates.projectId, projectId)).orderBy(desc(schema.opportunityCandidates.iteration), asc(schema.opportunityCandidates.rank));
      const ev = cands.length ? await d.select().from(schema.opportunityEvidence).where(inArray(schema.opportunityEvidence.opportunityId, cands.map((c) => c.id))) : [];
      const assess = cands.length ? await d.select().from(schema.evidenceAssessments).where(inArray(schema.evidenceAssessments.opportunityId, cands.map((c) => c.id))) : [];
      const decisions = await d.select().from(schema.projectDecisions).where(eq(schema.projectDecisions.projectId, projectId)).orderBy(desc(schema.projectDecisions.createdAt));
      if (!cands.length) return <Empty>Les concepts apparaîtront après la phase de découverte.</Empty>;
      return (
        <div className="space-y-4">
          {decisions[0] && (
            <Card title="Dernière décision">
              <p className="text-sm font-semibold">{decisions[0].title}</p>
              <p className="mt-1 text-sm">{decisions[0].rationale}</p>
              {decisions[0].uncertainties.length > 0 && (<><p className="mt-2 text-sm font-semibold">Ce qui pourrait changer la décision</p><ul className="list-disc pl-5 text-sm">{decisions[0].uncertainties.map((u) => <li key={u}>{u}</li>)}</ul></>)}
            </Card>
          )}
          {cands.map((c) => {
            const card = c.scores as ScoreCard | null;
            const a = assess.find((x) => x.opportunityId === c.id);
            const myEv = ev.filter((e) => e.opportunityId === c.id);
            return (
              <Card key={c.id} title={<span>{c.rank ? `#${c.rank} · ` : ""}{c.title}</span>} actions={<div className="flex flex-wrap items-center gap-2"><StatusBadge status={c.status} /><ModeBadge mode={c.generationMode} /><Badge>Itération {c.iteration}</Badge></div>}>
                <p className="text-sm">{c.summary}</p>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div><dt className="text-ink-2">Client</dt><dd>{c.targetCustomer}</dd></div>
                  <div><dt className="text-ink-2">Modèle</dt><dd>{c.businessModel}</dd></div>
                  <div><dt className="text-ink-2">Score</dt><dd>{c.totalScore ?? "—"}/100 · preuves {a?.quality ?? "n/d"}</dd></div>
                </dl>
                {card && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium">Détail des critères, preuves et contraintes</summary>
                    {card.hardConstraintViolations.length > 0 && <p className="mt-2 text-sm text-red-700">Contraintes non respectées : {card.hardConstraintViolations.join(" ; ")}</p>}
                    <div className="prose-ba"><table><thead><tr><th>Critère</th><th>Note /10</th><th>Poids</th><th>Base</th><th>Explication</th></tr></thead><tbody>{card.criteria.map((k) => <tr key={k.key}><td>{k.label}</td><td>{k.score}</td><td>{k.weight}</td><td>{k.basedOn === "observed" ? "observé" : "hypothèse"}</td><td>{k.explanation}</td></tr>)}</tbody></table></div>
                    <p className="mt-2 text-sm font-semibold">Preuves observées</p>
                    <ul className="list-disc pl-5 text-sm">{myEv.filter((e) => e.isObservation).map((e) => <li key={e.id}>{e.statement}</li>)}</ul>
                    <p className="mt-2 text-sm font-semibold">Hypothèses et risques</p>
                    <ul className="list-disc pl-5 text-sm">{myEv.filter((e) => !e.isObservation).map((e) => <li key={e.id}>{e.statement}</li>)}</ul>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      );
    }
    case "research": {
      const jobs = await d.select().from(schema.researchJobs).where(eq(schema.researchJobs.projectId, projectId)).orderBy(desc(schema.researchJobs.createdAt)).limit(200);
      const sources = await d.select().from(schema.researchSources).where(eq(schema.researchSources.projectId, projectId)).orderBy(desc(schema.researchSources.retrievedAt)).limit(300);
      return (
        <div className="space-y-4">
          <Card title={`Recherches exécutées (${jobs.length})`}>
            <div className="prose-ba"><table><thead><tr><th>Date</th><th>Connecteur</th><th>Objet</th><th>Requête</th><th>Statut</th><th>Résultats</th></tr></thead><tbody>
              {jobs.map((j) => <tr key={j.id}><td>{fmtDate(j.createdAt)}</td><td>{j.provider}</td><td>{j.purpose}</td><td>{j.query}</td><td>{j.status}{j.error ? ` — ${j.error}` : ""}</td><td>{j.resultCount}{j.totalAvailable != null ? ` / ${j.totalAvailable}` : ""}</td></tr>)}
            </tbody></table></div>
          </Card>
          <Card title={`Sources consultées (${sources.length})`}>
            <ul className="space-y-2 text-sm">
              {sources.map((s) => (
                <li key={s.id} className="border-b border-line pb-2">
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-brand-700 underline">{s.title}</a> <Badge>{s.sourceType}</Badge> {s.injectionFlag && <Badge tone="red" title="Contenu ressemblant à une instruction, neutralisé">injection neutralisée</Badge>}
                  <p className="text-xs text-ink-2">{s.provider} · consulté le {fmtDate(s.retrievedAt)} · réf. {s.id.slice(0, 8)}</p>
                  {s.snippet && <p className="text-xs">{s.snippet}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      );
    }
    case "strategy": {
      const risks = await d.select().from(schema.projectRisks).where(eq(schema.projectRisks.projectId, projectId)).orderBy(desc(schema.projectRisks.impact));
      const decisions = await d.select().from(schema.projectDecisions).where(eq(schema.projectDecisions.projectId, projectId)).orderBy(desc(schema.projectDecisions.createdAt));
      return (
        <div className="space-y-4">
          <ArtifactView projectId={projectId} keys={["project-charter", "opportunity-dossier", "validation-plan"]} />
          <Card title="Registre des risques">
            {risks.length === 0 ? <Empty>Aucun risque enregistré.</Empty> : <div className="prose-ba"><table><thead><tr><th>Risque</th><th>Catégorie</th><th>P</th><th>I</th><th>Mitigation</th><th>Statut</th></tr></thead><tbody>{risks.map((r) => <tr key={r.id}><td>{r.title}</td><td>{r.category}</td><td>{r.likelihood}</td><td>{r.impact}</td><td>{r.mitigation}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
          </Card>
          <Card title="Journal des décisions">
            <ul className="space-y-2 text-sm">{decisions.map((x) => <li key={x.id}><strong>{x.title}</strong> — {x.decidedBy === "ai" ? "IA" : "utilisateur"}, {fmtDate(x.createdAt)}<br />{x.rationale}</li>)}</ul>
          </Card>
        </div>
      );
    }
    case "finance": {
      const last = await d.query.financialScenarios.findFirst({ where: eq(schema.financialScenarios.projectId, projectId), orderBy: desc(schema.financialScenarios.version) });
      if (!last) return <Empty>Le modèle financier sera calculé après la sélection de l'opportunité.</Empty>;
      const scen = await d.select().from(schema.financialScenarios).where(and(eq(schema.financialScenarios.projectId, projectId), eq(schema.financialScenarios.version, last.version)));
      const rows = await d.select().from(schema.financialProjections).where(inArray(schema.financialProjections.scenarioId, scen.map((s) => s.id))).orderBy(schema.financialProjections.month);
      const assumptions = await d.select().from(schema.financialAssumptions).where(and(eq(schema.financialAssumptions.projectId, projectId), eq(schema.financialAssumptions.version, last.version)));
      const COLORS: Record<string, [string, string]> = { base: ["#2a78d6", "Central"], pessimistic: ["#eb6834", "Pessimiste"], optimistic: ["#1baf7a", "Optimiste"] };
      const order = ["base", "pessimistic", "optimistic"];
      return (
        <div className="space-y-4">
          <Card title={`Scénarios financiers (version ${last.version})`}>
            <CashChart series={order.map((k) => scen.find((s) => s.key === k)).filter((s): s is NonNullable<typeof s> => Boolean(s)).map((s) => ({ key: s.key, label: COLORS[s.key]![1], color: COLORS[s.key]![0], rows: rows.filter((r) => r.scenarioId === s.id) }))} />
            <p className="mt-2 text-xs text-ink-2">Calculés par le moteur financier déterministe à partir d'hypothèses explicites. Ce ne sont pas des garanties de revenus.</p>
          </Card>
          <Card title="Hypothèses (modifiables par un nouveau calcul)">
            <div className="prose-ba"><table><thead><tr><th>Hypothèse</th><th>Valeur</th><th>Unité</th><th>Origine</th><th>Justification</th></tr></thead><tbody>{assumptions.map((a) => <tr key={a.id}><td>{a.label}</td><td>{a.value}</td><td>{a.unit}</td><td>{a.origin === "assumption" ? "hypothèse" : a.origin === "user" ? "utilisateur" : "observée"}</td><td>{a.rationale}</td></tr>)}</tbody></table></div>
          </Card>
          <ArtifactView projectId={projectId} keys={["financial-model"]} />
        </div>
      );
    }
    case "product":
      return <ArtifactView projectId={projectId} keys={["product-spec", "launch-website", "website-test-report"]} />;
    case "brand":
      return <ArtifactView projectId={projectId} keys={["brand-identity"]} />;
    case "marketing":
      return <ArtifactView projectId={projectId} keys={["marketing-plan", "sales-plan"]} />;
    case "operations":
      return <ArtifactView projectId={projectId} keys={["operations-plan", "launch-plan", "qa-report"]} />;
    case "deliverables": {
      const arts = await d.select().from(schema.artifacts).where(eq(schema.artifacts.projectId, projectId)).orderBy(schema.artifacts.category, schema.artifacts.title);
      if (!arts.length) return <Empty>Aucun livrable pour l'instant.</Empty>;
      return (
        <Card title={`Centre de livrables (${arts.length})`}>
          <div className="prose-ba"><table><thead><tr><th>Livrable</th><th>Catégorie</th><th>Type</th><th>Version</th><th>Statut</th><th>Mis à jour</th><th></th></tr></thead><tbody>
            {arts.map((a) => <tr key={a.id}><td><Link href={`/projects/${projectId}/artifacts/${a.id}`}>{a.title}</Link></td><td>{a.category}</td><td>{a.kind}</td><td>v{a.currentVersion}</td><td><StatusBadge status={a.status} /></td><td>{fmtDate(a.updatedAt)}</td><td><a href={`/api/projects/${projectId}/artifacts/${a.id}/download`}>Télécharger</a></td></tr>)}
          </tbody></table></div>
        </Card>
      );
    }
    case "agents": {
      const runs = await d.select().from(schema.agentRuns).where(eq(schema.agentRuns.projectId, projectId)).orderBy(desc(schema.agentRuns.startedAt));
      const evals = await d.select().from(schema.agentEvaluations).innerJoin(schema.agentTasks, eq(schema.agentTasks.id, schema.agentEvaluations.taskId)).where(eq(schema.agentTasks.projectId, projectId));
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.values(AGENTS).map((a) => {
            const mine = runs.filter((r) => r.agentId === a.id);
            const ev = evals.filter((e) => e.agent_tasks.agentId === a.id);
            return (
              <Card key={a.id} title={a.name} actions={<Badge>{mine.length} exécution(s)</Badge>}>
                <p className="text-sm">{a.mission}</p>
                <p className="mt-2 text-xs text-ink-2">Limites : {a.limits.join(" ")}</p>
                {mine[0] && <p className="mt-2 text-xs">Dernière exécution : {fmtDate(mine[0].startedAt)} · {mine[0].status} · <ModeBadge mode={mine[0].mode} /> · coût {fmtEur(mine[0].costEur, 4)}</p>}
                {ev.at(-1) && <ul className="mt-2 list-disc pl-5 text-xs">{(ev.at(-1)!.agent_evaluations.findings as string[]).slice(0, 4).map((f) => <li key={f}>{f}</li>)}</ul>}
              </Card>
            );
          })}
        </div>
      );
    }
    case "history": {
      const events = await d.select().from(schema.workflowEvents).where(eq(schema.workflowEvents.projectId, projectId)).orderBy(desc(schema.workflowEvents.id)).limit(300);
      const auditRows = await d.select().from(schema.auditEvents).where(eq(schema.auditEvents.projectId, projectId)).orderBy(desc(schema.auditEvents.id)).limit(100);
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Événements"><ul className="space-y-1 text-xs">{events.map((e) => <li key={e.id} className="border-b border-line py-1"><span className="text-ink-2">{fmtDate(e.createdAt)}</span> [{e.type}] {e.message}</li>)}</ul></Card>
          <Card title="Journal d'audit"><ul className="space-y-1 text-xs">{auditRows.map((a) => <li key={a.id} className="border-b border-line py-1"><span className="text-ink-2">{fmtDate(a.createdAt)}</span> {a.actorType} · {a.action} · {a.outcome}{a.target ? ` · ${a.target}` : ""}</li>)}</ul></Card>
        </div>
      );
    }
    case "tasks": {
      const tasks = await d.select().from(schema.agentTasks).where(eq(schema.agentTasks.projectId, projectId)).orderBy(desc(schema.agentTasks.createdAt));
      return (
        <Card title={`Tâches (${tasks.length})`}>
          <div className="prose-ba"><table><thead><tr><th>Tâche</th><th>Agent</th><th>Statut</th><th>Tentatives</th><th>Début</th><th>Fin</th><th>Dépend de</th><th>Erreur</th></tr></thead><tbody>
            {tasks.map((t) => <tr key={t.id}><td>{t.label} <span className="text-ink-2">({t.key})</span></td><td>{AGENTS[t.agentId as keyof typeof AGENTS]?.name ?? t.agentId}</td><td><StatusBadge status={t.status} /></td><td>{t.attempts}/{t.maxAttempts}</td><td>{fmtDate(t.startedAt)}</td><td>{fmtDate(t.finishedAt)}</td><td>{t.dependsOn.join(", ") || "—"}</td><td>{t.lastError ?? t.blockedReason ?? ""}</td></tr>)}
          </tbody></table></div>
        </Card>
      );
    }
    case "settings": {
      const c = await d.query.projectConstraints.findFirst({ where: eq(schema.projectConstraints.projectId, projectId) });
      const p = c?.profile as UserProfile | undefined;
      const spend = await spendSummary({ workspaceId, projectId });
      const breakdown = await costBreakdown(workspaceId, projectId);
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Objectifs et contraintes">
            {p ? (
              <>
                <p className="mb-3 text-xs text-ink-2">{MODE_LABEL[p.mode]} · {p.country} · horizon actuel : {HORIZON_LABEL[p.horizon]}. Les changements s'appliquent à la prochaine exécution ou nouvelle piste.</p>
                <JsonForm url={`/api/projects/${projectId}/profile`} submitLabel="Enregistrer les contraintes" fields={[
                  { name: "budgetEur", label: "Budget de départ (€)", type: "number", value: p.budgetEur },
                  { name: "weeklyHours", label: "Heures par semaine", type: "number", value: p.weeklyHours },
                  { name: "horizon", label: "Horizon", type: "select", value: p.horizon, options: [["quick_revenue", "Revenus rapides"], ["durable", "Entreprise durable"], ["high_growth", "Forte croissance"]] },
                  { name: "customerPreference", label: "Clientèle", type: "select", value: p.customerPreference, options: [["any", "Indifférent"], ["b2b", "Entreprises (B2B)"], ["b2c", "Particuliers (B2C)"]] },
                  { name: "skills", label: "Compétences (séparées par des virgules)", type: "text", value: p.skills.join(", ") },
                  { name: "exclusions", label: "À éviter (séparé par des virgules)", type: "text", value: p.exclusions.join(", ") },
                  { name: "allowPhysicalProducts", label: "Produits physiques autorisés", type: "checkbox", value: p.allowPhysicalProducts },
                  { name: "allowDirectCustomerContact", label: "Démarchage direct autorisé", type: "checkbox", value: p.allowDirectCustomerContact },
                ]} />
              </>
            ) : <Empty>Profil non complété.</Empty>}
          </Card>
          <Card title="Budget d'exploitation IA du projet">
            <p className="text-sm">Consommé : <strong>{fmtEur(spend.project.spent, 4)}</strong> sur {fmtEur(spend.project.limit, 2)} (plafond par tâche : {fmtEur(spend.task.limit, 2)}).</p>
            <div className="mt-3"><JsonForm url={`/api/projects/${projectId}/budget`} submitLabel="Mettre à jour le budget IA" fields={[{ name: "limitEur", label: "Budget IA total du projet (€)", type: "number", value: spend.project.limit ?? 0, help: "Quand il est atteint, les tâches concernées sont suspendues et tu choisis comment continuer." }]} /></div>
            <h3 className="mt-4 text-sm font-semibold">Consommation par opération</h3>
            {breakdown.length === 0 ? <Empty>Aucune dépense IA (mode heuristique ou sources gratuites).</Empty> : <div className="prose-ba"><table><thead><tr><th>Fournisseur</th><th>Opération</th><th>Appels</th><th>Tokens (in/out)</th><th>Coût</th></tr></thead><tbody>{breakdown.map((b) => <tr key={b.provider + b.operation}><td>{b.provider}</td><td>{b.operation}</td><td>{b.calls}</td><td>{b.inputTokens}/{b.outputTokens}</td><td>{fmtEur(b.costEur, 4)}</td></tr>)}</tbody></table></div>}
          </Card>
        </div>
      );
    }
    default:
      return <Empty>Section inconnue.</Empty>;
  }
}
