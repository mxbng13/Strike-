import { describe, expect, it } from "vitest";
import { categorize, correctText, draftFromSentence } from "@/lib/assistant-local";
import { ageFromBirthDate } from "@/lib/dates";
import { formatDistance, fuzzLocation, haversineKm } from "@/lib/geo";
import { rankCandidates, scoreCandidate, type MatchCandidate, type MatchService } from "@/lib/matching";
import { analyzeListing, analyzeMessage } from "@/lib/moderation";
import { computeFees } from "@/lib/money";
import { suggestPrice, travelFeeCents } from "@/lib/pricing";
import { sniffMime } from "@/lib/storage";
import { CATEGORY_SEEDS } from "@/db/catalog";

const cats = CATEGORY_SEEDS.map((c, i) => ({ id: i + 1, slug: c.slug, name: c.name, groupName: c.group, keywords: c.keywords, suggestedDurationMinutes: c.duration }));

describe("géolocalisation", () => {
  it("calcule une distance haversine réaliste (Lyon → Paris ≈ 392 km)", () => {
    expect(haversineKm({ lat: 45.764, lng: 4.8357 }, { lat: 48.8566, lng: 2.3522 })).toBeCloseTo(392, -1);
  });
  it("floute une position entre ~100 m et ~450 m, de façon déterministe", () => {
    for (let i = 0; i < 50; i++) {
      const f = fuzzLocation(45.76, 4.83, `seed-${i}`);
      const d = haversineKm({ lat: 45.76, lng: 4.83 }, f) * 1000;
      expect(d).toBeGreaterThan(80);
      expect(d).toBeLessThan(480);
      expect(fuzzLocation(45.76, 4.83, `seed-${i}`)).toEqual(f);
    }
  });
  it("n'affiche jamais une distance précise", () => {
    expect(formatDistance(0.12)).toBe("< 500 m");
    expect(formatDistance(2.26)).toBe("2,5 km");
  });
});

describe("âge", () => {
  it("refuse les mineurs à un jour près", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    expect(ageFromBirthDate("2008-11-03", now)).toBe(18);
    expect(ageFromBirthDate("2008-11-04", now)).toBe(17);
  });
});

describe("frais : 5 % sur la rémunération uniquement", () => {
  const fees = { providerCommissionPct: 5, payerServiceFeePct: 0, payerServiceFeeFixedCents: 0, minFeeCents: 0 };
  it("McDo à 30 € + 5 € de service : 35 € bloqués, 0,25 € de commission, 34,75 € versés", () => {
    expect(computeFees(500, fees, undefined, 3000)).toMatchObject({ totalChargedCents: 3500, platformFeeCents: 25, providerServiceNetCents: 475, providerNetCents: 3475, purchaseCents: 3000 });
  });
  it("ne prend jamais de commission sur les achats", () => {
    expect(computeFees(500, fees, undefined, 3000).platformFeeCents).toBe(computeFees(500, fees).platformFeeCents);
    expect(computeFees(0, fees, undefined, 3000)).toMatchObject({ platformFeeCents: 0, providerNetCents: 3000 });
  });
  it("applique la réduction d'abonnement", () => {
    expect(computeFees(3000, fees, 2).platformFeeCents).toBe(60);
  });
  it("conserve l'égalité payé = versé + commission", () => {
    for (const a of [0, 1, 99, 500, 1234, 99999]) {
      const r = computeFees(a, { ...fees, payerServiceFeePct: 3, payerServiceFeeFixedCents: 25 }, undefined, 777);
      expect(r.providerNetCents + r.platformFeeCents).toBe(r.totalChargedCents);
    }
  });
});

describe("preuve d'achat", () => {
  it("tolère 1 € ou 5 % d'écart entre le ticket et le montant réclamé", async () => {
    const { isConsistent } = await import("@/lib/receipt");
    expect(isConsistent(3020, 3000)).toBe(true);
    expect(isConsistent(3300, 3000)).toBe(false);
    expect(isConsistent(null, 3000)).toBeNull();
  });
});

