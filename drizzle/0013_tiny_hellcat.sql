CREATE TABLE "rejected_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer,
	"scrape_source_id" integer,
	"performer" text,
	"event_date" text,
	"event_time" text,
	"confidence" double precision,
	"event_category" text,
	"source_url" text,
	"rejection_reason" text NOT NULL,
	"raw_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rejected_events" ADD CONSTRAINT "rejected_events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rejected_events" ADD CONSTRAINT "rejected_events_scrape_source_id_scrape_sources_id_fk" FOREIGN KEY ("scrape_source_id") REFERENCES "public"."scrape_sources"("id") ON DELETE no action ON UPDATE no action;