import { requireUser } from "@/lib/auth";
import { route } from "@/lib/http";
import { availableNeighbors } from "@/server/community";
import { listServices, recommendedServices } from "@/server/services";
import { getLocation } from "@/server/users";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Données de la page d'accueil en un seul appel. */
export const GET = route(async () => {
  const user = await requireUser();
  const loc = await getLocation(user.id);
  if (!loc) return { location: null };
  const base = { lat: loc.lat, lng: loc.lng, radiusKm: loc.radiusKm };
  const [urgent, recent, recommended, neighbors, nearby] = await Promise.all([
    listServices({ ...base, urgentOnly: true, sort: "distance", limit: 10 }, user.id),
    listServices({ ...base, sort: "recent", limit: 12 }, user.id),
    recommendedServices(user.id, loc.lat, loc.lng, loc.radiusKm),
    availableNeighbors(user.id, loc.lat, loc.lng, loc.radiusKm, { limit: 12 }),
    listServices({ ...base, sort: "relevance", limit: 60 }, user.id),
  ]);
  const notMine = <T extends { requester: { id: string } }>(l: T[]) => l.filter((s) => s.requester.id !== user.id);
  const popular = notMine(nearby)
    .filter((s) => s.applicationsCount > 0)
    .sort((a, b) => b.applicationsCount - a.applicationsCount)
    .slice(0, 8);
  const [p] = await db.select({ availableUntil: userProfiles.availableUntil }).from(userProfiles).where(eq(userProfiles.userId, user.id));
  return {
    location: loc,
    availableUntil: p?.availableUntil && p.availableUntil > new Date() ? p.availableUntil.toISOString() : null,
    urgent: notMine(urgent),
    recent: notMine(recent),
    recommended,
    popular,
    neighbors,
    openCount: nearby.length,
  };
});
