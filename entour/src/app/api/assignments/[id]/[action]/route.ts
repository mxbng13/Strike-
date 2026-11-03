import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import {
  cancelAssignment,
  confirmCompletion,
  confirmPrice,
  confirmSchedule,
  markDoneByProvider,
  openDispute,
  reportLate,
  startMission,
} from "@/server/assignments";
import { startPayment } from "@/server/payments";

export const POST = route<{ id: string; action: string }>(async (req, { id, action }) => {
  switch (action) {
    case "confirm-price":
      return void (await confirmPrice(await requireActiveUser(), id));
    case "confirm-schedule":
      return void (await confirmSchedule(await requireActiveUser(), id));
    case "late": {
      const { minutes } = await parseBody(req, z.object({ minutes: z.number().int().min(1).max(240) }));
      return void (await reportLate(await requireActiveUser(), id, minutes));
    }
    case "start":
      return void (await startMission(await requireActiveUser(), id));
    case "done":
      return void (await markDoneByProvider(await requireActiveUser(), id));
    case "complete":
      return void (await confirmCompletion(await requireActiveUser(), id));
    case "cancel": {
      const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(3, "Indiquez un motif").max(500) }));
      return void (await cancelAssignment(await requireUser(), id, reason));
    }
    case "dispute": {
      const input = await parseBody(req, z.object({ reason: z.string().trim().min(3).max(120), description: z.string().trim().min(20, "Décrivez la situation (20 caractères minimum)").max(3000) }));
      return { dispute: await openDispute(await requireUser(), id, input) };
    }
    case "pay":
      return startPayment(await requireActiveUser(), id);
    default:
      throw notFound("Action");
  }
});
