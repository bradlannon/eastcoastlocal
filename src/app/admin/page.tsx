import Link from 'next/link';
import { count, desc, eq, gte, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { venues, scrape_sources, discovered_sources, discovery_runs, events } from '@/lib/db/schema';
import RefreshButton from './_components/RefreshButton';
import TriggerActions from './_components/TriggerActions';
import SourceHealthTable from './_components/SourceHealthTable';

export const dynamic = 'force-dynamic';

function relativeTime(date: Date | null): string {
  if (!date) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

function isStale(date: Date | null): boolean {
  if (!date) return true;
  return Date.now() - date.getTime() > 24 * 60 * 60 * 1000;
}

function formatMethodName(method: string): string {
  const names: Record<string, string> = {
    google_places: 'Google Places',
    gemini_google_search: 'Gemini Search',
    reddit_gemini: 'Reddit',
  };
  return names[method] ?? method;
}

export default async function AdminDashboardPage() {
  let venueCount = 0;
  let activeSourceCount = 0;
  let pendingDiscoveryCount = 0;
  let lastScrapeTime: Date | null = null;
  let sourceRows: Array<{
    sourceId: number;
    url: string;
    status: string | null;
    lastScrapedAt: Date | null;
    enabled: boolean;
    venueName: string;
    lastEventCount: number | null;
    avgConfidence: number | null;
    consecutiveFailures: number | null;
    lastScrapeError: string | null;
  }> = [];
  let activeEventCount = 0;
  let lastDiscoveryRun: { completedAt: Date; errors: number } | null = null;
  let recentRuns: Array<{
    id: number;
    discoveryMethod: string;
    province: string | null;
    candidatesFound: number;
    autoApproved: number;
    queuedPending: number;
    errors: number;
    completedAt: Date;
  }> = [];
  let loadError = false;

  try {
    const [
      venueResult,
      activeSourceResult,
      pendingDiscoveryResult,
      lastScrapeResult,
      sourceHealthResult,
      lastDiscoveryResult,
      recentRunsResult,
      activeEventResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(venues),
      db
        .select({ count: count() })
        .from(scrape_sources)
        .where(eq(scrape_sources.enabled, true)),
      db
        .select({ count: count() })
        .from(discovered_sources)
        .where(eq(discovered_sources.status, 'pending')),
      db
        .select({ latest: max(scrape_sources.last_scraped_at) })
        .from(scrape_sources),
      db
        .select({
          sourceId: scrape_sources.id,
          url: scrape_sources.url,
          status: scrape_sources.last_scrape_status,
          lastScrapedAt: scrape_sources.last_scraped_at,
          enabled: scrape_sources.enabled,
          venueName: venues.name,
          lastEventCount: scrape_sources.last_event_count,
          avgConfidence: scrape_sources.avg_confidence,
          consecutiveFailures: scrape_sources.consecutive_failures,
          lastScrapeError: scrape_sources.last_scrape_error,
        })
        .from(scrape_sources)
        .innerJoin(venues, eq(scrape_sources.venue_id, venues.id))
        .orderBy(
          sql`CASE WHEN ${scrape_sources.last_scrape_status} = 'failure' THEN 0 WHEN ${scrape_sources.consecutive_failures} >= 3 THEN 1 WHEN ${scrape_sources.last_scrape_status} = 'pending' THEN 2 ELSE 3 END`
        ),
      db
        .select({
          completedAt: discovery_runs.completed_at,
          errors: discovery_runs.errors,
        })
        .from(discovery_runs)
        .orderBy(desc(discovery_runs.completed_at))
        .limit(1),
      db
        .select({
          id: discovery_runs.id,
          discoveryMethod: discovery_runs.discovery_method,
          province: discovery_runs.province,
          candidatesFound: discovery_runs.candidates_found,
          autoApproved: discovery_runs.auto_approved,
          queuedPending: discovery_runs.queued_pending,
          errors: discovery_runs.errors,
          completedAt: discovery_runs.completed_at,
        })
        .from(discovery_runs)
        .orderBy(desc(discovery_runs.completed_at))
        .limit(10),
      db
        .select({ count: count() })
        .from(events)
        .where(gte(events.event_date, sql`CURRENT_DATE`)),
    ]);

    venueCount = venueResult[0]?.count ?? 0;
    activeSourceCount = activeSourceResult[0]?.count ?? 0;
    pendingDiscoveryCount = pendingDiscoveryResult[0]?.count ?? 0;
    lastScrapeTime = lastScrapeResult[0]?.latest ?? null;
    sourceRows = sourceHealthResult;
    lastDiscoveryRun = lastDiscoveryResult[0] ?? null;
    recentRuns = recentRunsResult;
    activeEventCount = activeEventResult[0]?.count ?? 0;
  } catch {
    loadError = true;
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-red-700">
        Failed to load dashboard data. Check your database connection.
      </div>
    );
  }

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Halifax',
    hour12: false,
  });
  const nowStr = `${formatter.format(now)} AT`;

  return (
    <div>
      {/* Page heading */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <span className="text-xs text-gray-400">Data as of {nowStr}</span>
        <RefreshButton />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Total Venues */}
        <Link href="/admin/venues" className="block">
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500">Total Venues</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{venueCount}</p>
          </div>
        </Link>

        {/* Active Sources */}
        <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
          <p className="text-sm text-gray-500">Active Sources</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{activeSourceCount}</p>
        </div>

        {/* Active Events */}
        <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
          <p className="text-sm text-gray-500">Active Events</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{activeEventCount}</p>
        </div>

        {/* Pending Discoveries */}
        <Link href="/admin/discovery" className="block">
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500">Pending Discoveries</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{pendingDiscoveryCount}</p>
          </div>
        </Link>

        {/* Last Scrape & Discovery */}
        <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
          <div className="mb-3">
            <p className="text-sm text-gray-500">Last Scrape</p>
            <p
              className={`text-lg font-bold mt-1 ${
                isStale(lastScrapeTime) ? 'text-amber-600' : 'text-gray-900'
              }`}
            >
              {relativeTime(lastScrapeTime)}
            </p>
          </div>
          <div className="border-t pt-3">
            <p className="text-sm text-gray-500">Last Discovery</p>
            <p
              className={`text-lg font-bold mt-1 ${
                lastDiscoveryRun && lastDiscoveryRun.errors > 0
                  ? 'text-red-600'
                  : isStale(lastDiscoveryRun?.completedAt ?? null)
                  ? 'text-amber-600'
                  : 'text-gray-900'
              }`}
            >
              {relativeTime(lastDiscoveryRun?.completedAt ?? null)}
            </p>
          </div>
        </div>
      </div>

      {/* Manual trigger actions */}
      <TriggerActions />

      {/* Source Health table */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Source Health</h2>
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden max-h-96 overflow-y-auto">
        {sourceRows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No scrape sources configured
          </div>
        ) : (
          <SourceHealthTable
            rows={sourceRows.map((row) => ({
              sourceId: row.sourceId,
              url: row.url,
              status: row.status,
              lastScrapedAt: row.lastScrapedAt?.toISOString() ?? null,
              enabled: row.enabled,
              venueName: row.venueName,
              lastEventCount: row.lastEventCount,
              avgConfidence: row.avgConfidence,
              consecutiveFailures: row.consecutiveFailures,
              lastScrapeError: row.lastScrapeError ?? null,
            }))}
          />
        )}
      </div>

      {/* Recent Discovery Runs table */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3 mt-8">Recent Discovery Runs</h2>
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {recentRuns.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No discovery runs recorded yet</div>
        ) : (
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Province
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Found
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Approved
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Errors
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  When
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentRuns.map((run) => (
                <tr key={run.id} className={run.errors > 0 ? 'bg-red-50' : ''}>
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {formatMethodName(run.discoveryMethod)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {run.province ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {run.candidatesFound}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {run.autoApproved}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {run.queuedPending}
                  </td>
                  <td className={`px-4 py-3 text-sm whitespace-nowrap ${run.errors > 0 ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                    {run.errors}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {relativeTime(run.completedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
