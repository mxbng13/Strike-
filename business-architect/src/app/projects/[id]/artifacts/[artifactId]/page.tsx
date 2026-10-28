import Link from "next/link";
import { notFound as nextNotFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requirePageUser } from "@/lib/page-auth";
import { requireProjectAccess } from "@/projects/service";
import { db, schema } from "@/db/client";
import { isAppError } from "@/lib/errors";
import { Card, StatusBadge, ModeBadge, Badge, fmtDate } from "@/components/ui";
import { renderMarkdown, lineDiff } from "@/components/markdown";

export const dynamic = "force-dynamic";

export default async function ArtifactPage({ params, searchParams }: { params: Promise<{ id: string; artifactId: string }>; searchParams: Promise<{ v?: string; compare?: string; file?: string }> }) {
  const user = await requirePageUser();
  const { id, artifactId } = await params;
  const sp = await searchParams;
  await requireProjectAccess(user.id, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") nextNotFound();
    throw e;
  });
  const d = db();
  const art = await d.query.artifacts.findFirst({ where: and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.projectId, id)) });
  if (!art) nextNotFound();
  const versions = await d.select().from(schema.artifactVersions).where(eq(schema.artifactVersions.artifactId, art.id)).orderBy(desc(schema.artifactVersions.version));
  const ver = versions.find((v) => v.version === Number(sp.v ?? art.currentVersion)) ?? versions[0];
  if (!ver) nextNotFound();
  const reviews = await d.select().from(schema.artifactReviews).where(inArray(schema.artifactReviews.artifactVersionId, versions.map((v) => v.id))).orderBy(desc(schema.artifactReviews.createdAt));
  const task = ver.producedByTaskId ? await d.query.agentTasks.findFirst({ where: eq(schema.agentTasks.id, ver.producedByTaskId) }) : null;
  const sources = ver.sourceIds.length ? await d.select().from(schema.researchSources).where(and(eq(schema.researchSources.projectId, id), inArray(schema.researchSources.id, ver.sourceIds))) : [];
  const compare = sp.compare ? versions.find((v) => v.version === Number(sp.compare)) : null;
  const file = ver.files?.find((f) => f.path === sp.file) ?? ver.files?.find((f) => f.path === "site/index.html") ?? ver.files?.[0];
  const css = ver.files?.find((f) => f.path === "site/styles.css")?.content ?? "";
  const preview = file?.path === "site/index.html" ? file.content.replace('<link rel="stylesheet" href="styles.css">', `<style>${css.replace(/<\/style/gi, "")}</style>`) : null;

  return (
    <div className="space-y-4">
      <Link href={`/projects/${id}?tab=deliverables`} className="text-sm text-brand-700 underline">← Livrables du projet</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{art.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={art.status} />
          <ModeBadge mode={ver.generationMode} />
          <a className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:bg-gray-50" href={`/api/projects/${id}/artifacts/${art.id}/download?version=${ver.version}`}>Télécharger v{ver.version}{ver.format === "files" ? " (.zip)" : ""}</a>
        </div>
      </div>
      {!ver.completeness.complete && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Livrable incomplet : {ver.completeness.missing.join(", ")}. Il n'est pas considéré comme terminé.</p>}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-3">
          {compare ? (
            <Card title={`Comparaison v${compare.version} → v${ver.version}`}>
              <pre className="max-h-[70vh] overflow-auto text-xs">{lineDiff(compare.content, ver.content).map((l, i) => <div key={i} className={l.op === "add" ? "bg-green-50 text-green-900" : l.op === "del" ? "bg-red-50 text-red-900 line-through" : ""}>{l.op === "add" ? "+ " : l.op === "del" ? "- " : "  "}{l.text}</div>)}</pre>
            </Card>
          ) : ver.format === "markdown" ? (
            <Card><div className="prose-ba" dangerouslySetInnerHTML={{ __html: renderMarkdown(ver.content) }} /></Card>
          ) : ver.format === "files" ? (
            <>
              {preview && (
                <Card title="Aperçu du site (isolé : scripts désactivés)">
                  <iframe title="Aperçu du site généré" sandbox="" srcDoc={preview} className="h-[60vh] w-full rounded border border-line bg-white" />
                </Card>
              )}
              <Card title="Fichiers">
                <div className="flex flex-wrap gap-2">{ver.files!.map((f) => <Link key={f.path} href={`?v=${ver.version}&file=${encodeURIComponent(f.path)}`} className={`rounded border px-2 py-1 text-xs ${f.path === file?.path ? "border-brand-500 bg-brand-50" : "border-line"}`}>{f.path}</Link>)}</div>
                {file && <pre className="mt-3 max-h-[60vh] overflow-auto rounded bg-gray-50 p-3 text-xs">{file.content}</pre>}
              </Card>
            </>
          ) : (
            <Card><pre className="max-h-[70vh] overflow-auto text-xs">{ver.content}</pre></Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Versions">
            <ul className="space-y-2 text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-1">
                  <Link href={`?v=${v.version}`} className={v.version === ver.version ? "font-semibold" : "underline"}>v{v.version}</Link>
                  <span className="text-xs text-ink-2">{fmtDate(v.createdAt)}</span>
                  {v.version !== ver.version && <Link href={`?v=${ver.version}&compare=${v.version}`} className="text-xs text-brand-700 underline">comparer</Link>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Traçabilité">
            <p className="text-sm">Produit par : {task ? `${task.label} (tentative ${task.attempts})` : "—"}</p>
            <p className="mt-1 text-sm">Format : {ver.format}</p>
          </Card>
          <Card title="Revue qualité">
            {reviews.length === 0 ? <p className="text-sm text-ink-2">Pas encore revu par l'auditeur.</p> : <ul className="space-y-2 text-sm">{reviews.slice(0, 5).map((r) => <li key={r.id}><Badge tone={r.verdict === "approved" ? "green" : "red"}>{r.verdict}</Badge> {r.findings.join(" ")}</li>)}</ul>}
          </Card>
          {sources.length > 0 && (
            <Card title={`Sources (${sources.length})`}>
              <ul className="space-y-1 text-xs">{sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="underline">{s.title}</a> — {fmtDate(s.retrievedAt)}</li>)}</ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
