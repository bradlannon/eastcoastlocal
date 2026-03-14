import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { events, venues, scrape_sources } from '@/lib/db/schema';

export type Event = InferSelectModel<typeof events>;
export type NewEvent = InferInsertModel<typeof events>;
export type Venue = InferSelectModel<typeof venues>;
export type NewVenue = InferInsertModel<typeof venues>;
export type ScrapeSource = InferSelectModel<typeof scrape_sources>;
export type NewScrapeSource = InferInsertModel<typeof scrape_sources>;

// Shape returned by Drizzle's .select().from(events).innerJoin(venues, ...)
export type EventWithVenue = {
  events: Event;
  venues: Venue;
};
