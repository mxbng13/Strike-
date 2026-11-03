/**
 * Données de DÉMONSTRATION — à n'utiliser qu'en développement ou en préproduction.
 *
 *  - Refuse de s'exécuter si NODE_ENV=production.
 *  - Tous les comptes et demandes sont marqués is_demo = true, avec des e-mails en @demo.entour.invalid
 *    (domaine réservé, aucun e-mail ne peut partir) et le libellé « démonstration » dans l'interface.
 *  - Aucun avis, aucune note, aucune transaction n'est fabriqué : les statistiques restent à zéro
 *    tant que de vraies missions n'ont pas eu lieu.
 *  - Suppression complète : npm run db:purge-demo
 *
 * Mot de passe de tous les comptes de démo : demo-entour-2026
 */
import { loadEnv } from "./env";
loadEnv();
if (process.env.NODE_ENV === "production") {
  console.error("✗ Refus : les données de démonstration ne doivent jamais être chargées en production.");
  process.exit(1);
}
const { db, sqlClient } = await import("../src/db");
const s = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");
const { hashPassword, randomReferralCode, randomToken } = await import("../src/lib/crypto");
const { fuzzLocation } = await import("../src/lib/geo");

const existing = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.isDemo, true));
if (existing.length) {
  console.log(`Des données de démo existent déjà (${existing.length} comptes). Lancez npm run db:purge-demo pour repartir de zéro.`);
  await sqlClient.end();
  process.exit(0);
}

const cats = await db.select().from(s.categories);
const cat = (slug: string) => cats.find((c) => c.slug === slug)!;
const pw = await hashPassword("demo-entour-2026");

// Quartiers de Lyon (zone de lancement par défaut)
const AREAS = [
  { label: "Lyon 1er (69)", lat: 45.7676, lng: 4.8344, postcode: "69001" },
  { label: "Lyon 3e (69)", lat: 45.7597, lng: 4.8516, postcode: "69003" },
  { label: "Lyon 6e (69)", lat: 45.7712, lng: 4.8526, postcode: "69006" },
  { label: "Lyon 7e (69)", lat: 45.7456, lng: 4.8419, postcode: "69007" },
  { label: "Villeurbanne (69)", lat: 45.7719, lng: 4.8902, postcode: "69100" },
  { label: "Lyon 4e (69)", lat: 45.7787, lng: 4.8277, postcode: "69004" },
];

const PEOPLE: { first: string; last: string; area: number; bio: string; skills: [string, number, string][]; phone?: boolean; identity?: boolean; available?: boolean }[] = [
  { first: "Camille", last: "Durand", area: 1, bio: "Étudiante en sciences de l'éducation, j'adore les enfants et les animaux.", skills: [["baby-sitting", 3, "BAFA, garde régulière de 2 enfants"], ["aide-devoirs", 2, "Primaire et collège"], ["garde-animaux", 2, ""]], phone: true, identity: true },
  { first: "Yanis", last: "Benali", area: 4, bio: "Bricoleur du dimanche… et de la semaine. Outillage complet.", skills: [["montage-meubles", 6, "Plus de 100 meubles montés"], ["aide-bricolage", 6, "Perçage, fixations, petites réparations"], ["aide-demenagement", 3, "Utilitaire disponible le week-end"]], phone: true, available: true },
  { first: "Léa", last: "Moreau", area: 2, bio: "Passionnée de jardin, je m'occupe de vos plantes comme des miennes.", skills: [["jardinage", 5, ""], ["tonte-pelouse", 4, "Tondeuse thermique"], ["arrosage-plantes", 5, ""]], phone: true },
  { first: "Hugo", last: "Lefebvre", area: 0, bio: "Développeur, patient avec ceux qui débutent en informatique.", skills: [["aide-informatique", 8, "PC, Mac, box internet"], ["installation-imprimante", 8, ""], ["assistance-telephonique", 5, "iPhone et Android"]], phone: true, identity: true },
  { first: "Inès", last: "Garcia", area: 3, bio: "Toujours en vélo dans Lyon : livraisons et courses express.", skills: [["livraison-repas", 2, "À vélo"], ["courses-derniere-minute", 2, ""], ["recuperation-colis", 2, ""]], available: true },
  { first: "Thomas", last: "Petit", area: 5, bio: "Ancien déménageur, costaud et soigneux.", skills: [["aide-demenagement", 10, ""], ["transport-objets", 4, "Camionnette 12 m³"], ["debarras", 4, ""]], phone: true },
  { first: "Sarah", last: "Roux", area: 2, bio: "Infirmière à la retraite, j'aime rendre visite aux personnes âgées.", skills: [["aide-personnes-agees", 15, "Compagnie, promenades, courses"], ["accompagnement-courses", 10, ""]], phone: true, identity: true },
  { first: "Malik", last: "Diallo", area: 4, bio: "Photographe amateur et monteur vidéo.", skills: [["photographie", 5, ""], ["montage-video", 4, "Premiere Pro"], ["creation-graphique", 3, ""]] },
];