describe("assistant local", () => {
  it("rédige une annonce de baby-sitting à partir d'une phrase", () => {
    const d = draftFromSentence("je cherche qq1 pour garder mon fils de 5 ans ce soir de 19h à 22h, 30€", cats);
    expect(d.categorySlug).toBe("baby-sitting");
    expect(d.timingType).toBe("today");
    expect(d.startTime).toBe("19:00");
    expect(d.durationMinutes).toBe(180);
    expect(d.budgetEuros).toBe(30);
    expect(d.description).toMatch(/quelqu'un/);
  });
  it("comprend une livraison McDo immédiate", () => {
    const d = draftFromSentence("qqn peut me ramener un mcdo maintenant ? 5 euros", cats);
    expect(d.categorySlug).toBe("livraison-repas");
    expect(d.timingType).toBe("immediate");
    expect(d.urgency).toBe("urgent");
    expect(d.budgetEuros).toBe(5);
  });
  it("détecte une récurrence et le nombre de personnes", () => {
    const d = draftFromSentence("promener mon chien tous les jours 30 minutes", cats);
    expect(d.categorySlug).toBe("promenade-chiens");
    expect(d.recurrence?.freq).toBe("daily");
    expect(d.durationMinutes).toBe(30);
    expect(draftFromSentence("déménager un canapé, besoin de deux bras", cats).peopleNeeded).toBe(2);
  });
  it("propose « autre » quand rien ne correspond", () => {
    expect(categorize("xyzzy plugh", cats).slug).toBe("autre");
  });
  it("corrige les abréviations courantes", () => {
    expect(correctText("jai besoin dun coup de main svp")).toBe("J'ai besoin dun coup de main s'il vous plaît.");
  });
});

describe("modération", () => {
  const category = { slug: "jardinage", suggestedMinCents: 1500, suggestedMaxCents: 2500, suggestedDurationMinutes: 120, sensitivity: "standard" };
  const base = { pricingType: "fixed" as const, durationMinutes: 120, category, bannedWords: ["drogue"], accountAgeHours: 100, recentListingsCount: 0 };
  it("laisse passer une annonce normale", () => {
    const r = analyzeListing({ ...base, title: "Tailler une haie", description: "Haie de 10 mètres à tailler, sécateur fourni.", budgetCents: 4000 });
    expect(r.riskScore).toBeLessThan(20);
  });
  it("met en attente les arnaques et termes interdits", () => {
    const r = analyzeListing({ ...base, title: "Travail facile", description: "Paiement en coupons PCS, envoyez d'abord un acompte. Contact 06 12 34 56 78. drogue", budgetCents: 4000 });
    expect(r.riskScore).toBeGreaterThanOrEqual(60);
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["banned_word", "scam_pattern", "off_platform"]));
  });
  it("signale un budget très éloigné des repères", () => {
    const low = analyzeListing({ ...base, title: "Jardin", description: "Grand jardin à entretenir toute la journée", budgetCents: 500, durationMinutes: 480 });
    expect(low.findings.some((f) => f.code === "budget_low")).toBe(true);
  });
  it("avertit en cas de tentative de paiement hors plateforme dans un message", () => {
    expect(analyzeMessage("On peut faire ça en espèces ?").warning).toBeTruthy();
    expect(analyzeMessage("Envoie-moi le code reçu par SMS stp, donne le moi").scam).toBe(true);
    expect(analyzeMessage("Je serai là à 19h").warning).toBeNull();
  });
});

describe("prix", () => {
  const c = { slug: "baby-sitting", suggestedMinCents: 1000, suggestedMaxCents: 1500, suggestedDurationMinutes: 180 };
  it("utilise les repères (taux horaire) sans historique", () => {
    const s = suggestPrice(c, 180, []);
    expect(s.basis).toBe("reference");
    expect(s.lowCents).toBe(3000);
    expect(s.highCents).toBe(4500);
  });
  it("utilise l'historique réel quand il existe", () => {
    const h = [3000, 3300, 3600, 3600, 3900, 4200].map((p) => ({ priceCents: p, durationMinutes: 180 }));
    const s = suggestPrice(c, 180, h);
    expect(s.basis).toBe("history");
    expect(s.recommendedCents).toBe(3600);
  });
  it("calcule des frais de déplacement plafonnés", () => {
    expect(travelFeeCents(2)).toBe(0);
    expect(travelFeeCents(100)).toBe(1500);
  });
});

