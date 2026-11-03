import { db } from "@/db";
import { adminLogs, securityEvents } from "@/db/schema";

/** Journalise une action administrative (table en ajout seul, protégée par trigger). */
export async function logAdmin(
  adminId: string,
  action: string,
  target: { type?: string; id?: string } = {},
  details: Record<string, unknown> = {},
  ip?: string | null,
) {
  await db.insert(adminLogs).values({ adminId, action, targetType: target.type, targetId: target.id, details, ip: ip ?? null });
}

/** Journalise un événement de sécurité utilisateur (connexion, changement de mot de passe…). */
export async function logSecurity(userId: string | null, event: string, details: Record<string, unknown> = {}, ip?: string | null) {
  await db.insert(securityEvents).values({ userId, event, details, ip: ip ?? null });
}
