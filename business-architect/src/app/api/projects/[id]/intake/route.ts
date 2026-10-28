import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { requireProjectAccess } from "@/projects/service";
import { answerIntake, getIntakeState } from "@/intake/engine";
import { rateLimit } from "@/lib/rate-limit";

export const GET = api<{ id: string }>(async (_req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectAccess(user.id, id);
  return json(await getIntakeState(id));
});

export const POST = api<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectAccess(user.id, id, "member");
  await rateLimit(`intake:${user.id}`, 60, 60);
  const { text } = await parseBody(req, z.object({ text: z.string().min(1).max(1000) }));
  return json(await answerIntake(id, user.id, text));
});
