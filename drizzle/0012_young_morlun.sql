DO $$ BEGIN
  CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"performer" text NOT NULL,
	"venue_name" text NOT NULL,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"event_date" timestamp NOT NULL,
	"event_time" text,
	"event_category" "event_category" DEFAULT 'community',
	"price" text,
	"link" text,
	"description" text,
	"submission_status" "submission_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scrape_sources" ADD COLUMN "last_scrape_error" text;
EXCEPTION WHEN duplicate_column THEN null;
END $$;