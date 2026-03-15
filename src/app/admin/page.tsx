import Link from 'next/link';
import { count, eq, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { venues, scrape_sources, discovered_sources } from '@/lib/db/schema';
import RefreshButton from './_components/RefreshButton';

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

function statusBadge(status: string | null) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        success
      </span>
    );
  }
  if (status === 'failure') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        failure
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
      pending
    </span>
  );
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
  }> = [];
  let loadError = false;

  try {
    const [
      venueResult,
      activeSourceResult,
      pendingDiscoveryResult,
      lastScrapeResult,
      sourceHealthResult,
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
        })
        .from(scrape_sources)
        .innerJoin(venues, eq(scrape_sources.venue_id, venues.id))
        .orderBy(
          sql`CASE WHEN ${scrape_sources.last_scrape_status} = 'failure' THEN 0 WHEN ${scrape_sources.last_scrape_status} = 'pending' THEN 1 ELSE 2 END`
        ),
    ]);

    venueCount = venueResult[0]?.count ?? 0;
    activeSourceCount = activeSourceResult[0]?.count ?? 0;
    pendingDiscoveryCount = pendingDiscoveryResult[0]?.count ?? 0;
    lastScrapeTime = lastScrapeResult[0]?.latest ?? null;
    sourceRows = sourceHealthResult;
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

  const nowStr = new Date().toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div>
      {/* Page heading */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <span className="text-xs text-gray-400">Data as of {nowStr}</span>
        <RefreshButton />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Venues */}
        <Link href="/admin/venues" className="block">
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500">Total Venues</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{venueCount}</p>
          </div>
        </Link>

        {/* Active Sources */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <p className="text-sm text-gray-500">Active Sources</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{activeSourceCount}</p>
        </div>

        {/* Pending Discoveries */}
        <Link href="/admin/discovery" className="block">
          <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
            <p className="text-sm text-gray-500">Pending Discoveries</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{pendingDiscoveryCount}</p>
          </div>
        </Link>

        {/* Last Scrape */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <p className="text-sm text-gray-500">Last Scrape</p>
          <p
            className={`text-3xl font-bold mt-1 ${
              isStale(lastScrapeTime) ? 'text-amber-600' : 'text-gray-900'
            }`}
          >
            {relativeTime(lastScrapeTime)}
          </p>
        </div>
      </div>

      {/* Source Health table */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Source Health</h2>
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {sourceRows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No scrape sources configured
          </div>
        ) : (
          <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Venue
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source URL
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Scraped
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sourceRows.map((row) => (
                <tr
                  key={row.sourceId}
                  className={row.enabled ? '' : 'opacity-50'}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {row.venueName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <span
                      className="block max-w-xs truncate"
                      title={row.url}
                    >
                      {row.url}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {statusBadge(row.status)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {relativeTime(row.lastScrapedAt)}
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
