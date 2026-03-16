CREATE TABLE "discovery_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"discovery_method" text NOT NULL,
	"province" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp NOT NULL,
	"candidates_found" integer DEFAULT 0 NOT NULL,
	"auto_approved" integer DEFAULT 0 NOT NULL,
	"queued_pending" integer DEFAULT 0 NOT NULL,
	"skipped_dedup" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"error_detail" text
);
