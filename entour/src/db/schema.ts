/**
 * ENTOUR — schéma relationnel complet (PostgreSQL + Drizzle).
 *
 * Conventions :
 *  - Identifiants UUID (v4) générés par la base.
 *  - Montants en centimes d'euro (integer) : jamais de flottants pour l'argent.
 *  - Coordonnées : `lat/lng` = position exacte (privée, jamais renvoyée publiquement),
 *    `public_lat/public_lng` = position floutée (~150–400 m) utilisée pour la carte et les distances.
 *  - Les index géographiques (earthdistance / GiST) sont créés dans une migration SQL dédiée.
 *  - `is_demo` marque les données de démonstration : elles sont isolées et refusées en production.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ────────────────────────────── Enums ────────────────────────────── */

export const userStatus = pgEnum("user_status", ["active", "suspended", "banned", "deleted"]);
export const adminRole = pgEnum("admin_role", ["super_admin", "moderator", "support"]);
export const verificationType = pgEnum("verification_type", ["email", "phone", "identity", "reference", "qualification"]);
export const verificationStatus = pgEnum("verification_status", ["pending", "approved", "rejected"]);
export const categorySensitivity = pgEnum("category_sensitivity", [
  "standard",
  "home_access",
  "children",
  "vulnerable",
  "animals",
  "technical",
  "transport",
]);
export const serviceStatus = pgEnum("service_status", [
  "open",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
  "removed",
]);
export const pricingType = pgEnum("pricing_type", ["fixed", "negotiable", "offer"]);
export const timingType = pgEnum("timing_type", ["immediate", "today", "tomorrow", "scheduled", "recurring"]);
export const urgencyLevel = pgEnum("urgency_level", ["normal", "high", "urgent"]);
export const serviceVisibility = pgEnum("service_visibility", ["public", "invite", "group"]);
export const moderationStatus = pgEnum("moderation_status", ["approved", "pending_review", "rejected"]);
export const applicationStatus = pgEnum("application_status", ["pending", "accepted", "rejected", "withdrawn", "waitlisted"]);
export const offerKind = pgEnum("offer_kind", ["price", "schedule"]);
export const offerStatus = pgEnum("offer_status", ["pending", "accepted", "rejected", "superseded"]);
export const assignmentStatus = pgEnum("assignment_status", [
  "confirmed",
  "in_progress",
  "provider_done",
  "completed",
  "cancelled",
  "disputed",
]);
export const conversationKind = pgEnum("conversation_kind", ["mission", "direct"]);
export const messageKind = pgEnum("message_kind", ["text", "image", "video", "file", "audio", "location", "system", "action"]);
export const reviewRole = pgEnum("review_role", ["as_requester", "as_provider"]);
export const reviewStatus = pgEnum("review_status", ["visible", "hidden", "under_review"]);
export const reviewCriterion = pgEnum("review_criterion", ["punctuality", "communication", "seriousness", "quality", "commitment"]);
export const badgeKind = pgEnum("badge_kind", ["auto", "manual", "seasonal"]);
export const paymentProvider = pgEnum("payment_provider", ["stripe", "simulation"]);
export const paymentStatus = pgEnum("payment_status", [
  "requires_payment",
  "authorized",
  "captured",
  "refunded",
  "partially_refunded",
  "cancelled",
  "failed",
]);
export const transactionType = pgEnum("transaction_type", ["charge", "earning", "platform_fee", "refund", "refund_reversal"]);
export const disputeStatus = pgEnum("dispute_status", ["open", "under_review", "resolved_requester", "resolved_provider", "resolved_split", "closed"]);
export const reportTarget = pgEnum("report_target", ["user", "service", "message", "review", "conversation", "post"]);
export const reportStatus = pgEnum("report_status", ["open", "reviewing", "actioned", "dismissed"]);
export const referralStatus = pgEnum("referral_status", ["pending", "qualified", "rewarded"]);
export const subscriptionPlan = pgEnum("subscription_plan", ["plus", "pro"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "past_due", "cancelled"]);
export const tokenType = pgEnum("token_type", ["email_verify", "password_reset", "phone_code"]);
export const favoriteKind = pgEnum("favorite_kind", ["service", "user", "trusted"]);
export const groupKind = pgEnum("group_kind", ["neighborhood", "topic"]);
export const postKind = pgEnum("post_kind", ["post", "thanks", "offer"]);

