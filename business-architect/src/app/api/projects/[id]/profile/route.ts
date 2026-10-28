import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { requireProjectAccess } from "@/projects/service";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { saveProfile } from "@/intake/engine";
import { UserProfileSchema, type UserProfile } from "@/intake/profile";
import { AppError } from "@/lib/errors";
import { audit } from "@/audit/service";

/** Edit goals/budget/constraints after intake (K.6). Takes effect on the next run or "nouvelle piste". */
const Patch = z.object({
  budgetEur: z.number().min(0).max(10_000_000).optional(),
  weeklyHours: z.number().int().min(1).max(80).optional(),
  horizon: z.enum(["quick_revenue", "durable", "high_growth"]).optional(),
  exclusions: z.array(z.string().max(80)).max(12).optional(),
  skills: z.array(z.string().max(80)).max(12).optional(),
  allowPhysicalProducts: z.boolean().optional(),
  allowDirectCustomerContact: z.boolean().optional(),
  customerPreference: z.enum(["b2b", "b2c", "any"]).optional(),
});

export const PUT = api<{ id: string }>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { project } = await requireProjectAccess(user.id, id, "member");
  const patch = await parseBody(req, Patch);
  const row = await db().query.projectConstraints.findFirst({ where: eq(schema.projectConstraints.projectId, id) });
  if (!row) throw new AppError("CONFLICT", "Termine d'abord la conversation initiale.");
  const next: UserProfile = UserProfileSchema.parse({ ...(row.profile as UserProfile), ...patch, defaultsUsed: (row.profile as UserProfile).defaultsUsed.filter((k) => !(k in patch)) });
  await db().transaction(async (tx) => {
    await saveProfile(tx, id, next);
    await audit({ workspaceId: project.workspaceId, projectId: id, actorType: "user", actorId: user.id, action: "profile.update", data: patch }, tx);
  });
  return json({ profile: next });
});
