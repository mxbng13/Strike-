import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Flux Server-Sent Events personnel (messages, notifications, frappe, accusés de lecture). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* flux fermé */
        }
      };
      send({ type: "hello" });
      const unsub = await subscribe(user.id, send);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* flux fermé */
        }
      }, 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsub();
      };
      req.signal.addEventListener("abort", () => {
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      });
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