/* ────────────────────────────── Comptes ────────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").notNull().default("active"),
    birthDate: date("birth_date", { mode: "string" }).notNull(),
    phone: text("phone"),
    emailVerifiedAt: ts("email_verified_at"),
    phoneVerifiedAt: ts("phone_verified_at"),
    identityVerifiedAt: ts("identity_verified_at"),
    referralCode: text("referral_code").notNull(),
    referredBy: uuid("referred_by"),
    acceptedTermsAt: ts("accepted_terms_at").notNull(),
    termsVersion: text("terms_version").notNull(),
    suspendedUntil: ts("suspended_until"),
    suspensionReason: text("suspension_reason"),
    riskScore: integer("risk_score").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    lastSeenAt: ts("last_seen_at"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_referral_code_uq").on(t.referralCode),
    uniqueIndex("users_phone_uq").on(t.phone).where(sql`${t.phone} is not null and ${t.phoneVerifiedAt} is not null`),
    index("users_created_idx").on(t.createdAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: tokenType("type").notNull(),
    tokenHash: text("token_hash").notNull(),
    target: text("target"),
    attempts: smallint("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("auth_tokens_user_type_idx").on(t.userId, t.type)],
);

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"),
  areaLabel: text("area_label"),
  availableUntil: ts("available_until"),
  ratingAvg: doublePrecision("rating_avg").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  providerRatingAvg: doublePrecision("provider_rating_avg").notNull().default(0),
  providerRatingCount: integer("provider_rating_count").notNull().default(0),
  missionsDone: integer("missions_done").notNull().default(0),
  missionsRequested: integer("missions_requested").notNull().default(0),
  missionsCancelled: integer("missions_cancelled").notNull().default(0),
  onTimeCount: integer("on_time_count").notNull().default(0),
  lateCount: integer("late_count").notNull().default(0),
  avgResponseMinutes: integer("avg_response_minutes"),
  points: integer("points").notNull().default(0),
  portfolio: jsonb("portfolio").$type<{ url: string; caption?: string }[]>().notNull().default([]),
  settings: jsonb("settings")
    .$type<{
      theme?: "light" | "dark" | "system";
      dndUntil?: string | null;
      dndNightly?: boolean;
      dailyDigest?: boolean;
      notifyNewMissions?: boolean;
      notifyUrgent?: boolean;
      maxNotifPerHour?: number;
      language?: string;
      autoTranslate?: boolean;
    }>()
    .notNull()
    .default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const userVerifications = pgTable(
  "user_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: verificationType("type").notNull(),
    status: verificationStatus("status").notNull().default("pending"),
    provider: text("provider").notNull().default("manual"),
    externalRef: text("external_ref"),
    /** Métadonnées non sensibles uniquement (jamais d'image de pièce d'identité stockée ici). */
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    categoryId: integer("category_id"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    decidedAt: ts("decided_at"),
  },
  (t) => [index("user_verifications_user_idx").on(t.userId), index("user_verifications_status_idx").on(t.status)],
);

export const userSkills = pgTable(
  "user_skills",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    yearsExperience: smallint("years_experience").notNull().default(0),
    hourlyRateCents: integer("hourly_rate_cents"),
    certified: boolean("certified").notNull().default(false),
    notify: boolean("notify").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] }), index("user_skills_category_idx").on(t.categoryId)],
);

