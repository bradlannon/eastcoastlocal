import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  timestamp,
  doublePrecision,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

export const EVENT_CATEGORIES = [
  'live_music', 'comedy', 'theatre', 'arts', 'sports', 'festival', 'community', 'other',
] as const;

export const eventCategoryEnum = pgEnum('event_category', EVENT_CATEGORIES);

export const venues = pgTable(
  'venues',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    city: text('city').notNull(),
    province: text('province').notNull(), // NB, NS, PEI, NL
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    website: text('website'),
    venue_type: text('venue_type'), // pub, concert_hall, outdoor, etc.
    google_place_id: text('google_place_id'), // for cross-source dedup anchoring
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('venues_google_place_id_key').on(table.google_place_id),
  ]
);

export const recurring_series = pgTable(
  'recurring_series',
  {
    id: serial('id').primaryKey(),
    venue_id: integer('venue_id')
      .references(() => venues.id)
      .notNull(),
    normalized_performer: text('normalized_performer').notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('recurring_series_venue_performer_key').on(
      table.venue_id,
      table.normalized_performer
    ),
  ]
);

export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    venue_id: integer('venue_id')
      .references(() => venues.id)
      .notNull(),
    performer: text('performer').notNull(),
    normalized_performer: text('normalized_performer').notNull(), // lowercase, trimmed
    event_date: timestamp('event_date').notNull(),
    event_time: text('event_time'),
    source_url: text('source_url'),
    scrape_timestamp: timestamp('scrape_timestamp'),
    raw_extracted_text: text('raw_extracted_text'),
    price: text('price'),
    ticket_link: text('ticket_link'),
    description: text('description'),
    cover_image_url: text('cover_image_url'),
    event_category: eventCategoryEnum('event_category').default('community'),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
    archived_at: timestamp('archived_at', { withTimezone: true }),
    series_id: integer('series_id').references(() => recurring_series.id),
  },
  (table) => [
    // Composite dedup key: venue + date + normalized performer
    // Column order: venue_id first (highest cardinality filter), then date, then performer
    uniqueIndex('events_dedup_key').on(
      table.venue_id,
      table.event_date,
      table.normalized_performer
    ),
    // Index for date filtering queries
    index('events_event_date_idx').on(table.event_date),
  ]
);

