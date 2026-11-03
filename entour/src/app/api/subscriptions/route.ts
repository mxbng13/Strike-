import { z } from "zod";
import { requireActiveUser, requireUser } from "@/lib/auth";
import { parseBody, route } from "@/lib/http";
import { getGateway } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { cancelSubscription, currentSubscription, subscribe } from "@/server/subscriptions";

export const GET = route(async () => {
  const user = await requireUser();
  const settings = await getSettings();
  return { subscription: await currentSubscription(user.id), plans: settings.subscriptions, provider: getGateway().name };
});

export const POST = route(async (req) => {
  const user = await requireActiveUser();
  const { plan } = await parseBody(req, z.object({ plan: z.enum(["plus", "pro"]) }));
  return { subscription: await subscribe(user, plan) };
});

export const DELETE = route(async () => {
  const user = await requireUser();
  await cancelSubscription(user.id);
  return { ok: true };
});
