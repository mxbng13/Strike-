import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { getSettings } from "@/lib/settings";
import { referralInfo } from "@/server/community";

export const GET = route(async () => {
  const user = await requireUser();
  const settings = await getSettings();
  return { ...(await referralInfo(user.id)), rewardPoints: settings.referral.rewardPoints };
});
