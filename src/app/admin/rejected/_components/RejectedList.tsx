'use client';

import { useFormStatus } from 'react-dom';
import { approveRejectedEvent, approveAsRecurring, dismissRejectedEvent } from '../actions';

interface RejectedRow {
  id: number;
  performer: string | null;
  eventDate: string | null;
  eventTime: string | null;
  confidence: number | null;
  eventCategory: string | null;
  sourceUrl: string | null;
  rejectionReason: string;
  createdAt: string; // ISO string
  venueName: string | null;
  venueId: number | null;
  hasWeekday: boolean;
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
  const key = Object.keys(REASON_LABELS).find((k) => reason.startsWith(k));
  const meta = key ? REASON_LABELS[key] : { label: reason, color: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`} title={reason}>
      {meta.label}
    </span>
  );
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function SubmitButton({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-50`}>
      {pending ? '...' : children}
    </button>
  );
}

export default function RejectedList({ rows }: { rows: RejectedRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No rejected events yet. Rejections will appear here after the next scrape.
      </div>
    );
  }

  return (
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
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row) => {
            let sourceHost: string | null = null;
            if (row.sourceUrl) {
              try { sourceHost = new URL(row.sourceUrl).hostname.replace(/^www\./, ''); } catch { sourceHost = row.sourceUrl; }
            }
            const canApprove = row.venueId != null && row.performer;
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
                <td className="px-4 py-3 text-sm whitespace-nowrap">
                  <div className="flex gap-1">
                    {canApprove && (
                      <>
                        {row.hasWeekday && !row.eventDate ? (
                          <form action={approveAsRecurring}>
                            <input type="hidden" name="id" value={row.id} />
                            <SubmitButton className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                              Weekly
                            </SubmitButton>
                          </form>
                        ) : (
                          <form action={approveRejectedEvent}>
                            <input type="hidden" name="id" value={row.id} />
                            <SubmitButton className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                              Approve
                            </SubmitButton>
                          </form>
                        )}
                      </>
                    )}
                    <form action={dismissRejectedEvent}>
                      <input type="hidden" name="id" value={row.id} />
                      <SubmitButton className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors">
                        Dismiss
                      </SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
