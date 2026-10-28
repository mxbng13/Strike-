import { pgTable, text, uuid, integer, primaryKey, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt, tsz, money } from "./common";

export const memberRole = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const aiMode = pgEnum("ai_mode", ["auto", "llm", "heuristic"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256(token) — the raw token only lives in the httpOnly cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: tsz("expires_at").notNull(),
    createdAt: createdAt(),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("wm_user_idx").on(t.userId)],
);

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  aiMode: aiMode("ai_mode").notNull().default("auto"),
  monthlyAiBudgetEur: money("monthly_ai_budget_eur").notNull().default(20),
  defaultProjectAiBudgetEur: money("default_project_ai_budget_eur").notNull().default(5),
  maxConcurrentProjects: integer("max_concurrent_projects").notNull().default(5),
  updatedAt: updatedAt(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  locale: text("locale").notNull().default("fr-FR"),
  currentWorkspaceId: uuid("current_workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

/** Fixed-window counters for rate limiting (login, API, research). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: tsz("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