export const scrape_sources = pgTable('scrape_sources', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  venue_id: integer('venue_id')
    .references(() => venues.id)
    .notNull(),
  scrape_frequency: text('scrape_frequency').notNull().default('daily'), // daily, weekly
  last_scraped_at: timestamp('last_scraped_at'),
  last_scrape_status: text('last_scrape_status').default('pending'), // success, failure, pending
  source_type: text('source_type').notNull(), // venue_website, eventbrite, bandsintown
  enabled: boolean('enabled').notNull().default(true),
  max_pages: integer('max_pages').notNull().default(1),
  last_event_count: integer('last_event_count'),
  avg_confidence: doublePrecision('avg_confidence'),
  consecutive_failures: integer('consecutive_failures').notNull().default(0),
  total_scrapes: integer('total_scrapes').notNull().default(0),
  total_events_extracted: integer('total_events_extracted').notNull().default(0),
  last_scrape_error: text('last_scrape_error'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const venueMergeLog = pgTable('venue_merge_log', {
  id: serial('id').primaryKey(),
  canonical_venue_id: integer('canonical_venue_id')
    .references(() => venues.id)
    .notNull(),
  merged_venue_name: text('merged_venue_name').notNull(),
  merged_venue_city: text('merged_venue_city').notNull(),
  name_score: doublePrecision('name_score').notNull(),
  distance_meters: doublePrecision('distance_meters'),
  merged_at: timestamp('merged_at').defaultNow().notNull(),
});

export const venueMergeCandidates = pgTable('venue_merge_candidates', {
  id: serial('id').primaryKey(),
  venue_a_id: integer('venue_a_id')
    .references(() => venues.id)
    .notNull(),
  venue_b_id: integer('venue_b_id')
    .references(() => venues.id)
    .notNull(),
  name_score: doublePrecision('name_score').notNull(),
  distance_meters: doublePrecision('distance_meters'),
  reason: text('reason').notNull(), // name_match_geo_distant, geo_close_name_differs, name_match_no_geo, name_match_geo_uncertain
  status: text('status').notNull().default('pending'), // pending, merged, kept_separate
  created_at: timestamp('created_at').defaultNow().notNull(),
  reviewed_at: timestamp('reviewed_at'),
});

export const SOURCE_TYPES = ['scrape', 'ticketmaster', 'manual'] as const;
export const sourceTypeEnum = pgEnum('source_type', SOURCE_TYPES);

export const event_sources = pgTable(
  'event_sources',
  {
    id: serial('id').primaryKey(),
    event_id: integer('event_id').references(() => events.id).notNull(),
    scrape_source_id: integer('scrape_source_id').references(() => scrape_sources.id),
    source_type: sourceTypeEnum('source_type').notNull(),
    first_seen_at: timestamp('first_seen_at').defaultNow().notNull(),
    last_seen_at: timestamp('last_seen_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('event_sources_dedup').on(table.event_id, table.source_type),
    index('event_sources_event_id_idx').on(table.event_id),
  ]
);

export const discovered_sources = pgTable(
  'discovered_sources',
  {
    id: serial('id').primaryKey(),
    url: text('url').notNull().unique(),
    domain: text('domain').notNull(),
    source_name: text('source_name'),
    province: text('province'),
    city: text('city'),
    status: text('status').notNull().default('pending'),
    discovery_method: text('discovery_method'),
    raw_context: text('raw_context'),
    discovery_score: doublePrecision('discovery_score'),
    discovered_at: timestamp('discovered_at').defaultNow().notNull(),
    reviewed_at: timestamp('reviewed_at'),
    added_to_sources_at: timestamp('added_to_sources_at'),
    lat: doublePrecision('lat'), // pre-geocoded latitude from Places API
    lng: doublePrecision('lng'), // pre-geocoded longitude from Places API
    address: text('address'), // full formatted address e.g. "1234 Barrington St, Halifax, NS B3J 1Y9"
    google_place_id: text('google_place_id'), // Google Maps Place ID for dedup
    place_types: text('place_types'), // JSON array string e.g. '["bar","night_club"]'
  },
  (table) => [
    uniqueIndex('discovered_sources_google_place_id_key').on(table.google_place_id),
  ]
);

export const submissionStatusEnum = pgEnum('submission_status', ['pending', 'approved', 'rejected']);

export const community_submissions = pgTable('community_submissions', {
  id: serial('id').primaryKey(),
  performer: text('performer').notNull(),
  venue_name: text('venue_name').notNull(),
  city: text('city').notNull(),
  province: text('province').notNull(),
  event_date: timestamp('event_date').notNull(),
  event_time: text('event_time'),
  event_category: eventCategoryEnum('event_category').default('community'),
  price: text('price'),
  link: text('link'),
  description: text('description'),
  status: submissionStatusEnum('submission_status').default('pending').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  reviewed_at: timestamp('reviewed_at'),
});

export const rejected_events = pgTable('rejected_events', {
  id: serial('id').primaryKey(),
  venue_id: integer('venue_id').references(() => venues.id),
  scrape_source_id: integer('scrape_source_id').references(() => scrape_sources.id),
  performer: text('performer'),
  event_date: text('event_date'),         // raw string from extraction (may be invalid)
  event_time: text('event_time'),
  confidence: doublePrecision('confidence'),
  event_category: text('event_category'),
  source_url: text('source_url'),
  rejection_reason: text('rejection_reason').notNull(),
  raw_data: text('raw_data'),             // JSON of full extracted event for debugging
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const app_settings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const discovery_runs = pgTable('discovery_runs', {
  id: serial('id').primaryKey(),
  discovery_method: text('discovery_method').notNull(), // 'google_places' | 'gemini_google_search' | 'reddit_gemini'
  province: text('province'), // null for Reddit and Gemini; 'NS'/'NB'/'PEI'/'NL' for Places
  started_at: timestamp('started_at').notNull(),
  completed_at: timestamp('completed_at').notNull(),
  candidates_found: integer('candidates_found').notNull().default(0),
  auto_approved: integer('auto_approved').notNull().default(0),
  queued_pending: integer('queued_pending').notNull().default(0),
  skipped_dedup: integer('skipped_dedup').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  error_detail: text('error_detail'),
});
