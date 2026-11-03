import { requireUser } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { route } from "@/lib/http";
import { sendEmailVerification } from "@/server/users";

export const POST = route(async () => {
  const u = await requireUser();
  if (u.emailVerified) throw badRequest("Adresse déjà confirmée");
  const r = await sendEmailVerification(u.id, u.email, u.firstName);
  // Lien renvoyé uniquement en développement sans fournisseur d'e-mail configuré
  return { ok: true, devUrl: process.env.NODE_ENV !== "production" ? r.devUrl : null };
});
