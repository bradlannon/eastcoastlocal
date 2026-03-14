CREATE TYPE "public"."event_category" AS ENUM('live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other');--> statement-breakpoint
CREATE TABLE "discovered_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"source_name" text,
	"province" text,
	"city" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"discovery_method" text,
	"raw_context" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"added_to_sources_at" timestamp,
	CONSTRAINT "discovered_sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "event_category" "event_category" DEFAULT 'community';