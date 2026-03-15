import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { venueMergeCandidates } from '@/lib/db/schema';
import NavLinks from './_components/NavLinks';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pendingResult = await db
    .select({ count: count() })
    .from(venueMergeCandidates)
    .where(eq(venueMergeCandidates.status, 'pending'));

  const pendingMergeCount = pendingResult[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <span className="text-base font-semibold text-gray-900">
              East Coast Local Admin
            </span>
            <NavLinks pendingMergeCount={pendingMergeCount} />
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 p-6">
        {children}
      </main>
    </div>
  );
}
