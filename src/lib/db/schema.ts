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

export const venues = pgTable('venues', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  province: text('province').notNull(), // NB, NS, PEI, NL
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  website: text('website'),
  phone: text('phone'),
  venue_type: text('venue_type'), // pub, concert_hall, outdoor, etc.
  created_at: timestamp('created_at').defaultNow().notNull(),
});

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
  created_at: timestamp('created_at').defaultNow().notNull(),
});

export const discovered_sources = pgTable('discovered_sources', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  domain: text('domain').notNull(),
  source_name: text('source_name'),
  province: text('province'),
  city: text('city'),
  status: text('status').notNull().default('pending'),
  discovery_method: text('discovery_method'),
  raw_context: text('raw_context'),
  discovered_at: timestamp('discovered_at').defaultNow().notNull(),
  reviewed_at: timestamp('reviewed_at'),
  added_to_sources_at: timestamp('added_to_sources_at'),
});
