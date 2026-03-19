import { verifyCronSecret } from '@/lib/cron-auth';
import { runPlacesDiscovery, PLACES_CITIES } from '@/lib/scraper/places-discoverer';
import { db } from '@/lib/db/client';
import { discovery_runs } from '@/lib/db/schema';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const result = await runPlacesDiscovery(PLACES_CITIES.NL);
    await db.insert(discovery_runs).values({
      discovery_method: 'google_places',
      province: 'NL',
      started_at: startedAt,
      completed_at: new Date(),
      candidates_found: result.candidatesFound,
      auto_approved: result.autoApproved,
      queued_pending: result.stagedPending,
      skipped_dedup: result.enriched,
      errors: result.errors,
    });
    return Response.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    try {
      await db.insert(discovery_runs).values({
        discovery_method: 'google_places',
        province: 'NL',
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
    console.error('Places discovery NL failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
