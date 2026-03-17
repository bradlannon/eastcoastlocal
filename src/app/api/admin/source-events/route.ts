import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { events, event_sources, venues } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(request: Request): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceId = parseInt(url.searchParams.get('sourceId') ?? '', 10);
  if (isNaN(sourceId)) {
    return NextResponse.json({ error: 'Missing sourceId' }, { status: 400 });
  }

  const rows = await db
    .select({
      eventId: events.id,
      performer: events.normalized_performer,
      eventDate: events.event_date,
      eventTime: events.event_time,
      category: events.event_category,
    })
    .from(event_sources)
    .innerJoin(events, eq(event_sources.event_id, events.id))
    .where(eq(event_sources.scrape_source_id, sourceId))
    .orderBy(desc(events.event_date))
    .limit(20);

  return NextResponse.json({ events: rows });
}
