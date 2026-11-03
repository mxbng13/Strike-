import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { reviewSchema } from "@/lib/validators";
import { createReview, reviewContext } from "@/server/reviews";

export const GET = route(async (req) => {
  const user = await requireUser();
  const id = z.string().uuid().parse(req.nextUrl.searchParams.get("assignmentId"));
  return { context: await reviewContext(user, id) };
});

export const POST = route(async (req) => {
  const user = await requireActiveUser();
  const input = await parseBody(req, reviewSchema.extend({ assignmentId: z.string().uuid() }));
  return { review: await createReview(user, input.assignmentId, input) };
});
