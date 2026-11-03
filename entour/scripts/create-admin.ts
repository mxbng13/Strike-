/**
 * Attribue un rôle d'administration à un compte existant.
 * Usage : npm run admin:grant -- <email> [super_admin|moderator|support]
 */
import { loadEnv } from "./env";
loadEnv();
const { db, sqlClient } = await import("../src/db");
const { adminRoles, adminLogs, users } = await import("../src/db/schema");
const { eq } = await import("drizzle-orm");

const [email, role = "super_admin"] = process.argv.slice(2);
if (!email || !["super_admin", "moderator", "support"].includes(role)) {
  console.error("Usage : npm run admin:grant -- <email> [super_admin|moderator|support]");
  process.exit(1);
}
const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
if (!u) {
  console.error(`Aucun compte pour ${email}. Créez d'abord le compte depuis /inscription.`);
  process.exit(1);
}
await db
  .insert(adminRoles)
  .values({ userId: u.id, role: role as "super_admin" })
  .onConflictDoUpdate({ target: adminRoles.userId, set: { role: role as "super_admin" } });
await db.insert(adminLogs).values({ adminId: null, action: "admin.role.cli", targetType: "user", targetId: u.id, details: { role, via: "scripts/create-admin.ts" } });
console.log(`✓ ${email} est maintenant ${role}`);
await sqlClient.end();
