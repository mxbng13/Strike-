import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { aiConfigured, draftListing } from "@/lib/assistant";
import { parseBody, route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { listCategories } from "@/server/services";

export const POST = route(async (req) => {
  const user = await requireUser();
  await rateLimit(`assistant:${user.id}`, 30, 3600);
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(4, "Décrivez votre besoin en quelques mots").max(600) }));
  const cats = await listCategories();
  const draft = await draftListing(text, cats);
  const category = cats.find((c) => c.slug === draft.categorySlug);
  return { draft: { ...draft, categoryId: category?.id ?? null }, aiConfigured: aiConfigured() };
});
