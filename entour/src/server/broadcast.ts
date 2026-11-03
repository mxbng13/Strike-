import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { parisWeekMinute } from "@/lib/dates";
import { formatDistance } from "@/lib/geo";
import { rankCandidates, type MatchCandidate, type MatchService } from "@/lib/matching";
import { formatEUR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { notify } from "./notifications";

type ServiceForBroadcast = {
  id: string;
  requesterId: string;
  title: string;
  categoryId: number;
  categoryGroup: string;
  categoryName: string;
  urgency: "normal" | "high" | "urgent";
  timingType: MatchService["timing"];
  searchRadiusKm: number;
  skillsRequired: string[];
  requiresPhone: boolean;
  requiresIdentity: boolean;
  startsAt: Date | null;
  publicLat: number;
  publicLng: number;
  budgetCents: number | null;
  visibility: "public" | "invite" | "group";
};

/** Charge les membres potentiellement concernés par une demande (requête géographique indexée). */
export async function loadCandidates(s: ServiceForBroadcast): Promise<MatchCandidate[]> {
  const settings = await getSettings();
  const when = s.startsAt ?? new Date();
  const { weekday, minute } = parisWeekMinute(when);
  const rows = await db.execute<Record<string, unknown>>(sql`
    with near as (
      select l.user_id, l.radius_km,
        earth_distance(ll_to_earth(l.lat, l.lng), ll_to_earth(${s.publicLat}, ${s.publicLng})) / 1000.0 as dist
      from user_locations l
      where earth_box(ll_to_earth(${s.publicLat}, ${s.publicLng}), ${s.searchRadiusKm * 1000 + 300}) @> ll_to_earth(l.lat, l.lng)
        and l.user_id <> ${s.requesterId}
    )
    select n.user_id, n.dist, n.radius_km,
      u.phone_verified_at is not null as phone_verified,
      u.identity_verified_at is not null as identity_verified,
      p.rating_avg, p.rating_count, p.missions_done, p.missions_cancelled, p.settings,
      (p.available_until is not null and p.available_until > now()) as available_now,
      sk.user_id is not null as has_skill, coalesce(sk.notify, true) as skill_notify,
      coalesce(sk.years_experience, 0) as skill_years, coalesce(sk.certified, false) as skill_certified,
      coalesce(sk.description, '') as skill_text,
      exists (select 1 from user_skills s2 join categories c2 on c2.id = s2.category_id
              where s2.user_id = n.user_id and c2.group_name = ${s.categoryGroup}) as same_group_skill,
      coalesce(np.muted, false) as category_muted,
      (select count(*) from service_assignments a join services sv on sv.id = a.service_id
        where a.provider_id = n.user_id and a.status = 'completed' and sv.category_id = ${s.categoryId})::int as similar_accepted,
      case when not exists (select 1 from user_availabilities av where av.user_id = n.user_id) then null
           else exists (select 1 from user_availabilities av where av.user_id = n.user_id and av.weekday = ${weekday}
                        and av.start_minute <= ${minute} and av.end_minute > ${minute}) end as availability_match,
      (select count(*) from notifications nt where nt.user_id = n.user_id and nt.created_at > now() - interval '1 hour'
         and nt.type in ('new_mission','urgent_mission'))::int as recent_notifs,
      exists (select 1 from blocks b where (b.blocker_id = n.user_id and b.blocked_id = ${s.requesterId})
                                      or (b.blocker_id = ${s.requesterId} and b.blocked_id = n.user_id)) as blocked
    from near n
    join users u on u.id = n.user_id and u.status = 'active' and u.email_verified_at is not null
    join user_profiles p on p.user_id = n.user_id
    left join user_skills sk on sk.user_id = n.user_id and sk.category_id = ${s.categoryId}
    left join notification_preferences np on np.user_id = n.user_id and np.category_id = ${s.categoryId}
    where n.dist <= ${s.searchRadiusKm} + 0.3
    limit 2000`);

  const now = new Date();
  return rows.map((r) => {
    const st = (r.settings ?? {}) as { dndUntil?: string | null; dndNightly?: boolean; notifyNewMissions?: boolean; notifyUrgent?: boolean; maxNotifPerHour?: number };
    const parisHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(now)) % 24;
    const dnd = (!!st.dndUntil && new Date(st.dndUntil) > now) || (!!st.dndNightly && (parisHour >= 22 || parisHour < 8));
    const done = Number(r.missions_done ?? 0);
    const cancelled = Number(r.missions_cancelled ?? 0);
    return {
      userId: String(r.user_id),
      distanceKm: Number(r.dist),
      preferredRadiusKm: Number(r.radius_km),
      hasSkill: !!r.has_skill,
      skillNotify: !!r.skill_notify,
      skillYears: Number(r.skill_years),
      skillCertified: !!r.skill_certified,
      skillText: String(r.skill_text ?? ""),
      sameGroupSkill: !!r.same_group_skill,
      categoryMuted: !!r.category_muted,
      ratingAvg: Number(r.rating_avg ?? 0),
      ratingCount: Number(r.rating_count ?? 0),
      missionsDone: done,
      similarAccepted: Number(r.similar_accepted ?? 0),
      cancelRate: done + cancelled > 0 ? cancelled / (done + cancelled) : 0,
      availableNow: !!r.available_now,
      availabilityMatch: r.availability_match === null ? null : !!r.availability_match,
      phoneVerified: !!r.phone_verified,
      identityVerified: !!r.identity_verified,
      dnd,
      notifyNewMissions: st.notifyNewMissions !== false,
      notifyUrgent: st.notifyUrgent !== false,
      recentNotifications: Number(r.recent_notifs ?? 0),
      maxNotificationsPerHour: st.maxNotifPerHour ?? settings.limits.maxNotificationsPerHour,
      blocked: !!r.blocked,
    } satisfies MatchCandidate;
  });
}

/** Diffuse une nouvelle demande aux membres les plus pertinents. Retourne le nombre de personnes notifiées. */
export async function broadcastService(s: ServiceForBroadcast): Promise<number> {
  if (s.visibility !== "public") return 0;
  const candidates = await loadCandidates(s);
  const ranked = rankCandidates(
    {
      categoryId: s.categoryId,
      categoryGroup: s.categoryGroup,
      urgency: s.urgency,
      timing: s.timingType,
      searchRadiusKm: s.searchRadiusKm,
      skillsRequired: s.skillsRequired,
      requiresPhone: s.requiresPhone,
      requiresIdentity: s.requiresIdentity,
      startsAt: s.startsAt,
    },
    candidates,
  );
  const byId = new Map(candidates.map((c) => [c.userId, c]));
  for (const r of ranked) {
    const c = byId.get(r.userId)!;
    const urgent = s.urgency === "urgent";
    await notify({
      userId: r.userId,
      type: urgent ? "urgent_mission" : "new_mission",
      title: `${urgent ? "Urgent · " : ""}${s.title}`,
      body: `${s.categoryName} · ${formatEUR(s.budgetCents)} · à ${formatDistance(c.distanceKm)}`,
      link: `/missions/${s.id}`,
      data: { serviceId: s.id, score: r.score, reasons: r.reasons },
      dedupeKey: `service:${s.id}`,
    });
  }
  return ranked.length;
}
