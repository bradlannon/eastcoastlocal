ALTER TABLE "scrape_sources" ADD COLUMN "last_event_count" integer;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "avg_confidence" double precision;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "total_scrapes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "total_events_extracted" integer DEFAULT 0 NOT NULL;