describe("diffusion intelligente", () => {
  const svc: MatchService = { categoryId: 1, categoryGroup: "Famille & proches", urgency: "normal", timing: "today", searchRadiusKm: 5, skillsRequired: ["BAFA"], requiresPhone: true, requiresIdentity: true, startsAt: null };
  const cand = (o: Partial<MatchCandidate>): MatchCandidate => ({
    userId: "u",
    distanceKm: 1,
    preferredRadiusKm: 5,
    hasSkill: true,
    skillNotify: true,
    skillYears: 2,
    skillCertified: false,
    skillText: "",
    sameGroupSkill: false,
    categoryMuted: false,
    ratingAvg: 4.5,
    ratingCount: 4,
    missionsDone: 3,
    similarAccepted: 1,
    cancelRate: 0,
    availableNow: false,
    availabilityMatch: null,
    phoneVerified: true,
    identityVerified: true,
    dnd: false,
    notifyNewMissions: true,
    notifyUrgent: true,
    recentNotifications: 0,
    maxNotificationsPerHour: 6,
    blocked: false,
    ...o,
  });
  it("exclut selon les règles de sécurité et les préférences", () => {
    expect(scoreCandidate(svc, cand({ identityVerified: false })).exclusion).toBe("identity_required");
    expect(scoreCandidate(svc, cand({ distanceKm: 8 })).exclusion).toBe("distance");
    expect(scoreCandidate(svc, cand({ categoryMuted: true })).exclusion).toBe("muted");
    expect(scoreCandidate(svc, cand({ dnd: true })).exclusion).toBe("dnd");
    expect(scoreCandidate(svc, cand({ availabilityMatch: false })).exclusion).toBe("unavailable");
    expect(scoreCandidate(svc, cand({ blocked: true })).exclusion).toBe("blocked");
    expect(scoreCandidate(svc, cand({ recentNotifications: 6 })).exclusion).toBe("throttled");
  });
  it("les demandes urgentes passent outre le mode ne pas déranger", () => {
    expect(scoreCandidate({ ...svc, urgency: "urgent" }, cand({ dnd: true })).eligible).toBe(true);
  });
  it("classe d'abord les profils proches, expérimentés et bien notés", () => {
    const ranked = rankCandidates(svc, [
      cand({ userId: "loin", distanceKm: 4.5, ratingAvg: 3.5, ratingCount: 10, similarAccepted: 0 }),
      cand({ userId: "top", distanceKm: 0.4, ratingAvg: 4.9, ratingCount: 20, similarAccepted: 5, skillText: "BAFA", skillCertified: true }),
      cand({ userId: "moyen" }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(["top", "moyen", "loin"]);
  });
  it("donne sa chance à un nouveau membre face à un membre mal noté", () => {
    const [a, b] = [scoreCandidate(svc, cand({ userId: "new", ratingCount: 0, ratingAvg: 0, missionsDone: 0, similarAccepted: 0 })), scoreCandidate(svc, cand({ userId: "bad", ratingAvg: 2.1, ratingCount: 12, similarAccepted: 0, cancelRate: 0.3 }))];
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe("contrôle des fichiers", () => {
  it("reconnaît les vraies signatures et rejette les fichiers déguisés", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(sniffMime(png, "image/png")).toBe(true);
    expect(sniffMime(jpg, "image/jpeg")).toBe(true);
    expect(sniffMime(Buffer.from("<script>alert(1)</script>"), "image/png")).toBe(false);
    expect(sniffMime(Buffer.from("%PDF-1.7"), "application/pdf")).toBe(true);
  });
});

describe("assistant local — dates", () => {
  const now = new Date("2026-11-03T10:00:00"); // mardi
  it("comprend « ce week-end » et les jours de la semaine", () => {
    const d = draftFromSentence("garder mon chat ce week-end", cats, now);
    expect(d.timingType).toBe("scheduled");
    expect(d.startDate).toBe("2026-11-07");
    expect(d.startTime).toBe("10:00");
    expect(draftFromSentence("tondre la pelouse jeudi matin", cats, now)).toMatchObject({ startDate: "2026-11-05", startTime: "09:00" });
  });
  it("ne force pas d'horaire quand la phrase n'en contient pas", () => {
    expect(draftFromSentence("monter une armoire ikea", cats, now).timingDetected).toBe(false);
  });
  it("développe « qqn » et nettoie le titre", () => {
    const d = draftFromSentence("je cherche qqn pour garder mon chat", cats, now);
    expect(d.title.startsWith("Qqn")).toBe(false);
    expect(d.description).toContain("quelqu'un");
  });
});

describe("assistant local — titre", () => {
  it("retire le montant du titre", () => {
    const d = draftFromSentence("je cherche qqn pour garder mon chat ce week-end, 25€", cats);
    expect(d.title).not.toMatch(/€/);
    expect(d.budgetEuros).toBe(25);
  });
});

describe("temps nécessaire", () => {
  it("l'assistant repère un horaire précis et n'invente jamais de durée", () => {
    const d = draftFromSentence("garder mon fils ce soir de 19h à 22h", cats);
    expect(d).toMatchObject({ durationMinutes: 180, durationExact: true, startTime: "19:00" });
    expect(draftFromSentence("monter une armoire ikea", cats).durationMinutes).toBeNull();
    expect(draftFromSentence("promener mon chien 45 minutes", cats)).toMatchObject({ durationMinutes: 45, durationExact: false });
  });
});
