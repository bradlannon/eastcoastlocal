CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_id" integer NOT NULL,
	"performer" text NOT NULL,
	"normalized_performer" text NOT NULL,
	"event_date" timestamp NOT NULL,
	"event_time" text,
	"source_url" text,
	"scrape_timestamp" timestamp,
	"raw_extracted_text" text,
	"price" text,
	"ticket_link" text,
	"description" text,
	"cover_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"venue_id" integer NOT NULL,
	"scrape_frequency" text DEFAULT 'daily' NOT NULL,
	"last_scraped_at" timestamp,
	"last_scrape_status" text DEFAULT 'pending',
	"source_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"website" text,
	"phone" text,
	"venue_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD CONSTRAINT "scrape_sources_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_dedup_key" ON "events" USING btree ("venue_id","event_date","normalized_performer");--> statement-breakpoint
CREATE INDEX "events_event_date_idx" ON "events" USING btree ("event_date");