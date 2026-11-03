import { z } from "zod";
import { db } from "@/db";
import { badges, categories, platformSettings } from "@/db/schema";
import { logAdmin } from "@/lib/audit";
import { clientIp, requirePermission, type Permission } from "@/lib/auth";
import { notFound } from "@/lib/errors";
import { parseBody, route } from "@/lib/http";
import { getSettings, type Settings } from "@/lib/settings";
import * as admin from "@/server/admin";
import { paymentsAdminList } from "@/server/payments";
import { awardManualBadge, revokeBadge } from "@/server/reputation";

type P = { path: string[] };

const categoryInput = z.object({
  id: z.number().int().optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/).optional(),
  name: z.string().min(2).max(80).optional(),
  groupName: z.string().min(2).max(60).optional(),
  icon: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(400).optional(),
  keywords: z.array(z.string().max(40)).max(60).optional(),
  sensitivity: z.enum(["standard", "home_access", "children", "vulnerable", "animals", "technical", "transport"]).optional(),
  requiresPhone: z.boolean().optional(),
  requiresIdentity: z.boolean().optional(),
  requiresReferences: z.boolean().optional(),
  safetyNotice: z.string().max(600).nullable().optional(),
  suggestedMinCents: z.number().int().min(0).nullable().optional(),
  suggestedMaxCents: z.number().int().min(0).nullable().optional(),
  suggestedDurationMinutes: z.number().int().min(5).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const badgeInput = z.object({
  id: z.number().int().optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,60}$/).optional(),
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(300).optional(),
  icon: z.string().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  kind: z.enum(["auto", "manual", "seasonal"]).optional(),
  rule: z.record(z.string(), z.unknown()).optional(),
  points: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

async function guard(perm: Permission) {
  return requirePermission(perm);
}

export const GET = route<P>(async (req, { path }) => {
  const [section, id, sub] = path;
  const sp = req.nextUrl.searchParams;
  switch (section) {
    case "dashboard":
      await guard("dashboard.view");
      return { stats: await admin.dashboardStats({ includeDemo: sp.get("demo") === "1" }) };
    case "profitability":
      await guard("finance.view");
      return { profitability: await admin.profitability() };
    case "market":
      await guard("dashboard.view");
      return { cells: await admin.marketBalance() };
    case "users": {
      const a = await guard("users.view");
      if (id) return admin.userDetail(a, id);
      return { users: await admin.searchUsers(sp.get("q") ?? "") };
    }
    case "verifications":
      await guard("users.verify");
      return { verifications: await admin.pendingVerifications() };
    case "services":
      await guard("services.moderate");
      return { services: await admin.listServicesAdmin(sp.get("q") ?? "", sp.get("status") ?? undefined) };
    case "moderation":
      await guard("services.moderate");
      return { queue: await admin.moderationQueue() };
    case "reports":
      await guard("reports.handle");
      if (id && sub === "preview") return { preview: await admin.reportTargetPreview(sp.get("type") ?? "", id) };
      return { reports: await admin.listReports(sp.get("all") === "1" ? "all" : "open") };
    case "disputes":
      await guard("disputes.handle");
      return { disputes: await admin.listDisputes(sp.get("all") === "1" ? "all" : "open") };
    case "categories":
      await guard("categories.manage");
      return { categories: await db.select().from(categories).orderBy(categories.sortOrder) };
    case "badges":
      await guard("badges.manage");
      return { badges: await db.select().from(badges).orderBy(badges.sortOrder) };
    case "settings":
      await guard("settings.manage");
      return { settings: await getSettings(), raw: await db.select().from(platformSettings) };
    case "announcements":
      await guard("announcements.send");
      return { announcements: await admin.listAnnouncements() };
    case "logs":
      await guard("logs.view");
      return { logs: await admin.listLogs() };
    case "payments":
      await guard("finance.view");
      return { payments: await paymentsAdminList() };
    default:
      throw notFound("Section");
  }
});

export const POST = route<P>(async (req, { path }) => {
  const [section, id, sub] = path;
  const ip = await clientIp();
  switch (section) {
    case "users": {
      if (sub === "status") {
        const body = await parseBody(req, z.object({ action: z.enum(["suspend", "ban", "reactivate"]), reason: z.string().max(500), days: z.number().int().min(1).max(365).optional() }));
        const a = await guard(body.action === "ban" ? "users.ban" : "users.suspend");
        await admin.setUserStatus(a, id, body.action, body, ip);
        return { ok: true };
      }
      if (sub === "role") {
        const a = await guard("admins.manage");
        const { role } = await parseBody(req, z.object({ role: z.enum(["super_admin", "moderator", "support"]).nullable() }));
        await admin.setAdminRole(a, id, role, ip);
        return { ok: true };
      }
      if (sub === "badges") {
        const a = await guard("badges.manage");
        const { badgeId, award } = await parseBody(req, z.object({ badgeId: z.number().int(), award: z.boolean() }));
        if (award) await awardManualBadge(id, badgeId);
        else await revokeBadge(id, badgeId);
        await logAdmin(a.id, award ? "badge.award" : "badge.revoke", { type: "user", id }, { badgeId }, ip);
        return { ok: true };
      }
      break;
    }
    case "verifications": {
      const a = await guard("users.verify");
      const { approve, note } = await parseBody(req, z.object({ approve: z.boolean(), note: z.string().max(500).default("") }));
      await admin.decideVerification(a, id, approve, note, ip);
      return { ok: true };
    }
    case "services": {
      const a = await guard("services.moderate");
      const { decision, reason } = await parseBody(req, z.object({ decision: z.enum(["approve", "reject", "remove"]), reason: z.string().max(500).default("") }));
      await admin.moderateService(a, id, decision, reason, ip);
      return { ok: true };
    }
    case "reports": {
      const a = await guard("reports.handle");
      const { decision, resolution } = await parseBody(req, z.object({ decision: z.enum(["actioned", "dismissed", "reviewing"]), resolution: z.string().max(1000).default("") }));
      await admin.handleReport(a, id, decision, resolution, ip);
      return { ok: true };
    }
    case "disputes": {
      const a = await guard("disputes.handle");
      const input = await parseBody(
        req,
        z.object({ outcome: z.enum(["resolved_requester", "resolved_provider", "resolved_split", "under_review"]), resolution: z.string().min(3).max(2000), refundCents: z.number().int().min(0).optional() }),
      );
      await admin.resolveDispute(a, id, input, ip);
      return { ok: true };
    }
    case "reviews": {
      const a = await guard("reviews.moderate");
      const { visible } = await parseBody(req, z.object({ visible: z.boolean() }));
      await admin.moderateReview(a, id, visible, ip);
      return { ok: true };
    }
    case "categories": {
      const a = await guard("categories.manage");
      const input = await parseBody(req, categoryInput);
      return { category: await admin.upsertCategory(a, input, ip) };
    }
    case "badges": {
      const a = await guard("badges.manage");
      const input = await parseBody(req, badgeInput);
      return { badge: await admin.upsertBadge(a, input as Parameters<typeof admin.upsertBadge>[1], ip) };
    }
    case "settings": {
      const a = await guard("settings.manage");
      const { value } = await parseBody(req, z.object({ value: z.unknown() }));
      const allowed: (keyof Settings)[] = ["fees", "subscriptions", "boost", "limits", "moderation", "loyalty", "referral", "launch", "legal"];
      if (!allowed.includes(id as keyof Settings)) throw notFound("Paramètre");
      return { setting: await admin.updateSetting(a, id as keyof Settings, value, ip) };
    }
    case "announcements": {
      const a = await guard("announcements.send");
      const input = await parseBody(req, z.object({ title: z.string().min(3).max(120), body: z.string().min(3).max(1000), audience: z.enum(["all", "providers", "requesters"]) }));
      return { announcement: await admin.sendAnnouncement(a, input, ip) };
    }
  }
  throw notFound("Action");
});
