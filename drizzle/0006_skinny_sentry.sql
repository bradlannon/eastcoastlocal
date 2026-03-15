CREATE TYPE "public"."source_type" AS ENUM('scrape', 'ticketmaster', 'manual');--> statement-breakpoint
CREATE TABLE "event_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"scrape_source_id" integer,
	"source_type" "source_type" NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_scrape_source_id_scrape_sources_id_fk" FOREIGN KEY ("scrape_source_id") REFERENCES "public"."scrape_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_sources_dedup" ON "event_sources" USING btree ("event_id","source_type");--> statement-breakpoint
CREATE INDEX "event_sources_event_id_idx" ON "event_sources" USING btree ("event_id");