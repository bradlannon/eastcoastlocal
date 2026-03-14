import { NextResponse } from 'next/server';
import { gte, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { events, venues } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(events)
      .innerJoin(venues, eq(events.venue_id, venues.id))
      .where(gte(events.event_date, new Date()))
      .orderBy(events.event_date);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('[GET /api/events] Error fetching events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
