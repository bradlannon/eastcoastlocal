import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { discovered_sources } from '@/lib/db/schema';
import DiscoveryList from './_components/DiscoveryList';

export const dynamic = 'force-dynamic';

type Status = 'pending' | 'approved' | 'rejected' | 'no_website';

const VALID_STATUSES: Status[] = ['pending', 'approved', 'rejected', 'no_website'];

function isValidStatus(s: string): s is Status {
  return VALID_STATUSES.includes(s as Status);
}

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const rawStatus = params.status ?? 'pending';
  const status: Status = isValidStatus(rawStatus) ? rawStatus : 'pending';

  const [candidates, pendingResult, approvedResult, rejectedResult, noWebsiteResult] =
    await Promise.all([
      db
        .select()
        .from(discovered_sources)
        .where(eq(discovered_sources.status, status))
        .orderBy(desc(discovered_sources.discovered_at)),
      db
        .select({ count: count() })
        .from(discovered_sources)
        .where(eq(discovered_sources.status, 'pending')),
      db
        .select({ count: count() })
        .from(discovered_sources)
        .where(eq(discovered_sources.status, 'approved')),
      db
        .select({ count: count() })
        .from(discovered_sources)
        .where(eq(discovered_sources.status, 'rejected')),
      db
        .select({ count: count() })
        .from(discovered_sources)
        .where(eq(discovered_sources.status, 'no_website')),
    ]);

  const counts = {
    pending: pendingResult[0]?.count ?? 0,
    approved: approvedResult[0]?.count ?? 0,
    rejected: rejectedResult[0]?.count ?? 0,
    no_website: noWebsiteResult[0]?.count ?? 0,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Discovery Review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review discovered source candidates before adding them to the scraper.
        </p>
      </div>

      <DiscoveryList
        candidates={candidates}
        counts={counts}
        activeStatus={status}
      />
    </div>
  );
}
