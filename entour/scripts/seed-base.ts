/**
 * Données de référence (catégories, badges, paramètres). Idempotent : n'écrase jamais
 * les modifications faites depuis l'administration (insertion uniquement si absent).
 */
import { loadEnv } from "./env";
loadEnv();
const { db, sqlClient } = await import("../src/db");
const { categories, badges, platformSettings } = await import("../src/db/schema");
const { CATEGORY_SEEDS, BADGE_SEEDS, DEFAULT_SETTINGS } = await import("../src/db/catalog");

let i = 0;
for (const c of CATEGORY_SEEDS) {
  i += 10;
  await db
    .insert(categories)
    .values({
      slug: c.slug,
      name: c.name,
      groupName: c.group,
      icon: c.icon,
      color: c.color,
      keywords: c.keywords,
      sensitivity: c.sensitivity ?? "standard",
      requiresPhone: c.requiresPhone ?? false,
      requiresIdentity: c.requiresIdentity ?? false,
      requiresReferences: c.requiresReferences ?? false,
      safetyNotice: c.safetyNotice,
      suggestedMinCents: c.min * 100,
      suggestedMaxCents: c.max * 100,
      suggestedDurationMinutes: c.duration,
      sortOrder: i,
      isCustom: c.slug === "autre",
    })
    .onConflictDoNothing();
}
let j = 0;
for (const b of BADGE_SEEDS) {
  j += 10;
  await db.insert(badges).values({ ...b, kind: b.kind ?? "auto", sortOrder: j }).onConflictDoNothing();
}
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  await db.insert(platformSettings).values({ key, value }).onConflictDoNothing();
}
console.log(`✓ ${CATEGORY_SEEDS.length} catégories, ${BADGE_SEEDS.length} badges, ${Object.keys(DEFAULT_SETTINGS).length} paramètres`);
await sqlClient.end();
