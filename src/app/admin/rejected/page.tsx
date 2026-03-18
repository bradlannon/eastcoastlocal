import { desc, eq, sql, count } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { rejected_events, venues } from '@/lib/db/schema';
import RejectedList from './_components/RejectedList';

export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  missing_performer: { label: 'No Performer', color: 'bg-gray-100 text-gray-700' },
  missing_date: { label: 'No Date', color: 'bg-gray-100 text-gray-700' },
  past_event: { label: 'Past Event', color: 'bg-blue-50 text-blue-700' },
  low_confidence: { label: 'Low Confidence', color: 'bg-amber-50 text-amber-700' },
  invalid_date: { label: 'Invalid Date', color: 'bg-red-50 text-red-700' },
  too_far_out: { label: '>90 Days', color: 'bg-purple-50 text-purple-700' },
};

const WEEKDAYS = ['monday', 'mondays', 'tuesday', 'tuesdays', 'wednesday', 'wednesdays', 'thursday', 'thursdays', 'friday', 'fridays', 'saturday', 'saturdays', 'sunday', 'sundays'];

function hasWeekday(text: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return WEEKDAYS.some((d) => lower.includes(d));
}

export default async function RejectedEventsPage() {
  // Summary by reason
  const reasonCounts = await db
    .select({
      reason: sql<string>`
        CASE
          WHEN ${rejected_events.rejection_reason} LIKE 'low_confidence%' THEN 'low_confidence'
          WHEN ${rejected_events.rejection_reason} LIKE 'past_event%' THEN 'past_event'
          WHEN ${rejected_events.rejection_reason} LIKE 'too_far_out%' THEN 'too_far_out'
          WHEN ${rejected_events.rejection_reason} LIKE 'invalid_date%' THEN 'invalid_date'
          ELSE ${rejected_events.rejection_reason}
        END
      `,
      count: count(),
    })
    .from(rejected_events)
    .groupBy(sql`1`)
    .orderBy(desc(count()));

  // Recent rejections with venue name
  const rows = await db
    .select({
      id: rejected_events.id,
      performer: rejected_events.performer,
      eventDate: rejected_events.event_date,
      eventTime: rejected_events.event_time,
      confidence: rejected_events.confidence,
      eventCategory: rejected_events.event_category,
      sourceUrl: rejected_events.source_url,
      rejectionReason: rejected_events.rejection_reason,
      createdAt: rejected_events.created_at,
      venueName: venues.name,
      venueId: rejected_events.venue_id,
    })
    .from(rejected_events)
    .leftJoin(venues, eq(rejected_events.venue_id, venues.id))
    .orderBy(desc(rejected_events.created_at))
    .limit(200);

  const totalRejected = reasonCounts.reduce((sum, r) => sum + r.count, 0);

  const serializedRows = rows.map((row) => ({
    id: row.id,
    performer: row.performer,
    eventDate: row.eventDate,
    eventTime: row.eventTime,
    confidence: row.confidence,
    eventCategory: row.eventCategory,
    sourceUrl: row.sourceUrl,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
    venueName: row.venueName,
    venueId: row.venueId,
    hasWeekday: hasWeekday(row.performer),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Rejected Events
          <span className="ml-2 text-sm font-normal text-gray-500">
            {totalRejected} total
          </span>
        </h1>
      </div>

      {/* Reason summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-6">
        {reasonCounts.map((r) => {
          const key = Object.keys(REASON_LABELS).find((k) => r.reason.startsWith(k));
          const meta = key ? REASON_LABELS[key] : { label: r.reason, color: 'bg-gray-100 text-gray-700' };
          return (
            <div key={r.reason} className="bg-white rounded-lg shadow-sm border px-4 py-3">
              <p className="text-xs text-gray-500">{meta.label}</p>
              <p className="text-xl font-bold text-gray-900">{r.count}</p>
            </div>
          );
        })}
      </div>

      {/* Rejection list */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <RejectedList rows={serializedRows} />
      </div>
    </div>
  );
}