export const userLocations = pgTable("user_locations", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  label: text("label").notNull(),
  postcode: text("postcode"),
  radiusKm: smallint("radius_km").notNull().default(5),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const userAvailabilities = pgTable(
  "user_availabilities",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
  },
  (t) => [
    index("user_availabilities_user_idx").on(t.userId),
    check("availability_range", sql`${t.weekday} between 0 and 6 and ${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    muted: boolean("muted").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

/* ────────────────────────────── Catalogue ────────────────────────────── */

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    groupName: text("group_name").notNull(),
    icon: text("icon").notNull().default("sparkles"),
    color: text("color").notNull().default("#4F46E5"),
    description: text("description").notNull().default(""),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    sensitivity: categorySensitivity("sensitivity").notNull().default("standard"),
    requiresPhone: boolean("requires_phone").notNull().default(false),
    requiresIdentity: boolean("requires_identity").notNull().default(false),
    requiresReferences: boolean("requires_references").notNull().default(false),
    minAge: smallint("min_age").notNull().default(18),
    safetyNotice: text("safety_notice"),
    suggestedMinCents: integer("suggested_min_cents"),
    suggestedMaxCents: integer("suggested_max_cents"),
    suggestedDurationMinutes: integer("suggested_duration_minutes"),
    sortOrder: integer("sort_order").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    isCustom: boolean("is_custom").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_slug_uq").on(t.slug)],
);

/* ────────────────────────────── Demandes ────────────────────────────── */

export type Recurrence = { freq: "daily" | "weekly" | "monthly"; interval: number; until?: string | null; weekdays?: number[] };

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").notNull().references(() => categories.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: serviceStatus("status").notNull().default("open"),
    pricingType: pricingType("pricing_type").notNull(),
    budgetCents: integer("budget_cents"),
    timingType: timingType("timing_type").notNull(),
    startsAt: ts("starts_at"),
    durationMinutes: integer("duration_minutes"),
    recurrence: jsonb("recurrence").$type<Recurrence | null>(),
    urgency: urgencyLevel("urgency").notNull().default("normal"),
    peopleNeeded: smallint("people_needed").notNull().default(1),
    skillsRequired: text("skills_required").array().notNull().default(sql`'{}'::text[]`),
    searchRadiusKm: smallint("search_radius_km").notNull().default(5),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    publicLat: doublePrecision("public_lat").notNull(),
    publicLng: doublePrecision("public_lng").notNull(),
    areaLabel: text("area_label").notNull(),
    postcode: text("postcode"),
    addressPrivate: text("address_private"),
    visibility: serviceVisibility("visibility").notNull().default("public"),
    inviteCode: text("invite_code"),
    groupId: uuid("group_id"),
    isGroupBuy: boolean("is_group_buy").notNull().default(false),
    moderation: moderationStatus("moderation").notNull().default("approved"),
    moderationReasons: text("moderation_reasons").array().notNull().default(sql`'{}'::text[]`),
    riskScore: integer("risk_score").notNull().default(0),
    boostedUntil: ts("boosted_until"),
    viewsCount: integer("views_count").notNull().default(0),
    parentServiceId: uuid("parent_service_id"),
    cancelReason: text("cancel_reason"),
    isDemo: boolean("is_demo").notNull().default(false),
    expiresAt: ts("expires_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("services_status_idx").on(t.status, t.createdAt),
    index("services_category_idx").on(t.categoryId, t.status),
    index("services_requester_idx").on(t.requesterId, t.createdAt),
    uniqueIndex("services_invite_uq").on(t.inviteCode),
    check("services_people", sql`${t.peopleNeeded} between 1 and 20`),
    check("services_budget", sql`${t.budgetCents} is null or ${t.budgetCents} between 0 and 1000000`),
    check("services_radius", sql`${t.searchRadiusKm} in (1,3,5,10,20,50)`),
  ],
);

export const serviceImages = pgTable(
  "service_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    position: smallint("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("service_images_service_idx").on(t.serviceId)],
);

export const serviceApplications = pgTable(
  "service_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    applicantId: uuid("applicant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull().default(""),
    experience: text("experience").notNull().default(""),
    proposedPriceCents: integer("proposed_price_cents"),
    acceptsBudget: boolean("accepts_budget").notNull().default(false),
    status: applicationStatus("status").notNull().default("pending"),
    conversationId: uuid("conversation_id"),
    createdAt: createdAt(),
    decidedAt: ts("decided_at"),
  },
  (t) => [
    uniqueIndex("service_applications_uq").on(t.serviceId, t.applicantId),
    index("service_applications_applicant_idx").on(t.applicantId, t.createdAt),
  ],
);

export const serviceOffers = pgTable(
  "service_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => serviceApplications.id, { onDelete: "cascade" }),
    assignmentId: uuid("assignment_id"),
    conversationId: uuid("conversation_id"),
    fromUserId: uuid("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: offerKind("kind").notNull(),
    amountCents: integer("amount_cents"),
    proposedStartsAt: ts("proposed_starts_at"),
    note: text("note"),
    status: offerStatus("status").notNull().default("pending"),
    respondedBy: uuid("responded_by"),
    createdAt: createdAt(),
    respondedAt: ts("responded_at"),
  },
  (t) => [index("service_offers_service_idx").on(t.serviceId, t.createdAt)],
);

export const serviceAssignments = pgTable(
  "service_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => serviceApplications.id),
    conversationId: uuid("conversation_id"),
    agreedPriceCents: integer("agreed_price_cents").notNull(),
    priceConfirmedByProvider: boolean("price_confirmed_by_provider").notNull().default(true),
    priceConfirmedByRequester: boolean("price_confirmed_by_requester").notNull().default(true),
    startsAt: ts("starts_at"),
    status: assignmentStatus("status").notNull().default("confirmed"),
    lateMinutes: integer("late_minutes"),
    startedAt: ts("started_at"),
    providerDoneAt: ts("provider_done_at"),
    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("service_assignments_uq").on(t.serviceId, t.providerId),
    index("service_assignments_provider_idx").on(t.providerId, t.status),
    index("service_assignments_requester_idx").on(t.requesterId, t.status),
  ],
);

/* ────────────────────────────── Messagerie ────────────────────────────── */

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: conversationKind("kind").notNull(),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    /** Pour une conversation de mission : couple (service, intervenant) unique. */
    pairKey: text("pair_key").notNull(),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    reported: boolean("reported").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("conversations_pair_uq").on(t.pairKey), index("conversations_service_idx").on(t.serviceId)],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at"),
    lastDeliveredAt: ts("last_delivered_at"),
    archivedAt: ts("archived_at"),
    /** « Supprimer pour moi » : les messages antérieurs à cette date sont masqués pour ce membre. */
    clearedAt: ts("cleared_at"),
    hidden: boolean("hidden").notNull().default(false),
    muted: boolean("muted").notNull().default(false),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_members_user_idx").on(t.userId)],
);

export type MessageMeta = {
  location?: { lat: number; lng: number; expiresAt: string; label?: string };
  action?: { type: string; offerId?: string; amountCents?: number; startsAt?: string; lateMinutes?: number; status?: string };
  translatedFrom?: string;
};

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    kind: messageKind("kind").notNull().default("text"),
    body: text("body").notNull().default(""),
    replyToId: uuid("reply_to_id"),
    meta: jsonb("meta").$type<MessageMeta>().notNull().default({}),
    createdAt: createdAt(),
    editedAt: ts("edited_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_body_search_idx").using("gin", sql`to_tsvector('french', ${t.body})`),
  ],
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    fileName: text("file_name").notNull(),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("message_attachments_message_idx").on(t.messageId)],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/* ────────────────────────────── Fichiers ────────────────────────────── */

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    fileName: text("file_name").notNull(),
    /** public = image d'annonce / avatar ; private = pièce jointe de conversation (accès membres uniquement). */
    visibility: text("visibility").notNull().default("private"),
    conversationId: uuid("conversation_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("uploads_key_uq").on(t.storageKey)],
);

/* ────────────────────────────── Réputation ────────────────────────────── */

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").notNull().references(() => serviceAssignments.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: reviewRole("role").notNull(),
    rating: smallint("rating").notNull(),
    comment: text("comment").notNull().default(""),
    status: reviewStatus("status").notNull().default("visible"),
    reply: text("reply"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reviews_assignment_author_uq").on(t.assignmentId, t.authorId),
    index("reviews_target_idx").on(t.targetId, t.createdAt),
    check("reviews_rating", sql`${t.rating} between 1 and 5`),
  ],
);

export const reviewCriteria = pgTable(
  "review_criteria",
  {
    reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
    criterion: reviewCriterion("criterion").notNull(),
    score: smallint("score").notNull(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.criterion] }), check("review_criteria_score", sql`${t.score} between 1 and 5`)],
);

export type BadgeRule =
  | { type: "missions_done"; min: number }
  | { type: "rating"; min: number; minCount: number }
  | { type: "punctuality"; minRate: number; minCount: number }
  | { type: "category_missions"; categoryGroup: string; min: number }
  | { type: "verified" }
  | { type: "account_created" }
  | { type: "active_days"; days: number; minActions: number }
  | { type: "reliability"; maxCancelRate: number; minCount: number }
  | { type: "criterion_avg"; criterion: string; min: number; minCount: number }
  | { type: "neighbor"; minDistinctPeople: number }
  | { type: "season"; months: number[]; min: number }
  | { type: "manual" };

export const badges = pgTable(
  "badges",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull().default("#4F46E5"),
    kind: badgeKind("kind").notNull().default("auto"),
    rule: jsonb("rule").$type<BadgeRule>().notNull(),
    points: integer("points").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
  },
  (t) => [uniqueIndex("badges_slug_uq").on(t.slug)],
);

export const userBadges = pgTable(
  "user_badges",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    badgeId: integer("badge_id").notNull().references(() => badges.id, { onDelete: "cascade" }),
    awardedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeId] })],
);

export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),
    reason: text("reason").notNull(),
    refId: text("ref_id"),
    createdAt: createdAt(),
  },
  (t) => [index("points_ledger_user_idx").on(t.userId, t.createdAt), uniqueIndex("points_ledger_ref_uq").on(t.userId, t.reason, t.refId)],
);

/* ────────────────────────────── Paiements ────────────────────────────── */

export const payoutAccounts = pgTable("payout_accounts", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  provider: paymentProvider("provider").notNull(),
  externalId: text("external_id").notNull(),
  chargesEnabled: boolean("charges_enabled").notNull().default(false),
  payoutsEnabled: boolean("payouts_enabled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").notNull().references(() => serviceAssignments.id, { onDelete: "restrict" }),
    payerId: uuid("payer_id").notNull().references(() => users.id),
    payeeId: uuid("payee_id").notNull().references(() => users.id),
    provider: paymentProvider("provider").notNull(),
    amountCents: integer("amount_cents").notNull(),
    feeCents: integer("fee_cents").notNull(),
    payerFeeCents: integer("payer_fee_cents").notNull().default(0),
    currency: text("currency").notNull().default("eur"),
    status: paymentStatus("status").notNull().default("requires_payment"),
    externalId: text("external_id"),
    clientSecret: text("client_secret"),
    refundedCents: integer("refunded_cents").notNull().default(0),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    authorizedAt: ts("authorized_at"),
    capturedAt: ts("captured_at"),
    cancelledAt: ts("cancelled_at"),
  },
  (t) => [
    uniqueIndex("payments_assignment_uq").on(t.assignmentId),
    index("payments_payer_idx").on(t.payerId),
    index("payments_payee_idx").on(t.payeeId),
    uniqueIndex("payments_external_uq").on(t.externalId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id),
    type: transactionType("type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    label: text("label").notNull(),
    provider: paymentProvider("provider").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("transactions_user_idx").on(t.userId, t.createdAt), index("transactions_payment_idx").on(t.paymentId)],
);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").notNull().references(() => serviceAssignments.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id),
    openedBy: uuid("opened_by").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    description: text("description").notNull(),
    status: disputeStatus("status").notNull().default("open"),
    resolution: text("resolution"),
    refundCents: integer("refund_cents"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    createdAt: createdAt(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [index("disputes_status_idx").on(t.status, t.createdAt), uniqueIndex("disputes_open_uq").on(t.assignmentId).where(sql`${t.status} in ('open','under_review')`)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    plan: subscriptionPlan("plan").notNull(),
    status: subscriptionStatus("status").notNull().default("active"),
    provider: paymentProvider("provider").notNull(),
    externalId: text("external_id"),
    priceCents: integer("price_cents").notNull(),
    currentPeriodEnd: ts("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("subscriptions_user_idx").on(t.userId), uniqueIndex("subscriptions_active_uq").on(t.userId).where(sql`${t.status} = 'active'`)],
);

/* ────────────────────────────── Notifications ────────────────────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint)],
);

/* ────────────────────────────── Social & confiance ────────────────────────────── */

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: favoriteKind("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.targetId] })],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index("follows_followee_idx").on(t.followeeId)],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("blocks_blocked_idx").on(t.blockedId)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetType: reportTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: reportStatus("status").notNull().default("open"),
    handledBy: uuid("handled_by").references(() => users.id),
    resolution: text("resolution"),
    createdAt: createdAt(),
    handledAt: ts("handled_at"),
  },
  (t) => [
    index("reports_status_idx").on(t.status, t.createdAt),
    uniqueIndex("reports_once_uq").on(t.reporterId, t.targetType, t.targetId).where(sql`${t.status} in ('open','reviewing')`),
  ],
);

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerId: uuid("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    referredId: uuid("referred_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: referralStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
    qualifiedAt: ts("qualified_at"),
  },
  (t) => [uniqueIndex("referrals_referred_uq").on(t.referredId), index("referrals_referrer_idx").on(t.referrerId)],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    kind: groupKind("kind").notNull(),
    categoryGroup: text("category_group"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    radiusKm: smallint("radius_km").notNull().default(3),
    areaLabel: text("area_label").notNull(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    membersCount: integer("members_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("groups_slug_uq").on(t.slug)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index("group_members_user_idx").on(t.userId)],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    kind: postKind("kind").notNull().default("post"),
    body: text("body").notNull(),
    thankedUserId: uuid("thanked_user_id").references(() => users.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    publicLat: doublePrecision("public_lat").notNull(),
    publicLng: doublePrecision("public_lng").notNull(),
    areaLabel: text("area_label").notNull(),
    likesCount: integer("likes_count").notNull().default(0),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("posts_group_idx").on(t.groupId, t.createdAt), index("posts_created_idx").on(t.createdAt)],
);

export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
);

/* ────────────────────────────── Administration ────────────────────────────── */

export const adminRoles = pgTable("admin_roles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  role: adminRole("role").notNull(),
  grantedBy: uuid("granted_by").references(() => users.id),
  createdAt: createdAt(),
});

export const adminLogs = pgTable(
  "admin_logs",
  {
    id: serial("id").primaryKey(),
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_logs_created_idx").on(t.createdAt), index("admin_logs_target_idx").on(t.targetType, t.targetId)],
);

/** Journal de sécurité côté utilisateurs (connexions, changements sensibles). */
export const securityEvents = pgTable(
  "security_events",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    ip: text("ip"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("security_events_user_idx").on(t.userId, t.createdAt)],
);

export const announcements = pgTable("announcements", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull().default("all"),
  createdBy: uuid("created_by").references(() => users.id),
  recipients: integer("recipients").notNull().default(0),
  createdAt: createdAt(),
});

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/* ────────────────────────────── Relations ────────────────────────────── */

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  location: one(userLocations, { fields: [users.id], references: [userLocations.userId] }),
  skills: many(userSkills),
  badges: many(userBadges),
  adminRole: one(adminRoles, { fields: [users.id], references: [adminRoles.userId] }),
}));
export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
}));
export const userSkillsRelations = relations(userSkills, ({ one }) => ({
  user: one(users, { fields: [userSkills.userId], references: [users.id] }),
  category: one(categories, { fields: [userSkills.categoryId], references: [categories.id] }),
}));
export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, { fields: [userBadges.userId], references: [users.id] }),
  badge: one(badges, { fields: [userBadges.badgeId], references: [badges.id] }),
}));
export const servicesRelations = relations(services, ({ one, many }) => ({
  requester: one(users, { fields: [services.requesterId], references: [users.id] }),
  category: one(categories, { fields: [services.categoryId], references: [categories.id] }),
  images: many(serviceImages),
  applications: many(serviceApplications),
  assignments: many(serviceAssignments),
}));
export const serviceImagesRelations = relations(serviceImages, ({ one }) => ({
  service: one(services, { fields: [serviceImages.serviceId], references: [services.id] }),
}));
export const serviceApplicationsRelations = relations(serviceApplications, ({ one }) => ({
  service: one(services, { fields: [serviceApplications.serviceId], references: [services.id] }),
  applicant: one(users, { fields: [serviceApplications.applicantId], references: [users.id] }),
}));
export const serviceAssignmentsRelations = relations(serviceAssignments, ({ one }) => ({
  service: one(services, { fields: [serviceAssignments.serviceId], references: [services.id] }),
  provider: one(users, { fields: [serviceAssignments.providerId], references: [users.id] }),
}));
