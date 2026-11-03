import { requireActiveUser, requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { payoutStatus, setupPayoutAccount } from "@/server/payments";

export const GET = route(async () => {
  const user = await requireUser();
  return payoutStatus(user.id);
});

export const POST = route(async () => {
  const user = await requireActiveUser();
  return setupPayoutAccount(user);
});
