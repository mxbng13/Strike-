import { requireActiveUser } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { route } from "@/lib/http";
import { acceptApplication, rejectApplication, withdrawApplication } from "@/server/applications";

export const POST = route<{ id: string; action: string }>(async (_req, { id, action }) => {
  const user = await requireActiveUser();
  if (action === "accept") return { assignment: await acceptApplication(user, id) };
  if (action === "reject") return void (await rejectApplication(user, id));
  if (action === "withdraw") return void (await withdrawApplication(user, id));
  throw notFound("Action");
});
