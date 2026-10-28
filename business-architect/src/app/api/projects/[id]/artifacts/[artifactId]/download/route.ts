import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { api, requireUser } from "@/lib/http";
import { requireProjectAccess } from "@/projects/service";
import { db, schema } from "@/db/client";
import { notFound } from "@/lib/errors";
import { zip } from "@/artifacts/zip";
import { slugify } from "@/agents/md";

const EXT: Record<string, [string, string]> = {
  markdown: ["md", "text/markdown; charset=utf-8"],
  json: ["json", "application/json"],
  html: ["html", "text/html; charset=utf-8"],
  csv: ["csv", "text/csv; charset=utf-8"],
};

export const GET = api<{ id: string; artifactId: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id, artifactId } = await ctx.params;
  await requireProjectAccess(user.id, id);
  const art = await db().query.artifacts.findFirst({ where: and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.projectId, id)) });
  if (!art) throw notFound("Livrable");
  const v = Number(req.nextUrl.searchParams.get("version") ?? art.currentVersion);
  const ver = await db().query.artifactVersions.findFirst({ where: and(eq(schema.artifactVersions.artifactId, art.id), eq(schema.artifactVersions.version, v)) });
  if (!ver) throw notFound("Version");
  const base = `${slugify(art.title) || "livrable"}-v${ver.version}`;
  if (ver.format === "files") {
    const buf = zip((ver.files ?? []).map((f) => ({ path: f.path, content: f.content })));
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${base}.zip"` } });
  }
  const [ext, type] = EXT[ver.format] ?? ["txt", "text/plain; charset=utf-8"];
  return new NextResponse(ver.content, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${base}.${ext}"` } });
});
