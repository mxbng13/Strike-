/**
 * Parcours complet contre un serveur réel (npm run dev ou npm start) et une vraie base PostgreSQL.
 * Lancer : ENTOUR_URL=http://localhost:3000 npm run test:e2e
 * Pré-requis : serveur démarré avec DISABLE_RATE_LIMIT=1 (hors production) et données de base chargées.
 */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const BASE = process.env.ENTOUR_URL ?? "http://localhost:3000";
const RUN = Date.now().toString(36);
const sql = postgres(process.env.DATABASE_URL ?? "postgres://entour:entour@localhost:5432/entour", { max: 2, onnotice: () => {} });

class Client {
  cookie = "";
  constructor(public name: string) {}
  async call<T = Record<string, unknown>>(path: string, opts: { method?: string; body?: unknown; expect?: number } = {}): Promise<T> {
    const res = await fetch(BASE + path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: this.cookie },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: "manual",
    });
    const set = res.headers.get("set-cookie");
    if (set) {
      const m = set.match(/entour_session=([^;]*)/);
      if (m) this.cookie = m[1] ? `entour_session=${m[1]}` : "";
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (opts.expect !== undefined) expect(res.status, `${this.name} ${path}: ${text}`).toBe(opts.expect);
    else expect(res.ok, `${this.name} ${opts.method ?? "GET"} ${path} → ${res.status} ${text}`).toBe(true);
    return data as T;
  }
  async register(first: string) {
    const email = `${first.toLowerCase()}.${RUN}@test.entour.invalid`;
    await this.call("/api/auth/register", { body: { firstName: first, lastName: "Test", email, password: "motdepasse-123", birthDate: "1994-06-01", acceptTerms: true } });
    const { devUrl } = await this.call<{ devUrl: string }>("/api/auth/resend-verification", { body: {} });
    expect(devUrl, "lien de vérification renvoyé en développement").toBeTruthy();
    await this.call("/api/auth/verify-email", { body: { token: new URL(devUrl).searchParams.get("token") } });
    return email;
  }
}

const requester = new Client("demandeur");
const provider = new Client("intervenant");
const rival = new Client("concurrent");
const admin = new Client("admin");
let babysitId = 0;
let jardinId = 0;
let serviceId = "";
let conversationId = "";
let assignmentId = "";
const LYON = { lat: 45.7597, lng: 4.8516, label: "Lyon 3e (69)", postcode: "69003" };

beforeAll(async () => {
  const cats = await sql<{ id: number; slug: string }[]>`select id, slug from categories`;
  babysitId = cats.find((c) => c.slug === "baby-sitting")!.id;
  jardinId = cats.find((c) => c.slug === "jardinage")!.id;
});

