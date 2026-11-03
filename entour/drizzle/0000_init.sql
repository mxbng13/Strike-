CREATE TYPE "public"."admin_role" AS ENUM('super_admin', 'moderator', 'support');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('confirmed', 'in_progress', 'provider_done', 'completed', 'cancelled', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."badge_kind" AS ENUM('auto', 'manual', 'seasonal');--> statement-breakpoint
CREATE TYPE "public"."category_sensitivity" AS ENUM('standard', 'home_access', 'children', 'vulnerable', 'animals', 'technical', 'transport');--> statement-breakpoint
CREATE TYPE "public"."conversation_kind" AS ENUM('mission', 'direct');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'under_review', 'resolved_requester', 'resolved_provider', 'resolved_split', 'closed');--> statement-breakpoint
CREATE TYPE "public"."favorite_kind" AS ENUM('service', 'user', 'trusted');--> statement-breakpoint
CREATE TYPE "public"."group_kind" AS ENUM('neighborhood', 'topic');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'image', 'video', 'file', 'audio', 'location', 'system', 'action');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('approved', 'pending_review', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."offer_kind" AS ENUM('price', 'schedule');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('stripe', 'simulation');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('requires_payment', 'authorized', 'captured', 'refunded', 'partially_refunded', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('post', 'thanks', 'offer');--> statement-breakpoint
CREATE TYPE "public"."pricing_type" AS ENUM('fixed', 'negotiable', 'offer');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'qualified', 'rewarded');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'reviewing', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('user', 'service', 'message', 'review', 'conversation', 'post');--> statement-breakpoint
CREATE TYPE "public"."review_criterion" AS ENUM('punctuality', 'communication', 'seriousness', 'quality', 'commitment');--> statement-breakpoint
CREATE TYPE "public"."review_role" AS ENUM('as_requester', 'as_provider');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('visible', 'hidden', 'under_review');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('open', 'assigned', 'in_progress', 'completed', 'cancelled', 'expired', 'removed');--> statement-breakpoint
CREATE TYPE "public"."service_visibility" AS ENUM('public', 'invite', 'group');--> statement-breakpoint
CREATE TYPE "public"."subscription_plan" AS ENUM('plus', 'pro');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."timing_type" AS ENUM('immediate', 'today', 'tomorrow', 'scheduled', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."token_type" AS ENUM('email_verify', 'password_reset', 'phone_code');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('charge', 'earning', 'platform_fee', 'refund', 'refund_reversal');--> statement-breakpoint
CREATE TYPE "public"."urgency_level" AS ENUM('normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'banned', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."verification_type" AS ENUM('email', 'phone', 'identity', 'reference', 'qualification');--> statement-breakpoint
CREATE TABLE "admin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" "admin_role" NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"created_by" uuid,
	"recipients" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"target" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"color" text DEFAULT '#4F46E5' NOT NULL,
	"kind" "badge_kind" DEFAULT 'auto' NOT NULL,
	"rule" jsonb NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text NOT NULL,
	"icon" text DEFAULT 'sparkles' NOT NULL,
	"color" text DEFAULT '#4F46E5' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"sensitivity" "category_sensitivity" DEFAULT 'standard' NOT NULL,
	"requires_phone" boolean DEFAULT false NOT NULL,
	"requires_identity" boolean DEFAULT false NOT NULL,
	"requires_references" boolean DEFAULT false NOT NULL,
	"min_age" smallint DEFAULT 18 NOT NULL,
	"safety_notice" text,
	"suggested_min_cents" integer,
	"suggested_max_cents" integer,
	"suggested_duration_minutes" integer,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_members" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_delivered_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"hidden" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_members_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "conversation_kind" NOT NULL,
	"service_id" uuid,
	"pair_key" text NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"payment_id" uuid,
	"opened_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"refund_cents" integer,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"kind" "favorite_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_kind_target_id_pk" PRIMARY KEY("user_id","kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"followee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "group_kind" NOT NULL,
	"category_group" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"radius_km" smallint DEFAULT 3 NOT NULL,
	"area_label" text NOT NULL,
	"created_by" uuid NOT NULL,
	"members_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"file_name" text NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"reply_to_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"muted" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_preferences_user_id_category_id_pk" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"payer_id" uuid NOT NULL,
	"payee_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"amount_cents" integer NOT NULL,
	"fee_cents" integer NOT NULL,
	"payer_fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"status" "payment_status" DEFAULT 'requires_payment' NOT NULL,
	"external_id" text,
	"client_secret" text,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"authorized_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"external_id" text NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"group_id" uuid,
	"kind" "post_kind" DEFAULT 'post' NOT NULL,
	"body" text NOT NULL,
	"thanked_user_id" uuid,
	"service_id" uuid,
	"public_lat" double precision NOT NULL,
	"public_lng" double precision NOT NULL,
	"area_label" text NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referred_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"target_user_id" uuid,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_criteria" (
	"review_id" uuid NOT NULL,
	"criterion" "review_criterion" NOT NULL,
	"score" smallint NOT NULL,
	CONSTRAINT "review_criteria_review_id_criterion_pk" PRIMARY KEY("review_id","criterion"),
	CONSTRAINT "review_criteria_score" CHECK ("review_criteria"."score" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"role" "review_role" NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"status" "review_status" DEFAULT 'visible' NOT NULL,
	"reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"ip" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"experience" text DEFAULT '' NOT NULL,
	"proposed_price_cents" integer,
	"accepts_budget" boolean DEFAULT false NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"application_id" uuid,
	"conversation_id" uuid,
	"agreed_price_cents" integer NOT NULL,
	"price_confirmed_by_provider" boolean DEFAULT true NOT NULL,
	"price_confirmed_by_requester" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"status" "assignment_status" DEFAULT 'confirmed' NOT NULL,
	"late_minutes" integer,
	"started_at" timestamp with time zone,
	"provider_done_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"application_id" uuid,
	"assignment_id" uuid,
	"conversation_id" uuid,
	"from_user_id" uuid NOT NULL,
	"kind" "offer_kind" NOT NULL,
	"amount_cents" integer,
	"proposed_starts_at" timestamp with time zone,
	"note" text,
	"status" "offer_status" DEFAULT 'pending' NOT NULL,
	"responded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "service_status" DEFAULT 'open' NOT NULL,
	"pricing_type" "pricing_type" NOT NULL,
	"budget_cents" integer,
	"timing_type" "timing_type" NOT NULL,
	"starts_at" timestamp with time zone,
	"duration_minutes" integer,
	"recurrence" jsonb,
	"urgency" "urgency_level" DEFAULT 'normal' NOT NULL,
	"people_needed" smallint DEFAULT 1 NOT NULL,
	"skills_required" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_radius_km" smallint DEFAULT 5 NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"public_lat" double precision NOT NULL,
	"public_lng" double precision NOT NULL,
	"area_label" text NOT NULL,
	"postcode" text,
	"address_private" text,
	"visibility" "service_visibility" DEFAULT 'public' NOT NULL,
	"invite_code" text,
	"group_id" uuid,
	"is_group_buy" boolean DEFAULT false NOT NULL,
	"moderation" "moderation_status" DEFAULT 'approved' NOT NULL,
	"moderation_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"boosted_until" timestamp with time zone,
	"views_count" integer DEFAULT 0 NOT NULL,
	"parent_service_id" uuid,
	"cancel_reason" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_people" CHECK ("services"."people_needed" between 1 and 20),
	CONSTRAINT "services_budget" CHECK ("services"."budget_cents" is null or "services"."budget_cents" between 0 and 1000000),
	CONSTRAINT "services_radius" CHECK ("services"."search_radius_km" in (1,3,5,10,20,50))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan" "subscription_plan" NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"external_id" text,
	"price_cents" integer NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"user_id" uuid,
	"type" "transaction_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"label" text NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"file_name" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_availabilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	CONSTRAINT "availability_range" CHECK ("user_availabilities"."weekday" between 0 and 6 and "user_availabilities"."start_minute" >= 0 and "user_availabilities"."end_minute" <= 1440 and "user_availabilities"."start_minute" < "user_availabilities"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"label" text NOT NULL,
	"postcode" text,
	"radius_km" smallint DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"area_label" text,
	"available_until" timestamp with time zone,
	"rating_avg" double precision DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"provider_rating_avg" double precision DEFAULT 0 NOT NULL,
	"provider_rating_count" integer DEFAULT 0 NOT NULL,
	"missions_done" integer DEFAULT 0 NOT NULL,
	"missions_requested" integer DEFAULT 0 NOT NULL,
	"missions_cancelled" integer DEFAULT 0 NOT NULL,
	"on_time_count" integer DEFAULT 0 NOT NULL,
	"late_count" integer DEFAULT 0 NOT NULL,
	"avg_response_minutes" integer,
	"points" integer DEFAULT 0 NOT NULL,
	"portfolio" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_skills" (
	"user_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"years_experience" smallint DEFAULT 0 NOT NULL,
	"hourly_rate_cents" integer,
	"certified" boolean DEFAULT false NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_skills_user_id_category_id_pk" PRIMARY KEY("user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "user_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "verification_type" NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"external_ref" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category_id" integer,
	"reviewed_by" uuid,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"birth_date" date NOT NULL,
	"phone" text,
	"email_verified_at" timestamp with time zone,
	"phone_verified_at" timestamp with time zone,
	"identity_verified_at" timestamp with time zone,
	"referral_code" text NOT NULL,
	"referred_by" uuid,
	"accepted_terms_at" timestamp with time zone NOT NULL,
	"terms_version" text NOT NULL,
	"suspended_until" timestamp with time zone,
	"suspension_reason" text,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_logs" ADD CONSTRAINT "admin_logs_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_roles" ADD CONSTRAINT "admin_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignment_id_service_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."service_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_assignment_id_service_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."service_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_users_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payee_id_users_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_thanked_user_id_users_id_fk" FOREIGN KEY ("thanked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_id_users_id_fk" FOREIGN KEY ("referred_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_criteria" ADD CONSTRAINT "review_criteria_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_assignment_id_service_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."service_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_applications" ADD CONSTRAINT "service_applications_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_applications" ADD CONSTRAINT "service_applications_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_assignments" ADD CONSTRAINT "service_assignments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_assignments" ADD CONSTRAINT "service_assignments_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_assignments" ADD CONSTRAINT "service_assignments_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_assignments" ADD CONSTRAINT "service_assignments_application_id_service_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."service_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_images" ADD CONSTRAINT "service_images_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_offers" ADD CONSTRAINT "service_offers_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_offers" ADD CONSTRAINT "service_offers_application_id_service_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."service_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_offers" ADD CONSTRAINT "service_offers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_availabilities" ADD CONSTRAINT "user_availabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_logs_created_idx" ON "admin_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_logs_target_idx" ON "admin_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_type_idx" ON "auth_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "badges_slug_uq" ON "badges" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "conversation_members_user_idx" ON "conversation_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_pair_uq" ON "conversations" USING btree ("pair_key");--> statement-breakpoint
CREATE INDEX "conversations_service_idx" ON "conversations" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_open_uq" ON "disputes" USING btree ("assignment_id") WHERE "disputes"."status" in ('open','under_review');--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_slug_uq" ON "groups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_body_search_idx" ON "messages" USING gin (to_tsvector('french', "body"));--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_assignment_uq" ON "payments" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "payments_payer_idx" ON "payments" USING btree ("payer_id");--> statement-breakpoint
CREATE INDEX "payments_payee_idx" ON "payments" USING btree ("payee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_uq" ON "payments" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "points_ledger_user_idx" ON "points_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_ref_uq" ON "points_ledger" USING btree ("user_id","reason","ref_id");--> statement-breakpoint
CREATE INDEX "posts_group_idx" ON "posts" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referred_uq" ON "referrals" USING btree ("referred_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_once_uq" ON "reports" USING btree ("reporter_id","target_type","target_id") WHERE "reports"."status" in ('open','reviewing');--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_assignment_author_uq" ON "reviews" USING btree ("assignment_id","author_id");--> statement-breakpoint
CREATE INDEX "reviews_target_idx" ON "reviews" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_applications_uq" ON "service_applications" USING btree ("service_id","applicant_id");--> statement-breakpoint
CREATE INDEX "service_applications_applicant_idx" ON "service_applications" USING btree ("applicant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_assignments_uq" ON "service_assignments" USING btree ("service_id","provider_id");--> statement-breakpoint
CREATE INDEX "service_assignments_provider_idx" ON "service_assignments" USING btree ("provider_id","status");--> statement-breakpoint
CREATE INDEX "service_assignments_requester_idx" ON "service_assignments" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX "service_images_service_idx" ON "service_images" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "service_offers_service_idx" ON "service_offers" USING btree ("service_id","created_at");--> statement-breakpoint
CREATE INDEX "services_status_idx" ON "services" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "services_requester_idx" ON "services" USING btree ("requester_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "services_invite_uq" ON "services" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_active_uq" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "transactions_user_idx" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_payment_idx" ON "transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uploads_key_uq" ON "uploads" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "user_availabilities_user_idx" ON "user_availabilities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_skills_category_idx" ON "user_skills" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "user_verifications_user_idx" ON "user_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_verifications_status_idx" ON "user_verifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_referral_code_uq" ON "users" USING btree ("referral_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone") WHERE "users"."phone" is not null and "users"."phone_verified_at" is not null;--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");