import { verifyCronSecret } from '@/lib/cron-auth';
import { runDiscoveryJob } from '@/lib/scraper/discovery-orchestrator';
import { db } from '@/lib/db/client';
import { discovery_runs } from '@/lib/db/schema';

// Max function duration in seconds (Hobby plan limit; Pro allows 300)
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const result = await runDiscoveryJob();
    await db.insert(discovery_runs).values({
      discovery_method: 'gemini_google_search',
      province: null,
      started_at: startedAt,
      completed_at: new Date(),
      candidates_found: result.candidatesFound,
      auto_approved: result.autoApproved,
      queued_pending: result.queuedPending,
      skipped_dedup: 0,
      errors: result.errors,
    });
    return Response.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    try {
      await db.insert(discovery_runs).values({
        discovery_method: 'gemini_google_search',
        province: null,
        started_at: startedAt,
        completed_at: new Date(),
        candidates_found: 0,
        auto_approved: 0,
        queued_pending: 0,
        skipped_dedup: 0,
        errors: 1,
        error_detail: String(err),
      });
    } catch (insertErr) {
      console.error('Failed to log discovery run error:', insertErr);
    }
    console.error('Cron discover job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
