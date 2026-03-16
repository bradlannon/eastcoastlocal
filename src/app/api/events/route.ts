import { NextResponse } from 'next/server';
import { isNull, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { events, venues, event_sources } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(events)
      .innerJoin(venues, eq(events.venue_id, venues.id))
      .where(isNull(events.archived_at))
      .orderBy(events.event_date);

    // Supplementary: get source_types for these events
    const eventIds = rows.map(r => r.events.id);
    const sourceRows = eventIds.length > 0
      ? await db
          .select({
            event_id: event_sources.event_id,
            source_type: event_sources.source_type,
          })
          .from(event_sources)
          .where(inArray(event_sources.event_id, eventIds))
      : [];

    // Build lookup map
    const sourceMap = new Map<number, string[]>();
    for (const sr of sourceRows) {
      const arr = sourceMap.get(sr.event_id) ?? [];
      arr.push(sr.source_type);
      sourceMap.set(sr.event_id, arr);
    }

    // Merge into response
    const enriched = rows.map(r => ({
      ...r,
      source_types: sourceMap.get(r.events.id) ?? [],
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('[GET /api/events] Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
