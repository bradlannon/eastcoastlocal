import { isNotNull, desc, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { events, venues } from '@/lib/db/schema';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function ArchivedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Archived Events</h1>
        <p className="text-sm text-gray-500 mt-1">
          Past events that have been automatically archived by the cron job.
        </p>
      </div>

      {archivedEvents.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
          No archived events yet.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Performer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Venue
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Event Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Archived At
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedEvents.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{event.performer}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{event.venue_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {event.event_date.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {event.archived_at?.toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={`?page=${page - 1}`}
                  className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  Previous
                </Link>
              ) : (
                <span className="px-3 py-1.5 border border-gray-200 rounded text-gray-300 cursor-not-allowed">
                  Previous
                </span>
              )}
              {page < totalPages ? (
                <Link
                  href={`?page=${page + 1}`}
                  className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                >
                  Next
                </Link>
              ) : (
                <span className="px-3 py-1.5 border border-gray-200 rounded text-gray-300 cursor-not-allowed">
                  Next
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
