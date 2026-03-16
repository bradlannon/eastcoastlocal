import { NextResponse } from 'next/server';
import { isNotNull, desc, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { events, venues } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const [archivedEvents, countResult] = await Promise.all([
      db
        .select({
          id: events.id,
          performer: events.performer,
          venue_name: venues.name,
          event_date: events.event_date,
          archived_at: events.archived_at,
        })
        .from(events)
        .innerJoin(venues, eq(events.venue_id, venues.id))
        .where(isNotNull(events.archived_at))
        .orderBy(desc(events.archived_at))
        .limit(PAGE_SIZE)
        .offset(offset),
      db
        .select({ count: count() })
        .from(events)
        .where(isNotNull(events.archived_at)),
    ]);

    const total = countResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    return NextResponse.json({
      events: archivedEvents,
      page,
      totalPages,
      total,
    });
  } catch (error) {
    console.error('Error fetching archived events:', error);
    return NextResponse.json({ error: 'Failed to fetch archived events' }, { status: 500 });
  }
}
