'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface SourceRow {
  sourceId: number;
  url: string;
  status: string | null;
  lastScrapedAt: string | null;
  enabled: boolean;
  venueName: string;
  lastEventCount: number | null;
  avgConfidence: number | null;
  consecutiveFailures: number | null;
  lastScrapeError: string | null;
}

interface EventRow {
  eventId: number;
  performer: string;
  eventDate: string;
  eventTime: string | null;
  category: string | null;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function SourceHealthTable({ rows }: { rows: SourceRow[] }) {
  const router = useRouter();
  const [scrapingId, setScrapingId] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ sourceId: number; type: 'error' | 'events'; x: number; y: number } | null>(null);
  const [eventCache, setEventCache] = useState<Record<number, EventRow[]>>({});
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function scrapeOne(sourceId: number) {
    setScrapingId(sourceId);
    try {
      await fetch(`/api/admin/trigger/scrape?source=${sourceId}`, { method: 'POST' });
      router.refresh();
    } finally {
      setScrapingId(null);
    }
  }

  async function fetchEvents(sourceId: number) {
    if (eventCache[sourceId]) return;
    try {
      const res = await fetch(`/api/admin/source-events?sourceId=${sourceId}`);
      const data = await res.json();
      setEventCache((prev) => ({ ...prev, [sourceId]: data.events ?? [] }));
    } catch { /* ignore */ }
  }

  function handleEventHover(sourceId: number, e: React.MouseEvent) {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      fetchEvents(sourceId);
      setTooltip({ sourceId, type: 'events', x: e.clientX, y: e.clientY });
    }, 300);
  }

  function handleErrorHover(sourceId: number, e: React.MouseEvent) {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setTooltip({ sourceId, type: 'error', x: e.clientX, y: e.clientY });
  }

  function handleMouseLeave() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setTooltip(null);
  }

  return (
    <div className="relative">
      <table className="w-full table-fixed divide-y divide-gray-200">
        <colgroup>
          <col className="w-[15%]" />
          <col className="w-[25%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[8%]" />
          <col className="w-[5%]" />
        </colgroup>
        <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Venue</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source URL</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Scraped</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Events</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Failures</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={row.sourceId} className={row.enabled ? '' : 'opacity-50'}>
              <td className="px-3 py-3 text-sm text-gray-900 truncate" title={row.venueName}>{row.venueName}</td>
              <td className="px-3 py-3 text-sm text-gray-600 truncate" title={row.url}>{row.url}</td>
              <td
                className="px-3 py-3 text-sm whitespace-nowrap"
                onMouseEnter={(e) => row.status === 'failure' && row.lastScrapeError ? handleErrorHover(row.sourceId, e) : undefined}
                onMouseLeave={handleMouseLeave}
              >
                {row.status === 'success' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">success</span>
                )}
                {row.status === 'failure' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 cursor-help">
                    failure {row.lastScrapeError ? '⚠' : ''}
                  </span>
                )}
                {row.status !== 'success' && row.status !== 'failure' && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">pending</span>
                )}
              </td>
              <td className="px-3 py-3 text-sm text-gray-500 whitespace-nowrap">{relativeTime(row.lastScrapedAt)}</td>
              <td
                className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap"
                onMouseEnter={(e) => (row.lastEventCount ?? 0) >= 1 ? handleEventHover(row.sourceId, e) : undefined}
                onMouseLeave={handleMouseLeave}
              >
                <span className={(row.lastEventCount ?? 0) >= 1 ? 'cursor-help underline decoration-dotted' : ''}>
                  {row.lastEventCount ?? '—'}
                </span>
              </td>
              <td className="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">{row.avgConfidence?.toFixed(2) ?? '—'}</td>
              <td className="px-3 py-3 text-sm whitespace-nowrap">
                {row.consecutiveFailures === 0 ? (
                  <span className="text-green-600">0</span>
                ) : (row.consecutiveFailures ?? 0) >= 3 ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{row.consecutiveFailures}</span>
                ) : (
                  <span className="text-amber-600">{row.consecutiveFailures}</span>
                )}
              </td>
              <td className="px-3 py-3 text-sm whitespace-nowrap">
                <button
                  type="button"
                  disabled={scrapingId !== null}
                  onClick={() => scrapeOne(row.sourceId)}
                  className="text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Scrape this source"
                >
                  {scrapingId === row.sourceId ? (
                    <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tooltip popup */}
      {tooltip && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-sm text-sm"
          style={{ left: Math.min(tooltip.x + 10, window.innerWidth - 400), top: Math.min(tooltip.y + 10, window.innerHeight - 300) }}
        >
          {tooltip.type === 'error' && (
            <div>
              <p className="font-medium text-red-700 mb-1">Scrape Error</p>
              <p className="text-gray-600 break-words">
                {rows.find((r) => r.sourceId === tooltip.sourceId)?.lastScrapeError ?? 'Unknown error'}
              </p>
            </div>
          )}
          {tooltip.type === 'events' && (
            <div>
              <p className="font-medium text-gray-900 mb-2">Recent Events</p>
              {!eventCache[tooltip.sourceId] ? (
                <p className="text-gray-400">Loading...</p>
              ) : eventCache[tooltip.sourceId].length === 0 ? (
                <p className="text-gray-400">No events found</p>
              ) : (
                <ul className="space-y-1 max-h-60 overflow-y-auto">
                  {eventCache[tooltip.sourceId].map((evt) => (
                    <li key={evt.eventId} className="text-gray-700">
                      <span className="font-medium">{evt.performer}</span>
                      <span className="text-gray-400 ml-2">
                        {new Date(evt.eventDate).toLocaleDateString('en-CA')}
                        {evt.eventTime ? ` ${evt.eventTime}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
