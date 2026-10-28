import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { requireProjectAccess } from "@/projects/service";
import { startRun, pauseProject, resumeProject, cancelRun, requestNewDirection } from "@/orchestration/orchestrator";
import { rateLimit } from "@/lib/rate-limit";

const Body = z.object({ action: z.enum(["start", "pause", "resume", "cancel", "new_direction"]), reason: z.string().max(2000).optional() });

export const POST = api<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectAccess(user.id, id, "member");
  await rateLimit(`run:${user.id}`, 30, 600);
  const { action, reason } = await parseBody(req, Body);
  switch (action) {
    case "start":
      return json({ runId: await startRun(id, user.id) }, 202);
    case "pause":
      await pauseProject(id, user.id);
      return json({ ok: true });
    case "resume":
      return json({ runId: await resumeProject(id, user.id) }, 202);
    case "cancel":
      await cancelRun(id, user.id);
      return json({ ok: true });
    case "new_direction":
      return json({ runId: await requestNewDirection(id, user.id, reason ?? "") }, 202);
  }
});
