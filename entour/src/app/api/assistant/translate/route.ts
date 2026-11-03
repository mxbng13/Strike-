import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { translateText } from "@/lib/assistant";
import { AppError } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const POST = route(async (req) => {
  const user = await requireUser();
  await rateLimit(`translate:${user.id}`, 60, 3600);
  const { text, lang } = await parseBody(req, z.object({ text: z.string().min(1).max(2000), lang: z.string().min(2).max(20) }));
  const out = await translateText(text, lang);
  if (!out) throw new AppError(503, "translation_unavailable", "La traduction automatique n'est pas activée sur ce serveur (clé ANTHROPIC_API_KEY manquante).");
  return { text: out };
});
