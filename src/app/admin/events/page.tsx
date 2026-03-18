import Link from 'next/link';
import { desc, eq, gte, sql, count, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { events, venues, EVENT_CATEGORIES } from '@/lib/db/schema';
import { CATEGORY_META, type EventCategory } from '@/lib/categories';
import EventsList from './_components/EventsList';

export const dynamic = 'force-dynamic';

interface EventsPageProps {
  searchParams?: Promise<{ category?: string }>;
}

export default async function AdminEventsPage({ searchParams }: EventsPageProps) {
  const sp = searchParams ? await searchParams : {};
  const activeCategory = sp.category ?? null;

  // Count by category (active events only)
  const categoryCounts = await db
    .select({
      category: events.event_category,
      count: count(),
    })
    .from(events)
    .where(gte(events.event_date, sql`CURRENT_DATE`))
    .groupBy(events.event_category)
    .orderBy(desc(count()));

  const totalEvents = categoryCounts.reduce((sum, r) => sum + r.count, 0);

  // Build where conditions
  const conditions = [gte(events.event_date, sql`CURRENT_DATE`)];
  if (activeCategory) {
    if (activeCategory === 'other') {
      conditions.push(inArray(events.event_category, ['other', 'sports', 'festival']));
    } else {
      conditions.push(eq(events.event_category, activeCategory as EventCategory));
    }
  }

  // Fetch events
  const rows = await db
    .select({
      id: events.id,
      performer: events.performer,
      eventDate: events.event_date,
      eventTime: events.event_time,
      eventCategory: events.event_category,
      venueName: venues.name,
      city: venues.city,
      province: venues.province,
    })
    .from(events)
    .innerJoin(venues, eq(events.venue_id, venues.id))
    .where(sql`${sql.join(conditions, sql` AND `)}`)
    .orderBy(events.event_date)
    .limit(500);

  const serializedRows = rows.map((row) => ({
    id: row.id,
    performer: row.performer,
    eventDate: row.eventDate.toISOString(),
    eventTime: row.eventTime,
    eventCategory: row.eventCategory,
    venueName: row.venueName,
    city: row.city,
    province: row.province,
  }));

  // Group counts: merge sports/festival into other for display
  const displayCounts = new Map<string, number>();
  for (const r of categoryCounts) {
    const cat = r.category ?? 'other';
    if (cat === 'sports' || cat === 'festival') {
      displayCounts.set('other', (displayCounts.get('other') ?? 0) + r.count);
    } else {
      displayCounts.set(cat, (displayCounts.get(cat) ?? 0) + r.count);
    }
  }

  // Ordered category list for filter tabs
  const filterCategories = ['live_music', 'comedy', 'theatre', 'arts', 'community', 'other'] as const;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Events
          <span className="ml-2 text-sm font-normal text-gray-500">
            {activeCategory ? rows.length : totalEvents} {activeCategory ? 'filtered' : 'active'}
          </span>
        </h1>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link href="/admin/events" className="block">
          <div className={`rounded-lg shadow-sm border px-4 py-2 transition-all cursor-pointer ${
            !activeCategory ? 'ring-2 ring-[#E85D26] bg-orange-50' : 'bg-white hover:shadow-md'
          }`}>
            <p className="text-xs text-gray-500">All</p>
            <p className="text-lg font-bold text-gray-900">{totalEvents}</p>
          </div>
        </Link>
        {filterCategories.map((cat) => {
          const meta = CATEGORY_META[cat as EventCategory];
          const catCount = displayCounts.get(cat) ?? 0;
          const isActive = activeCategory === cat;
          return (
            <Link key={cat} href={isActive ? '/admin/events' : `/admin/events?category=${cat}`} className="block">
              <div className={`rounded-lg shadow-sm border px-4 py-2 transition-all cursor-pointer ${
                isActive ? 'ring-2 ring-[#E85D26] bg-orange-50' : 'bg-white hover:shadow-md'
              }`}>
                <p className="text-xs text-gray-500">{meta.label}</p>
                <p className="text-lg font-bold text-gray-900">{catCount}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Active filter label */}
      {activeCategory && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-700">{CATEGORY_META[activeCategory as EventCategory]?.label ?? activeCategory}</span> events
          </span>
          <Link href="/admin/events" className="text-xs text-[#E85D26] hover:text-orange-700 underline">
            Clear filter
          </Link>
        </div>
      )}

      {/* Events table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden max-h-[70vh] overflow-y-auto">
        <EventsList rows={serializedRows} />
      </div>
    </div>
  );
}