const REQUESTERS = [
  { first: "Julie", last: "Bernard", area: 2 },
  { first: "Marc", last: "Lambert", area: 0 },
  { first: "Nadia", last: "Haddad", area: 3 },
  { first: "Paul", last: "Fontaine", area: 1 },
];

async function createUser(first: string, last: string, areaIdx: number, opts: { phone?: boolean; identity?: boolean; bio?: string; available?: boolean } = {}) {
  const area = AREAS[areaIdx];
  const email = `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@demo.entour.invalid";
  const [u] = await db
    .insert(s.users)
    .values({
      email,
      passwordHash: pw,
      birthDate: "1992-03-14",
      referralCode: randomReferralCode(),
      acceptedTermsAt: new Date(),
      termsVersion: "2026-11",
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: opts.phone ? new Date() : null,
      identityVerifiedAt: opts.identity ? new Date() : null,
      isDemo: true,
    })
    .returning();
  await db.insert(s.userProfiles).values({
    userId: u.id,
    firstName: first,
    lastName: last,
    bio: opts.bio ?? "",
    areaLabel: area.label,
    availableUntil: opts.available ? new Date(Date.now() + 6 * 3600_000) : null,
    settings: { theme: "system", notifyNewMissions: true, notifyUrgent: true, dailyDigest: false },
  });
  const pos = fuzzLocation(area.lat, area.lng, u.id, 50, 700);
  await db.insert(s.userLocations).values({ userId: u.id, lat: pos.lat, lng: pos.lng, label: area.label, postcode: area.postcode, radiusKm: 10 });
  const nm = await db.select().from(s.badges).where(eq(s.badges.slug, "nouveau-membre"));
  if (nm[0]) await db.insert(s.userBadges).values({ userId: u.id, badgeId: nm[0].id });
  return u;
}

for (const p of PEOPLE) {
  const u = await createUser(p.first, p.last, p.area, p);
  for (const [slug, years, desc] of p.skills) await db.insert(s.userSkills).values({ userId: u.id, categoryId: cat(slug).id, yearsExperience: years, description: desc });
  await db.insert(s.userAvailabilities).values([
    { userId: u.id, weekday: 2, startMinute: 17 * 60, endMinute: 22 * 60 },
    { userId: u.id, weekday: 5, startMinute: 9 * 60, endMinute: 19 * 60 },
    { userId: u.id, weekday: 6, startMinute: 10 * 60, endMinute: 18 * 60 },
  ]);
}
const req = [];
for (const r of REQUESTERS) req.push(await createUser(r.first, r.last, r.area));

const inHours = (h: number) => new Date(Date.now() + h * 3600_000);
const SERVICES: { by: number; slug: string; title: string; desc: string; budget: number | null; pricing: "fixed" | "negotiable" | "offer"; timing: "immediate" | "today" | "tomorrow" | "scheduled" | "recurring"; startsIn: number | null; duration: number; urgency?: "normal" | "high" | "urgent"; people?: number; area: number; recurrence?: { freq: "weekly" | "daily"; interval: number } }[] = [
  { by: 0, slug: "baby-sitting", title: "Garder Léo (5 ans) ce soir", desc: "Bonjour ! Nous sortons au restaurant et cherchons quelqu'un pour garder notre fils de 5 ans de 19 h à 22 h. Il aura déjà dîné, il faudra lui lire une histoire et le coucher vers 20 h 30.", budget: 3600, pricing: "fixed", timing: "today", startsIn: 4, duration: 180, urgency: "high", area: 2 },
  { by: 1, slug: "livraison-repas", title: "Ramener un menu McDonald's", desc: "Je suis cloué au lit, quelqu'un pourrait-il passer au McDonald's de Bellecour et me ramener un menu ? Je rembourse la commande en plus de la rémunération.", budget: 600, pricing: "fixed", timing: "immediate", startsIn: null, duration: 30, urgency: "urgent", area: 0 },
  { by: 2, slug: "aide-demenagement", title: "Déplacer un canapé au 3ᵉ étage sans ascenseur", desc: "Canapé trois places à monter du rez-de-chaussée au 3ᵉ étage (escalier assez large). Il faut deux personnes costaudes, environ 30 minutes.", budget: 4000, pricing: "negotiable", timing: "scheduled", startsIn: 48, duration: 45, people: 2, area: 3 },
  { by: 3, slug: "promenade-chiens", title: "Promener Pixel, mon labrador, le midi", desc: "Je travaille toute la journée : je cherche quelqu'un pour promener mon labrador (très gentil) 30 minutes chaque midi en semaine au parc de la Tête d'Or.", budget: 800, pricing: "fixed", timing: "recurring", startsIn: 20, duration: 30, area: 1, recurrence: { freq: "daily", interval: 1 } },
  { by: 0, slug: "tonte-pelouse", title: "Tondre une pelouse de 200 m²", desc: "Petit jardin à tondre, tondeuse électrique sur place. Évacuation de l'herbe dans le composteur.", budget: null, pricing: "offer", timing: "scheduled", startsIn: 72, duration: 90, area: 2 },
  { by: 1, slug: "montage-meubles", title: "Monter une armoire IKEA PAX", desc: "Armoire PAX 2 portes coulissantes, notice et visserie fournies. Une perceuse serait un plus pour la fixation murale.", budget: 5000, pricing: "negotiable", timing: "tomorrow", startsIn: 26, duration: 150, area: 0 },
  { by: 2, slug: "aide-informatique", title: "Installer ma nouvelle box et le Wi-Fi", desc: "Nouvelle box internet reçue : besoin d'aide pour l'installer et connecter l'imprimante et la télé.", budget: 2500, pricing: "fixed", timing: "tomorrow", startsIn: 22, duration: 60, area: 3 },
  { by: 3, slug: "courses-alimentaires", title: "Faire mes courses de la semaine", desc: "Liste d'une vingtaine d'articles au Carrefour City de la rue, à déposer chez moi. Paiement des courses remboursé sur ticket.", budget: 1200, pricing: "fixed", timing: "scheduled", startsIn: 30, duration: 60, area: 1 },
  { by: 0, slug: "aide-personnes-agees", title: "Tenir compagnie à ma grand-mère le jeudi", desc: "Ma grand-mère de 88 ans apprécierait de la compagnie le jeudi après-midi : discussion, jeux de cartes, petite promenade.", budget: 3000, pricing: "fixed", timing: "recurring", startsIn: 50, duration: 120, area: 2, recurrence: { freq: "weekly", interval: 1 } },
  { by: 1, slug: "recuperation-colis", title: "Récupérer un colis au point relais", desc: "Colis de taille moyenne à récupérer au relais de la place des Terreaux (procuration fournie) et à déposer chez moi.", budget: 500, pricing: "fixed", timing: "today", startsIn: 3, duration: 30, area: 0 },
  { by: 2, slug: "nettoyage-apres-fete", title: "Aide au rangement après un anniversaire", desc: "Anniversaire samedi soir pour 20 personnes : besoin d'aide dimanche matin pour ranger, faire la vaisselle et sortir les poubelles.", budget: 4500, pricing: "negotiable", timing: "scheduled", startsIn: 96, duration: 180, area: 3 },
  { by: 3, slug: "photographie", title: "Photos pour mon profil professionnel", desc: "Je cherche un photographe pour quelques portraits en extérieur (pour LinkedIn), retouches simples.", budget: null, pricing: "offer", timing: "scheduled", startsIn: 120, duration: 60, area: 1 },
  { by: 0, slug: "deneigement", title: "Déneiger l'allée de la maison", desc: "Allée d'une quinzaine de mètres à déneiger dès qu'il neige, pelle fournie.", budget: 2000, pricing: "fixed", timing: "scheduled", startsIn: 60, duration: 60, area: 5 },
  { by: 1, slug: "autre", title: "Aide pour accrocher des guirlandes sur le balcon", desc: "Balcon au 2ᵉ étage, j'ai besoin de quelqu'un sans vertige pour accrocher des guirlandes lumineuses (escabeau fourni).", budget: 1500, pricing: "fixed", timing: "tomorrow", startsIn: 25, duration: 45, area: 4 },
];

for (const [i, sv] of SERVICES.entries()) {
  const area = AREAS[sv.area];
  const exact = fuzzLocation(area.lat, area.lng, `exact-${i}`, 100, 900);
  const pub = fuzzLocation(exact.lat, exact.lng, randomToken(6));
  const c = cat(sv.slug);
  const startsAt = sv.startsIn != null ? inHours(sv.startsIn) : new Date();
  await db.insert(s.services).values({
    requesterId: req[sv.by].id,
    categoryId: c.id,
    title: sv.title,
    description: sv.desc,
    pricingType: sv.pricing,
    budgetCents: sv.budget,
    timingType: sv.timing,
    startsAt,
    durationMinutes: sv.duration,
    recurrence: sv.recurrence ?? null,
    urgency: sv.urgency ?? (sv.timing === "immediate" ? "urgent" : "normal"),
    peopleNeeded: sv.people ?? 1,
    searchRadiusKm: 10,
    lat: exact.lat,
    lng: exact.lng,
    publicLat: pub.lat,
    publicLng: pub.lng,
    areaLabel: area.label,
    postcode: area.postcode,
    addressPrivate: "Adresse de démonstration",
    isDemo: true,
    expiresAt: sv.timing === "immediate" ? inHours(6) : new Date(startsAt.getTime() + 2 * 3600_000),
  });
}

const demoUsers = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.isDemo, true));
console.log(`✓ ${demoUsers.length} comptes de démonstration et ${SERVICES.length} demandes créés autour de Lyon.`);
console.log("  Connexion : camille.durand@demo.entour.invalid / demo-entour-2026 (intervenante vérifiée)");
console.log("              julie.bernard@demo.entour.invalid / demo-entour-2026 (demandeuse)");
await sqlClient.end();
