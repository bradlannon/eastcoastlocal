import { db } from '@/lib/db/client';
import { venues, events } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export async function truncateAll() {
  // Truncate in reverse-dependency order; CASCADE handles FK constraints
  await db.execute(sql`
    TRUNCATE TABLE
      event_sources,
      rejected_events,
      community_submissions,
      venue_merge_candidates,
      venue_merge_log,
      events,
      recurring_series,
      scrape_sources,
      discovered_sources,
      discovery_runs,
      app_settings,
      venues
    RESTART IDENTITY CASCADE;
  `);
}

export async function seedMinimal() {
  await truncateAll();

  const [venue] = await db
    .insert(venues)
    .values({
      name: 'Test Venue',
      address: '123 Main St',
      city: 'Halifax',
      province: 'NS',
      lat: 44.6488,
      lng: -63.5752,
    })
    .returning();

  const [event] = await db
    .insert(events)
    .values({
      venue_id: venue.id,
      performer: 'Test Artist',
      normalized_performer: 'test artist',
      event_date: new Date('2026-06-01T20:00:00Z'),
      event_time: '8:00 PM',
      event_category: 'live_music',
    })
    .returning();

  return { venue, event };
}
