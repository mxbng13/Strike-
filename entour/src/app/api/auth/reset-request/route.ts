import { z } from "zod";
import { clientIp } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { requestPasswordReset } from "@/server/users";

export const POST = route(async (req) => {
  const { email } = await parseBody(req, z.object({ email: z.string().trim().toLowerCase().email("Adresse e-mail invalide") }));
  const r = await requestPasswordReset(email, await clientIp());
  return { ok: true, devUrl: process.env.NODE_ENV !== "production" ? r.devUrl : null };
});
