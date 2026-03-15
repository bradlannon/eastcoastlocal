import { db } from '@/lib/db/client';
import { events, event_sources } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

export function normalizePerformer(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')   // remove non-alphanumeric except spaces (no replacement)
    .replace(/\s+/g, ' ')          // collapse multiple spaces
    .trim();
}

export async function upsertEvent(
  venueId: number,
  extracted: ExtractedEvent,
  sourceUrl: string,
  scrapeSourceId: number | null = null,
  sourceType: 'scrape' | 'ticketmaster' | 'manual' = 'scrape'
): Promise<void> {
  if (!extracted.performer || !extracted.event_date) return;
  const normalizedPerformer = normalizePerformer(extracted.performer);
  const eventDate = new Date(extracted.event_date);

  const [row] = await db
    .insert(events)
    .values({
      venue_id: venueId,
      performer: extracted.performer!,
      normalized_performer: normalizedPerformer,
      event_date: eventDate,
      event_time: extracted.event_time ?? null,
      source_url: sourceUrl,
      scrape_timestamp: new Date(),
      price: extracted.price ?? null,
      ticket_link: extracted.ticket_link ?? null,
      description: extracted.description ?? null,
      cover_image_url: extracted.cover_image_url ?? null,
      event_category: extracted.event_category ?? 'other',
    })
    .onConflictDoUpdate({
      target: [events.venue_id, events.event_date, events.normalized_performer],
      set: {
        performer: extracted.performer!,
        event_time: extracted.event_time ?? null,
        source_url: sql`COALESCE(${events.source_url}, ${sourceUrl})`,
        scrape_timestamp: new Date(),
        price: extracted.price ?? null,
        ticket_link: extracted.ticket_link ?? null,
        description: extracted.description ?? null,
        cover_image_url: extracted.cover_image_url ?? null,
        event_category: extracted.event_category ?? 'other',
        updated_at: new Date(),
      },
    })
    .returning({ id: events.id });

  await db
    .insert(event_sources)
    .values({
      event_id: row.id,
      scrape_source_id: scrapeSourceId,
      source_type: sourceType,
      first_seen_at: new Date(),
      last_seen_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [event_sources.event_id, event_sources.source_type],
      set: { last_seen_at: new Date() },
    });
}
