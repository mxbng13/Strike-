import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import { applySchema } from "@/lib/validators";
import { applyToService, askQuestion, listApplicationsForOwner } from "@/server/applications";
import { boostService, cancelService, renewTemplate } from "@/server/services";

type P = { id: string; action: string };

export const GET = route<P>(async (_req, { id, action }) => {
  const user = await requireUser();
  if (action === "applications") return { applications: await listApplicationsForOwner(user, id) };
  if (action === "renew") return { template: await renewTemplate(user, id) };
  throw notFound("Action");
});

export const POST = route<P>(async (req, { id, action }) => {
  const user = await requireActiveUser();
  switch (action) {
    case "apply":
      return applyToService(user, id, await parseBody(req, applySchema));
    case "question": {
      const { body } = await parseBody(req, z.object({ body: z.string().trim().min(1).max(1000) }));
      return askQuestion(user, id, body);
    }
    case "cancel": {
      const { reason } = await parseBody(req, z.object({ reason: z.string().trim().max(300).default("") }));
      await cancelService(user, id, reason);
      return { ok: true };
    }
    case "boost":
      return boostService(user, id);
    default:
      throw notFound("Action");
  }
});