describe("Parcours complet ENTOUR", () => {
  it("1. création de comptes, refus des mineurs, vérification e-mail", async () => {
    await new Client("mineur").call("/api/auth/register", {
      body: { firstName: "Mineur", lastName: "Test", email: `mineur.${RUN}@test.entour.invalid`, password: "motdepasse-123", birthDate: "2012-01-01", acceptTerms: true },
      expect: 403,
    });
    await requester.register("Alice");
    await provider.register("Bruno");
    await rival.register("Chloe");
    const me = await requester.call<{ user: { emailVerified: boolean } }>("/api/me");
    expect(me.user.emailVerified).toBe(true);
  });

  it("2. profil offreur : zone, compétences, téléphone et identité", async () => {
    for (const c of [requester, provider, rival]) {
      await c.call("/api/me/location", { method: "PUT", body: { ...LYON, radiusKm: 10 } });
      // Le mode « ne pas déranger la nuit » est actif par défaut : on le coupe pour un test indépendant de l'heure
      await c.call("/api/me/settings", { method: "PATCH", body: { dndNightly: false } });
    }
    await provider.call("/api/me/skills", { method: "PUT", body: { skills: [{ categoryId: babysitId, description: "BAFA", yearsExperience: 3 }, { categoryId: jardinId, description: "", yearsExperience: 1 }] } });
    await rival.call("/api/me/skills", { method: "PUT", body: { skills: [{ categoryId: jardinId, description: "", yearsExperience: 1 }] } });
    const { devCode } = await provider.call<{ devCode: string }>("/api/me/phone", { body: { phone: `06${String(Date.now()).slice(-8)}` } });
    await provider.call("/api/me/phone", { method: "PUT", body: { code: "000000" }, expect: 400 });
    await provider.call("/api/me/phone", { method: "PUT", body: { code: devCode } });
    const me = await provider.call<{ user: { phoneVerified: boolean } }>("/api/me");
    expect(me.user.phoneVerified).toBe(true);
  });

  it("3. publication d'une demande, floutage de l'adresse et diffusion", async () => {
    const r = await requester.call<{ id: string; held: boolean; notified: number }>("/api/services", {
      body: {
        title: "Tailler la haie du jardin",
        categoryId: jardinId,
        description: "Haie de 12 mètres à tailler, sécateur électrique fourni sur place.",
        location: { lat: 45.76012, lng: 4.85201, label: LYON.label, postcode: LYON.postcode },
        addressPrivate: "12 rue Secrète, 69003 Lyon",
        searchRadiusKm: 5,
        timingType: "tomorrow",
        startsAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
        durationMinutes: 120,
        pricingType: "negotiable",
        budgetCents: 4000,
        peopleNeeded: 1,
      },
    });
    expect(r.held).toBe(false);
    expect(r.notified).toBeGreaterThanOrEqual(2);
    serviceId = r.id;
    const pub = await provider.call<{ service: { exactLocation: unknown; publicLat: number; publicLng: number } }>(`/api/services/${serviceId}`);
    expect(pub.service.exactLocation).toBeNull();
    const d = Math.hypot((pub.service.publicLat - 45.76012) * 111, (pub.service.publicLng - 4.85201) * 78);
    expect(d).toBeGreaterThan(0.05);
    const anon = await new Client("anonyme").call<string>(`/api/services/${serviceId}`);
    expect(JSON.stringify(anon)).not.toContain("Secrète");
  });

  it("4. réception de la notification par les offreurs concernés", async () => {
    const n = await provider.call<{ notifications: { type: string; link: string }[] }>("/api/notifications");
    expect(n.notifications.some((x) => x.link === `/missions/${serviceId}` && x.type === "new_mission")).toBe(true);
  });

  it("5. recherche géographique et carte", async () => {
    const list = await provider.call<{ services: { id: string }[] }>(`/api/services?lat=${LYON.lat}&lng=${LYON.lng}&radius=5&categories=${jardinId}`);
    expect(list.services.some((s) => s.id === serviceId)).toBe(true);
    const bbox = await provider.call<{ services: { id: string }[] }>(`/api/services?bbox=4.80,45.73,4.90,45.79`);
    expect(bbox.services.some((s) => s.id === serviceId)).toBe(true);
    const far = await provider.call<{ services: { id: string }[] }>(`/api/services?lat=48.85&lng=2.35&radius=10`);
    expect(far.services.some((s) => s.id === serviceId)).toBe(false);
  });

  it("6. candidatures (proposition de prix) et contrôle des catégories sensibles", async () => {
    const a = await provider.call<{ conversationId: string }>(`/api/services/${serviceId}/apply`, { body: { message: "Disponible demain matin !", proposedPriceCents: 4500 } });
    conversationId = a.conversationId;
    await rival.call(`/api/services/${serviceId}/apply`, { body: { acceptsBudget: true, message: "Je peux aussi" } });
    await provider.call(`/api/services/${serviceId}/apply`, { body: { acceptsBudget: true }, expect: 409 });
    await requester.call(`/api/services/${serviceId}/apply`, { body: { acceptsBudget: true }, expect: 400 });
    const apps = await requester.call<{ applications: { id: string; applicant: { firstName: string; missionsDone: number } }[] }>(`/api/services/${serviceId}/applications`);
    expect(apps.applications).toHaveLength(2);
    await provider.call(`/api/services/${serviceId}/applications`, { expect: 403 });

    // Baby-sitting : l'identité est exigée pour répondre
    const bs = await requester.call<{ id: string }>("/api/services", {
      body: { title: "Garder ma fille ce soir", categoryId: babysitId, description: "Garde de 19 h à 22 h, enfant de 6 ans.", location: { ...LYON }, searchRadiusKm: 5, timingType: "today", startsAt: new Date(Date.now() + 3 * 3600_000).toISOString(), durationMinutes: 180, pricingType: "fixed", budgetCents: 3600, peopleNeeded: 1 },
    });
    const r = await provider.call<{ error: { code: string } }>(`/api/services/${bs.id}/apply`, { body: { acceptsBudget: true }, expect: 403 });
    expect(r.error.code).toBe("not_eligible");
  });

  it("7. négociation dans la conversation puis acceptation — une seule place, pas de double attribution", async () => {
    const offer = await requester.call<{ offer: { id: string } }>(`/api/conversations/${conversationId}/offers`, { body: { kind: "price", amountCents: 4200, note: "On coupe la poire en deux ?" } });
    await requester.call(`/api/offers/${offer.offer.id}`, { body: { accept: true }, expect: 400 });
    await provider.call(`/api/offers/${offer.offer.id}`, { body: { accept: true } });

    const apps = await requester.call<{ applications: { id: string; applicant: { firstName: string }; proposedPriceCents: number }[] }>(`/api/services/${serviceId}/applications`);
    const bruno = apps.applications.find((a) => a.applicant.firstName === "Bruno")!;
    const chloe = apps.applications.find((a) => a.applicant.firstName === "Chloe")!;
    expect(bruno.proposedPriceCents).toBe(4200);

    // Deux acceptations simultanées sur une mission à une place : une seule doit réussir
    const results = await Promise.all(
      [bruno, chloe].map((a) =>
        fetch(`${BASE}/api/applications/${a.id}/accept`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, Cookie: requester.cookie }, body: "{}" }).then((r) => r.status),
      ),
    );
    expect(results.filter((s) => s === 200)).toHaveLength(1);
    expect(results.filter((s) => s === 409 || s === 400)).toHaveLength(1);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from service_assignments where service_id = ${serviceId} and status <> 'cancelled'`;
    expect(n).toBe(1);

    const winner = results[0] === 200 ? bruno : chloe;
    if (winner !== bruno) {
      // Garantir la suite du scénario avec Bruno : annulation puis nouvelle sélection
      const a = await sql<{ id: string }[]>`select id from service_assignments where service_id = ${serviceId} and status <> 'cancelled'`;
      await rival.call(`/api/assignments/${a[0].id}/cancel`, { body: { reason: "Empêchement de dernière minute" } });
      await requester.call(`/api/applications/${bruno.id}/accept`, { body: {} });
    }
    const [as] = await sql<{ id: string; agreed_price_cents: number }[]>`select id, agreed_price_cents from service_assignments where service_id = ${serviceId} and provider_id = (select id from users where email = ${`bruno.${RUN}@test.entour.invalid`}) and status <> 'cancelled'`;
    assignmentId = as.id;
    expect(as.agreed_price_cents).toBe(4200);
    const d = await provider.call<{ service: { exactLocation: { address: string } } }>(`/api/services/${serviceId}`);
    expect(d.service.exactLocation.address).toContain("Secrète");
  });

  it("8. messagerie : envoi, accusé de lecture, réaction, réponse, avertissement anti-arnaque", async () => {
    const m1 = await provider.call<{ id: string; warning: string | null }>(`/api/conversations/${conversationId}/messages`, { body: { body: "Bonjour, j'arrive demain à 9 h." } });
    const m2 = await requester.call<{ id: string; warning: string | null }>(`/api/conversations/${conversationId}/messages`, { body: { body: "Parfait, merci !", replyToId: m1.id } });
    expect(m2.warning).toBeNull();
    const w = await provider.call<{ warning: string | null }>(`/api/conversations/${conversationId}/messages`, { body: { body: "Sinon on peut faire en espèces" } });
    expect(w.warning).toBeTruthy();
    await requester.call(`/api/messages/${m1.id}`, { body: { emoji: "👍" } });
    await requester.call(`/api/conversations/${conversationId}/read`, { body: {} });
    const conv = await provider.call<{ conversation: { other: { lastReadAt: string } }; messages: { id: string; replyTo: { id: string } | null; reactions: { emoji: string }[] }[] }>(`/api/conversations/${conversationId}`);
    expect(conv.conversation.other.lastReadAt).toBeTruthy();
    expect(conv.messages.find((m) => m.id === m2.id)?.replyTo?.id).toBe(m1.id);
    expect(conv.messages.find((m) => m.id === m1.id)?.reactions[0]?.emoji).toBe("👍");
    // Un tiers ne peut pas lire la conversation
    await rival.call(`/api/conversations/${conversationId}`, { expect: 404 });
    const search = await requester.call<{ conversations: { id: string }[] }>(`/api/conversations?q=demain`);
    expect(search.conversations.some((c) => c.id === conversationId)).toBe(true);
  });

  it("9. paiement en environnement de test (simulation explicite)", async () => {
    const pay = await requester.call<{ paymentId: string; provider: string; fees: { totalChargedCents: number; platformFeeCents: number } }>(`/api/assignments/${assignmentId}/pay`, { body: {} });
    expect(pay.provider).toBe("simulation");
    expect(pay.fees.totalChargedCents).toBe(4200);
    await provider.call(`/api/payments/${pay.paymentId}/simulate`, { body: {}, expect: 404 });
    await requester.call(`/api/payments/${pay.paymentId}/simulate`, { body: {} });
    const [p] = await sql<{ status: string; provider: string }[]>`select status, provider from payments where id = ${pay.paymentId}`;
    expect(p).toEqual({ status: "authorized", provider: "simulation" });
  });

  it("10. déroulement : retard, démarrage, fin déclarée, confirmation et versement", async () => {
    await provider.call(`/api/assignments/${assignmentId}/late`, { body: { minutes: 10 } });
    await provider.call(`/api/assignments/${assignmentId}/start`, { body: {} });
    await provider.call(`/api/assignments/${assignmentId}/complete`, { body: {}, expect: 403 });
    await provider.call(`/api/assignments/${assignmentId}/done`, { body: {} });
    await requester.call(`/api/assignments/${assignmentId}/complete`, { body: {} });
    await requester.call(`/api/assignments/${assignmentId}/complete`, { body: {}, expect: 400 });
    const tx = await provider.call<{ summary: { earnedCents: number }; transactions: { type: string; amountCents: number; provider: string }[] }>("/api/transactions");
    expect(tx.summary.earnedCents).toBe(3780); // 4200 − 10 % de commission
    expect(tx.transactions[0].provider).toBe("simulation");
    const spent = await requester.call<{ summary: { spentCents: number } }>("/api/transactions");
    expect(spent.summary.spentCents).toBe(4200);
  });

  it("11. évaluations mutuelles (participants uniquement) et réputation", async () => {
    await rival.call(`/api/reviews`, { body: { assignmentId, rating: 1, comment: "faux avis" }, expect: 403 });
    await requester.call(`/api/reviews`, { body: { assignmentId, rating: 5, comment: "Travail impeccable", criteria: { punctuality: 4, communication: 5, quality: 5 } } });
    await requester.call(`/api/reviews`, { body: { assignmentId, rating: 5 }, expect: 409 });
    await provider.call(`/api/reviews`, { body: { assignmentId, rating: 5, comment: "Très accueillante" } });
    const providerId = (await provider.call<{ user: { id: string } }>("/api/me")).user.id;
    const prof = await requester.call<{ profile: { ratingAvg: number; ratingCount: number; missionsDone: number; badges: { slug: string }[]; reviews: unknown[] } }>(`/api/users/${providerId}`);
    expect(prof.profile.ratingCount).toBe(1);
    expect(prof.profile.ratingAvg).toBe(5);
    expect(prof.profile.missionsDone).toBe(1);
    expect(prof.profile.badges.map((b) => b.slug)).toContain("premiere-mission");
  });

  it("12. historique, calendrier et notifications", async () => {
    const m = await provider.call<{ assignments: { id: string; status: string; reviewed: boolean }[] }>("/api/missions");
    expect(m.assignments.find((a) => a.id === assignmentId)).toMatchObject({ status: "completed", reviewed: true });
    const n = await requester.call<{ notifications: { type: string }[] }>("/api/notifications");
    expect(n.notifications.map((x) => x.type)).toEqual(expect.arrayContaining(["application_received", "mission_done", "review_received"]));
    const r = await requester.call<{ template: { title: string } }>(`/api/services/${serviceId}/renew`);
    expect(r.template.title).toBe("Tailler la haie du jardin");
  });

  it("13. signalement, blocage et modération administrateur", async () => {
    const rivalId = (await rival.call<{ user: { id: string } }>("/api/me")).user.id;
    await requester.call("/api/reports", { body: { targetType: "user", targetId: rivalId, reason: "spam", details: "test e2e" } });
    await requester.call("/api/reports", { body: { targetType: "user", targetId: rivalId, reason: "spam" }, expect: 409 });
    await requester.call("/api/blocks", { body: { userId: rivalId } });
    const list = await rival.call<{ services: { id: string }[] }>(`/api/services?lat=${LYON.lat}&lng=${LYON.lng}&radius=10`);
    expect(list.services.some((s) => s.id === serviceId)).toBe(false);

    await admin.register("Admin");
    await admin.call("/api/admin/dashboard", { expect: 403 });
    await sql`insert into admin_roles (user_id, role) select id, 'moderator' from users where email = ${`admin.${RUN}@test.entour.invalid`}`;
    const dash = await admin.call<{ stats: { users: number } }>("/api/admin/dashboard");
    expect(dash.stats.users).toBeGreaterThan(0);
    await admin.call("/api/admin/settings", { expect: 403 }); // réservé au super-administrateur
    const reports = await admin.call<{ reports: { r: { id: string; targetId: string } }[] }>("/api/admin/reports");
    const rep = reports.reports.find((x) => x.r.targetId === rivalId)!;
    await admin.call(`/api/admin/reports/${rep.r.id}`, { body: { decision: "dismissed", resolution: "Test" } });
    const logs = await admin.call<{ logs: { l: { action: string } }[] }>("/api/admin/logs");
    expect(logs.logs.some((x) => x.l.action === "report.dismissed")).toBe(true);
    // Journal en ajout seul
    await expect(sql`delete from admin_logs`).rejects.toThrow();
  });

  it("15. le temps nécessaire est obligatoire (estimation ou horaire précis)", async () => {
    const base = { title: "Arroser mes plantes", categoryId: jardinId, description: "Une dizaine de plantes sur le balcon, arrosoir fourni.", location: { ...LYON }, searchRadiusKm: 5, timingType: "tomorrow", startsAt: new Date(Date.now() + 26 * 3600_000).toISOString(), pricingType: "fixed", budgetCents: 1000, peopleNeeded: 1 };
    const r = await requester.call<{ error: { details: { path: string }[] } }>("/api/services", { body: base, expect: 400 });
    expect(r.error.details.some((d) => d.path === "durationMinutes")).toBe(true);
    await requester.call("/api/services", { body: { ...base, timingType: "immediate", durationMinutes: 30, durationExact: true }, expect: 400 });
    const ok = await requester.call<{ id: string }>("/api/services", { body: { ...base, durationMinutes: 90, durationExact: true } });
    const d = await requester.call<{ service: { durationMinutes: number; durationExact: boolean } }>(`/api/services/${ok.id}`);
    expect(d.service).toMatchObject({ durationMinutes: 90, durationExact: true });
  });

  it("14. annonce suspecte mise en attente de modération", async () => {
    const r = await requester.call<{ held: boolean }>("/api/services", {
      body: { title: "Travail très rapide", categoryId: jardinId, description: "Paiement en coupons PCS, envoyez un acompte avant. drogue", location: { ...LYON }, searchRadiusKm: 5, timingType: "today", startsAt: new Date(Date.now() + 3600_000).toISOString(), durationMinutes: 60, pricingType: "fixed", budgetCents: 2000, peopleNeeded: 1 },
    });
    expect(r.held).toBe(true);
  });
});
