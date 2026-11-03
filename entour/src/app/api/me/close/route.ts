import { z } from "zod";
import { clientIp, destroySession, requireUser } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import { deleteAccount } from "@/server/users";

export const POST = route(async (req) => {
  const u = await requireUser();
  const { confirm } = await parseBody(req, z.object({ confirm: z.string() }));
  if (confirm !== "SUPPRIMER") throw badRequest("Tapez SUPPRIMER pour confirmer");
  await deleteAccount(u.id, await clientIp());
  await destroySession();
  return { ok: true };
});
