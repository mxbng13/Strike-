import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, uploads } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getObject } from "@/lib/storage";

/** Sert un fichier après contrôle d'accès (pièces jointes : membres de la conversation uniquement). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const [u] = await db.select().from(uploads).where(eq(uploads.storageKey, key));
  if (!u) return new NextResponse("Not found", { status: 404 });
  if (u.visibility !== "public") {
    const viewer = await getCurrentUser();
    if (!viewer) return new NextResponse("Unauthorized", { status: 401 });
    const allowed =
      viewer.id === u.ownerId ||
      !!viewer.adminRole ||
      (u.conversationId &&
        (await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, u.conversationId), eq(conversationMembers.userId, viewer.id)))).length > 0);
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  }
  const buf = await getObject(key);
  if (!buf) return new NextResponse("Not found", { status: 404 });
  const inline = /^(image|video|audio)\//.test(u.mimeType) || u.mimeType === "application/pdf";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": u.mimeType,
      "Content-Length": String(buf.length),
      "Cache-Control": u.visibility === "public" ? "public, max-age=31536000, immutable" : "private, max-age=3600",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(u.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
