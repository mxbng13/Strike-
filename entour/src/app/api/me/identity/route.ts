import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { requestIdentityVerification } from "@/server/users";

export const POST = route(async (req) => {
  const u = await requireUser();
  const { note } = await parseBody(req, z.object({ note: z.string().max(300).default("") }));
  return { verification: await requestIdentityVerification(u.id, note) };
});
