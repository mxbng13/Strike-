CREATE TYPE "public"."claim_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "purchase_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"receipt_key" text NOT NULL,
	"claimed_cents" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"previous_status" text NOT NULL,
	"analysis" jsonb DEFAULT '{"source":"none"}'::jsonb NOT NULL,
	"refunded_cents" integer,
	"decided_by" uuid,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "purchase_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_assignments" ADD COLUMN "purchase_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "purchase_cents" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "purchase_note" text;--> statement-breakpoint
ALTER TABLE "purchase_claims" ADD CONSTRAINT "purchase_claims_assignment_id_service_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."service_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_claims" ADD CONSTRAINT "purchase_claims_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_claims" ADD CONSTRAINT "purchase_claims_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_claims_status_idx" ON "purchase_claims" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_claims_open_uq" ON "purchase_claims" USING btree ("assignment_id") WHERE "purchase_claims"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_purchase" CHECK ("services"."purchase_cents" is null or "services"."purchase_cents" between 0 and 1000000);