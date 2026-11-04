import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/db/catalog";
import type { FeeSettings } from "./money";

export type Settings = {
  fees: FeeSettings;
  subscriptions: Record<"plus" | "pro", { priceCents: number; label: string; perks: string[]; commissionPct: number }>;
  boost: { priceCents: number; hours: number };
  limits: { maxOpenServicesPerUser: number; maxApplicationsPerDay: number; maxMessagesPerMinute: number; maxNotificationsPerHour: number };
  moderation: { autoHoldRiskScore: number; bannedWords: string[] };
  loyalty: { pointsPerMission: number; pointsPerReview: number; pointsPerReferral: number; levels: number[] };
  referral: { rewardPoints: number; qualifyingMissions: number };
  purchaseClaims: { minSilenceMinutes: number; maxPurchaseCents: number };
  launch: { activeZones: { label: string; lat: number; lng: number; radiusKm: number }[]; waitlistOutsideZones: boolean };
  legal: { termsVersion: string };
};

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  const rows = await db.select().from(platformSettings);
  const value = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) value[r.key] = r.value;
  cache = { at: Date.now(), value: value as Settings };
  return cache.value;
}

export async function setSetting(key: keyof Settings, value: unknown, adminId: string) {
  await db
    .insert(platformSettings)
    .values({ key, value, updatedBy: adminId })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: adminId, updatedAt: new Date() } });
  cache = null;
  return (await db.select().from(platformSettings).where(eq(platformSettings.key, key)))[0];
}

export function invalidateSettings() {
  cache = null;
}
