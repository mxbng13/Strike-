/**
 * Tâches planifiées (appelées par /api/cron, protégé par CRON_SECRET) :
 * expiration des demandes, rappels avant mission, résumé quotidien, levée des autorisations orphelines.
 */
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { services, subscriptions } from "@/db/schema";
import { formatWhen } from "@/lib/dates";
import { listServices } from "./services";
import { notify } from "./notifications";

export async function expireServices() {
  const rows = await db
    .update(services)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(services.status, "open"), sql`${services.expiresAt} < now()`))
    .returning({ id: services.id, requesterId: services.requesterId, title: services.title });
  for (const s of rows)
    await notify({ userId: s.requesterId, type: "system", title: "Demande expirée", body: `« ${s.title} » n'a pas trouvé preneur. Vous pouvez la renouveler en un clic.`, link: `/missions/${s.id}`, dedupeKey: `expired:${s.id}` });
  return rows.length;
}

export async function missionReminders() {
  const rows = await db.execute<Record<string, unknown>>(sql`
    select a.id, a.provider_id, a.requester_id, a.conversation_id, coalesce(a.starts_at, s.starts_at) as starts_at, s.title
    from service_assignments a join services s on s.id = a.service_id
    where a.status = 'confirmed' and coalesce(a.starts_at, s.starts_at) between now() + interval '50 minutes' and now() + interval '70 minutes'`);
  for (const r of rows) {
    for (const uid of [r.provider_id, r.requester_id] as string[]) {
      await notify({
        userId: uid,
        type: "mission_reminder",
        title: "Rappel : mission dans 1 heure",
        body: `« ${r.title} » · ${formatWhen(r.starts_at as string)}`,
        link: `/messages/${r.conversation_id}`,
        dedupeKey: `reminder:${r.id}`,
      });
    }
  }
  return rows.length;
}

export async function dailyDigest() {
  const users = await db.execute<Record<string, unknown>>(sql`
    select l.user_id, l.lat, l.lng, l.radius_km from user_locations l
    join users u on u.id = l.user_id and u.status = 'active'
    join user_profiles p on p.user_id = l.user_id
    where coalesce((p.settings->>'dailyDigest')::boolean, true) = true`);
  let sent = 0;
  const day = new Date().toISOString().slice(0, 10);
  for (const u of users) {
    const list = await listServices({ lat: Number(u.lat), lng: Number(u.lng), radiusKm: Number(u.radius_km), sort: "recent", limit: 20 }, String(u.user_id));
    const fresh = list.filter((s) => Date.now() - new Date(s.createdAt).getTime() < 86400_000 && s.requester.id !== u.user_id);
    if (!fresh.length) continue;
    await notify({
      userId: String(u.user_id),
      type: "system",
      title: `${fresh.length} nouvelle${fresh.length > 1 ? "s" : ""} demande${fresh.length > 1 ? "s" : ""} près de chez vous`,
      body: fresh.slice(0, 3).map((s) => s.title).join(" · "),
      link: "/accueil",
      dedupeKey: `digest:${day}`,
    });
    sent++;
  }
  return sent;
}

export async function expireSubscriptions() {
  const rows = await db
    .update(subscriptions)
    .set({ status: "cancelled" })
    .where(and(eq(subscriptions.status, "active"), eq(subscriptions.cancelAtPeriodEnd, true), sql`${subscriptions.currentPeriodEnd} < now()`))
    .returning();
  return rows.length;
}
