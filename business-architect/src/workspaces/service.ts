import { and, eq } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/db/client";
import { env } from "@/config/env";
import { notFound, AppError } from "@/lib/errors";

export type Role = "owner" | "admin" | "member" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export async function createWorkspaceForUser(tx: DbOrTx, userId: string, name: string) {
  const [ws] = await tx.insert(schema.workspaces).values({ name, ownerId: userId }).returning();
  await tx.insert(schema.workspaceMembers).values({ workspaceId: ws!.id, userId, role: "owner" });
  const e = env();
  await tx.insert(schema.workspaceSettings).values({
    workspaceId: ws!.id,
    monthlyAiBudgetEur: e.DEFAULT_WORKSPACE_MONTHLY_AI_BUDGET_EUR,
    defaultProjectAiBudgetEur: e.DEFAULT_PROJECT_AI_BUDGET_EUR,
  });
  await tx.insert(schema.budgets).values({
    workspaceId: ws!.id,
    kind: "ai_operations",
    period: "monthly",
    limitEur: e.DEFAULT_WORKSPACE_MONTHLY_AI_BUDGET_EUR,
  });
  return ws!;
}

/**
 * Server-side membership check. Returns the caller's role or throws NOT_FOUND
 * (never FORBIDDEN for non-members: existence of other tenants is not leaked).
 */
export async function requireWorkspaceRole(userId: string, workspaceId: string, min: Role = "viewer", tx: DbOrTx = db()): Promise<Role> {
  const m = await tx.query.workspaceMembers.findFirst({
    where: and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)),
  });
  if (!m) throw notFound("Espace de travail");
  if (RANK[m.role] < RANK[min]) throw new AppError("FORBIDDEN", "Droits insuffisants pour cette action.");
  return m.role;
}

export async function listWorkspaces(userId: string) {
  return db()
    .select({ id: schema.workspaces.id, name: schema.workspaces.name, role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, userId));
}

export async function currentWorkspaceId(userId: string): Promise<string> {
  const pref = await db().query.userPreferences.findFirst({ where: eq(schema.userPreferences.userId, userId) });
  if (pref?.currentWorkspaceId) {
    try {
      await requireWorkspaceRole(userId, pref.currentWorkspaceId);
      return pref.currentWorkspaceId;
    } catch {
      /* fall through to first membership */
    }
  }
  const all = await listWorkspaces(userId);
  if (!all[0]) throw notFound("Espace de travail");
  return all[0].id;
}

export async function getWorkspaceSettings(workspaceId: string, tx: DbOrTx = db()) {
  const s = await tx.query.workspaceSettings.findFirst({ where: eq(schema.workspaceSettings.workspaceId, workspaceId) });
  if (!s) throw notFound("Paramètres");
  return s;
}
