import { NextResponse, type NextRequest } from "next/server";
import { dailyDigest, expireServices, expireSubscriptions, missionReminders } from "@/server/jobs";

/**
 * Point d'entrée des tâches planifiées. À appeler toutes les 5 à 10 minutes (cron système, Vercel Cron…)
 * avec l'en-tête Authorization: Bearer $CRON_SECRET. ?task=digest pour le résumé quotidien (1×/jour).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const task = req.nextUrl.searchParams.get("task");
  if (task === "digest") return NextResponse.json({ digest: await dailyDigest() });
  const [expired, reminders, subs] = await Promise.all([expireServices(), missionReminders(), expireSubscriptions()]);
  return NextResponse.json({ expired, reminders, subscriptionsEnded: subs });
}
