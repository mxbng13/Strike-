/**
 * Diffusion intelligente : décide qui reçoit une nouvelle demande et dans quel ordre.
 * Fonction pure (testée unitairement). Les données sont chargées par server/broadcast.ts.
 */

export type MatchService = {
  categoryId: number;
  categoryGroup: string;
  urgency: "normal" | "high" | "urgent";
  timing: "immediate" | "today" | "tomorrow" | "scheduled" | "recurring";
  searchRadiusKm: number;
  skillsRequired: string[];
  requiresPhone: boolean;
  requiresIdentity: boolean;
  startsAt: Date | null;
};

export type MatchCandidate = {
  userId: string;
  distanceKm: number;
  preferredRadiusKm: number;
  hasSkill: boolean;
  skillNotify: boolean;
  skillYears: number;
  skillCertified: boolean;
  skillText: string;
  sameGroupSkill: boolean;
  categoryMuted: boolean;
  ratingAvg: number;
  ratingCount: number;
  missionsDone: number;
  similarAccepted: number;
  cancelRate: number;
  availableNow: boolean;
  /** true = disponible au créneau, false = indisponible, null = pas de disponibilités renseignées */
  availabilityMatch: boolean | null;
  phoneVerified: boolean;
  identityVerified: boolean;
  dnd: boolean;
  notifyNewMissions: boolean;
  notifyUrgent: boolean;
  recentNotifications: number;
  maxNotificationsPerHour: number;
  blocked: boolean;
};

export type MatchResult = { userId: string; eligible: boolean; score: number; reasons: string[]; exclusion?: string };

export function scoreCandidate(s: MatchService, c: MatchCandidate): MatchResult {
  const base = { userId: c.userId, score: 0, reasons: [] as string[] };
  const exclude = (exclusion: string): MatchResult => ({ ...base, eligible: false, exclusion });

  if (c.blocked) return exclude("blocked");
  if (c.distanceKm > Math.min(s.searchRadiusKm, Math.max(c.preferredRadiusKm, 1)) + 0.25) return exclude("distance");
  if (c.categoryMuted) return exclude("muted");
  if (s.requiresPhone && !c.phoneVerified) return exclude("phone_required");
  if (s.requiresIdentity && !c.identityVerified) return exclude("identity_required");
  if (!c.notifyNewMissions && !(s.urgency === "urgent" && c.notifyUrgent)) return exclude("opted_out");
  if (c.dnd && s.urgency !== "urgent") return exclude("dnd");
  if (c.recentNotifications >= c.maxNotificationsPerHour && s.urgency !== "urgent") return exclude("throttled");
  if (c.availabilityMatch === false && !c.availableNow) return exclude("unavailable");
  // Sans compétence déclarée dans la catégorie, on ne notifie que les personnes « disponibles maintenant »
  // pour une demande immédiate, ou celles ayant une compétence voisine.
  if (!c.hasSkill && !(c.availableNow && (s.timing === "immediate" || s.urgency === "urgent")) && !c.sameGroupSkill) return exclude("no_skill");
  if (c.hasSkill && !c.skillNotify) return exclude("skill_muted");

  let score = 0;
  const reasons: string[] = [];

  // Proximité (0–30) : décroissance douce
  const prox = 30 * Math.exp(-c.distanceKm / Math.max(2, s.searchRadiusKm / 2));
  score += prox;
  if (c.distanceKm < 1) reasons.push("très proche");

  // Compétence (0–25)
  if (c.hasSkill) {
    score += 15 + Math.min(6, c.skillYears) + (c.skillCertified ? 4 : 0);
    reasons.push("compétence déclarée");
  } else if (c.sameGroupSkill) {
    score += 6;
  }
  if (s.skillsRequired.length && c.skillText) {
    const text = c.skillText.toLowerCase();
    const hits = s.skillsRequired.filter((k) => text.includes(k.toLowerCase())).length;
    score += Math.min(6, hits * 3);
  }

  // Réputation (0–20) : moyenne bayésienne pour ne pas défavoriser les nouveaux
  const prior = 4.2;
  const bayes = (c.ratingAvg * c.ratingCount + prior * 3) / (c.ratingCount + 3);
  score += Math.max(0, (bayes - 3) * 10);
  if (c.ratingCount >= 3 && c.ratingAvg >= 4.7) reasons.push("très bien noté");

  // Expérience similaire (0–12)
  score += Math.min(12, c.similarAccepted * 3);
  if (c.similarAccepted > 0) reasons.push("missions similaires réalisées");
  score += Math.min(5, Math.log2(1 + c.missionsDone));

  // Fiabilité (−10–0)
  score -= Math.min(10, c.cancelRate * 40);

  // Disponibilité (0–10)
  if (c.availableNow && (s.timing === "immediate" || s.urgency !== "normal")) {
    score += 10;
    reasons.push("disponible maintenant");
  } else if (c.availabilityMatch) {
    score += 6;
    reasons.push("disponible au créneau");
  }

  // Bonus nouveaux membres : leur laisser une chance d'obtenir une première mission
  if (c.missionsDone === 0) score += 3;

  return { userId: c.userId, eligible: true, score: Math.round(score * 10) / 10, reasons };
}

/** Classe les candidats et retient les N meilleurs (plus large pour les demandes urgentes). */
export function rankCandidates(s: MatchService, candidates: MatchCandidate[], limit?: number): MatchResult[] {
  const max = limit ?? (s.urgency === "urgent" ? 60 : 30);
  return candidates
    .map((c) => scoreCandidate(s, c))
    .filter((r) => r.eligible)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/** Score de compatibilité affiché à un offreur pour une mission (0–100). */
export function compatibilityPercent(r: MatchResult): number {
  return Math.max(5, Math.min(99, Math.round((r.score / 80) * 100)));
}
