import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db/client";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "./password";
import { createWorkspaceForUser } from "@/workspaces/service";
import { audit } from "@/audit/service";

export const SESSION_COOKIE = "ba_session";
export const SESSION_TTL_DAYS = 14;

export const SignupInput = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
  password: z.string().min(10, "Mot de passe : 10 caractères minimum.").max(200),
  displayName: z.string().trim().min(1, "Nom requis.").max(80),
});
export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export type SessionUser = { id: string; email: string; displayName: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function signup(input: z.infer<typeof SignupInput>): Promise<{ user: SessionUser; workspaceId: string }> {
  const d = db();
  const existing = await d.query.users.findFirst({ where: eq(schema.users.email, input.email) });
  if (existing) throw new AppError("CONFLICT", "Un compte existe déjà pour cette adresse.");
  const passwordHash = await hashPassword(input.password);
  return d.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({ email: input.email, passwordHash, displayName: input.displayName })
      .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
    const ws = await createWorkspaceForUser(tx, user!.id, `Espace de ${input.displayName}`);
    await tx.insert(schema.userPreferences).values({ userId: user!.id, currentWorkspaceId: ws.id });
    await audit({ workspaceId: ws.id, actorType: "user", actorId: user!.id, action: "auth.signup" }, tx);
    return { user: user!, workspaceId: ws.id };
  });
}

export async function login(input: z.infer<typeof LoginInput>): Promise<SessionUser> {
  const user = await db().query.users.findFirst({ where: eq(schema.users.email, input.email) });
  // Always run a hash comparison to keep timing similar for unknown emails.
  const ok = user
    ? await verifyPassword(input.password, user.passwordHash)
    : (await verifyPassword(input.password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"), false);
  if (!user || !ok) {
    await audit({ actorType: "user", action: "auth.login", outcome: "denied", data: { email: input.email } });
    throw new AppError("UNAUTHENTICATED", "Identifiants incorrects.");
  }
  await audit({ actorType: "user", actorId: user.id, action: "auth.login" });
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function createSession(userId: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await db().insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) });
  return { token, expiresAt };
}

export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const rows = await db()
    .select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (token) await db().delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
}
