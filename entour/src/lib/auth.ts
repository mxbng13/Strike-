import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { adminRoles, sessions, userProfiles, users } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { AppError, forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "entour_session";
const SESSION_DAYS = 30;

export type AdminRole = "super_admin" | "moderator" | "support";

export type CurrentUser = {
  id: string;
  email: string;
  status: "active" | "suspended" | "banned" | "deleted";
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified: boolean;
  birthDate: string;
  isDemo: boolean;
  adminRole: AdminRole | null;
  suspendedUntil: Date | null;
  settings: Record<string, unknown>;
};

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ userId, tokenHash: sha256(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Utilisateur courant (mis en cache pour la durée d'une requête). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      status: users.status,
      birthDate: users.birthDate,
      emailVerifiedAt: users.emailVerifiedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      identityVerifiedAt: users.identityVerifiedAt,
      isDemo: users.isDemo,
      suspendedUntil: users.suspendedUntil,
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      avatarUrl: userProfiles.avatarUrl,
      settings: userProfiles.settings,
      role: adminRoles.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(adminRoles, eq(adminRoles.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r || r.status === "deleted" || r.status === "banned") return null;
  return {
    id: r.id,
    email: r.email,
    status: r.status,
    firstName: r.firstName,
    lastName: r.lastName,
    avatarUrl: r.avatarUrl,
    emailVerified: !!r.emailVerifiedAt,
    phoneVerified: !!r.phoneVerifiedAt,
    identityVerified: !!r.identityVerifiedAt,
    birthDate: r.birthDate,
    isDemo: r.isDemo,
    adminRole: r.role ?? null,
    suspendedUntil: r.suspendedUntil,
    settings: (r.settings ?? {}) as Record<string, unknown>,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  return u;
}

/** Utilisateur actif (non suspendu) : requis pour toute action qui engage d'autres membres. */
export async function requireActiveUser(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.status === "suspended" && (!u.suspendedUntil || u.suspendedUntil > new Date())) {
    throw new AppError(403, "suspended", "Votre compte est suspendu. Contactez le support pour plus d'informations.");
  }
  return u;
}

/* ───────────── Rôles administrateurs et permissions ───────────── */

export type Permission =
  | "dashboard.view"
  | "users.view"
  | "users.suspend"
  | "users.ban"
  | "users.verify"
  | "services.moderate"
  | "reports.handle"
  | "disputes.handle"
  | "reviews.moderate"
  | "categories.manage"
  | "badges.manage"
  | "settings.manage"
  | "announcements.send"
  | "logs.view"
  | "admins.manage"
  | "finance.view";

const MATRIX: Record<AdminRole, Permission[] | "*"> = {
  super_admin: "*",
  moderator: [
    "dashboard.view",
    "users.view",
    "users.suspend",
    "users.verify",
    "services.moderate",
    "reports.handle",
    "reviews.moderate",
    "disputes.handle",
    "logs.view",
  ],
  support: ["dashboard.view", "users.view", "reports.handle", "disputes.handle"],
};

export function can(role: AdminRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  const p = MATRIX[role];
  return p === "*" || p.includes(perm);
}

export async function requirePermission(perm: Permission): Promise<CurrentUser & { adminRole: AdminRole }> {
  const u = await requireUser();
  if (!can(u.adminRole, perm)) throw forbidden("Droits administrateur insuffisants");
  return u as CurrentUser & { adminRole: AdminRole };
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}
