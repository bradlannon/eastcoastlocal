import { desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { community_submissions } from '@/lib/db/schema';
import SubmissionsList from './_components/SubmissionsList';

export default async function SubmissionsPage() {
  const submissions = await db
    .select()
    .from(community_submissions)
    .orderBy(desc(community_submissions.created_at))
    .limit(100);

  const pendingCount = submissions.filter((s) => s.status === 'pending').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Community Submissions
          {pendingCount > 0 && (
            <span className="ml-2 text-sm font-medium bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </h1>
      </div>
      <SubmissionsList submissions={submissions} />
    </div>
  );
}
