import { requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { reportSchema } from "@/lib/validators";
import { createReport } from "@/server/trust";

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseBody(req, reportSchema);
  await createReport(user, input);
  return { ok: true };
});
