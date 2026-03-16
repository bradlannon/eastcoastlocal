ALTER TABLE "discovered_sources" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "discovered_sources" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "discovered_sources" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "discovered_sources" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "discovered_sources" ADD COLUMN "place_types" text;--> statement-breakpoint
ALTER TABLE "discovered_sources" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "google_place_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "discovered_sources_google_place_id_key" ON "discovered_sources" USING btree ("google_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_google_place_id_key" ON "venues" USING btree ("google_place_id");