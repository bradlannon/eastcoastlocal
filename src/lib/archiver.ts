import { db } from '@/lib/db/client';
import { events, venues } from '@/lib/db/schema';
import { and, isNull, lt, inArray, eq } from 'drizzle-orm';

export function getStartOfTodayInTimezone(tz: string): Date {
  // Use Intl API to get Y/M/D in target timezone, then compute UTC equivalent
  const now = new Date();
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const startOfDayInTz = new Date(nowInTz);
  startOfDayInTz.setHours(0, 0, 0, 0);
  const diff = nowInTz.getTime() - now.getTime();
  return new Date(startOfDayInTz.getTime() - diff);
}

export async function archivePastEvents(): Promise<{ total: number; halifax: number; nl: number }> {
  const halifaxThreshold = getStartOfTodayInTimezone('America/Halifax');
  const nlThreshold = getStartOfTodayInTimezone('America/St_Johns');

  // Pre-fetch venue IDs for Halifax provinces (NS, NB, PEI) — avoids Drizzle subquery issues
  const halifaxVenues = await db
    .select({ id: venues.id })
    .from(venues)
    .where(inArray(venues.province, ['NS', 'NB', 'PEI']));

  // Pre-fetch venue IDs for NL
  const nlVenues = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.province, 'NL'));

  const halifaxVenueIds = halifaxVenues.map(v => v.id);
  const nlVenueIds = nlVenues.map(v => v.id);

  // Archive past events for Halifax provinces
  const halifaxArchived = halifaxVenueIds.length > 0
    ? await db
        .update(events)
        .set({ archived_at: new Date() })
        .where(
          and(
            isNull(events.archived_at),
            lt(events.event_date, halifaxThreshold),
            inArray(events.venue_id, halifaxVenueIds)
          )
        )
        .returning({ id: events.id })
    : [];

  // Archive past events for NL (Newfoundland — different UTC offset)
  const nlArchived = nlVenueIds.length > 0
    ? await db
        .update(events)
        .set({ archived_at: new Date() })
        .where(
          and(
            isNull(events.archived_at),
            lt(events.event_date, nlThreshold),
            inArray(events.venue_id, nlVenueIds)
          )
        )
        .returning({ id: events.id })
    : [];

  const halifax = halifaxArchived.length;
  const nl = nlArchived.length;
  const total = halifax + nl;

  console.log(`[archive-cron] Archived ${total} events (Halifax: ${halifax}, NL: ${nl})`);

  return { total, halifax, nl };
}
