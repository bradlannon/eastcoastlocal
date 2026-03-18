import { desc, eq, sql, count } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { rejected_events, venues, scrape_sources } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  missing_performer: { label: 'No Performer', color: 'bg-gray-100 text-gray-700' },
  missing_date: { label: 'No Date', color: 'bg-gray-100 text-gray-700' },
  past_event: { label: 'Past Event', color: 'bg-blue-50 text-blue-700' },
  low_confidence: { label: 'Low Confidence', color: 'bg-amber-50 text-amber-700' },
  invalid_date: { label: 'Invalid Date', color: 'bg-red-50 text-red-700' },
  too_far_out: { label: '>90 Days', color: 'bg-purple-50 text-purple-700' },
};

function reasonBadge(reason: string) {
  // Match prefix (e.g., "low_confidence (0.2)" → "low_confidence")
  const key = Object.keys(REASON_LABELS).find((k) => reason.startsWith(k));
  const meta = key ? REASON_LABELS[key] : { label: reason, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`} title={reason}>
      {meta.label}
    </span>
  );
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
    })
    .from(rejected_events)
    .leftJoin(venues, eq(rejected_events.venue_id, venues.id))
    .orderBy(desc(rejected_events.created_at))
    .limit(200);

  const totalRejected = reasonCounts.reduce((sum, r) => sum + r.count, 0);

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
        {rows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No rejected events yet. Rejections will appear here after the next scrape.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">When</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => {
                  let sourceHost: string | null = null;
                  if (row.sourceUrl) {
                    try { sourceHost = new URL(row.sourceUrl).hostname.replace(/^www\./, ''); } catch { sourceHost = row.sourceUrl; }
                  }
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate" title={row.performer ?? ''}>
                        {row.performer ?? <span className="text-gray-400 italic">null</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate" title={row.venueName ?? ''}>
                        {row.venueName ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {row.eventDate ?? <span className="text-gray-400 italic">null</span>}
                        {row.eventTime && <span className="text-gray-400 ml-1">{row.eventTime}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {row.confidence != null ? (
                          <span className={row.confidence < 0.3 ? 'text-red-600 font-medium' : row.confidence < 0.5 ? 'text-amber-600' : 'text-green-600'}>
                            {row.confidence.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {reasonBadge(row.rejectionReason)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[120px] truncate">
                        {sourceHost ? (
                          <a href={row.sourceUrl!} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {sourceHost}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {relativeTime(row.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
