import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { confirmPhoneCode, startPhoneVerification } from "@/server/users";

export const POST = route(async (req) => {
  const u = await requireUser();
  const { phone } = await parseBody(req, z.object({ phone: z.string().min(8).max(20) }));
  const r = await startPhoneVerification(u.id, phone);
  return { ok: true, phone: r.phone, devCode: process.env.NODE_ENV !== "production" ? r.devCode : null };
});

export const PUT = route(async (req) => {
  const u = await requireUser();
  const { code } = await parseBody(req, z.object({ code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres") }));
  await confirmPhoneCode(u.id, code);
  return { ok: true };
});
