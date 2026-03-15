CREATE TABLE "venue_merge_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"venue_a_id" integer NOT NULL,
	"venue_b_id" integer NOT NULL,
	"name_score" double precision NOT NULL,
	"distance_meters" double precision,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "venue_merge_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_venue_id" integer NOT NULL,
	"merged_venue_name" text NOT NULL,
	"merged_venue_city" text NOT NULL,
	"name_score" double precision NOT NULL,
	"distance_meters" double precision,
	"merged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_merge_candidates" ADD CONSTRAINT "venue_merge_candidates_venue_a_id_venues_id_fk" FOREIGN KEY ("venue_a_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_merge_candidates" ADD CONSTRAINT "venue_merge_candidates_venue_b_id_venues_id_fk" FOREIGN KEY ("venue_b_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_merge_log" ADD CONSTRAINT "venue_merge_log_canonical_venue_id_venues_id_fk" FOREIGN KEY ("canonical_venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;