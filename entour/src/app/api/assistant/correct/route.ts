import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { correctText } from "@/lib/assistant-local";
import { parseBody, route } from "@/lib/http";

/** Correction automatique légère (règles locales : abréviations, accents fréquents, ponctuation, majuscules). */
export const POST = route(async (req) => {
  await requireUser();
  const { text } = await parseBody(req, z.object({ text: z.string().max(3000) }));
  return { text: correctText(text) };
});
