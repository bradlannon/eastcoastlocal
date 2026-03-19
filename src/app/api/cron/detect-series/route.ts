import { verifyCronSecret } from '@/lib/cron-auth';
import { detectAndTagSeries } from '@/lib/series-detector';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await detectAndTagSeries();
    return Response.json({
      success: true,
      seriesUpserted: result.seriesUpserted,
      eventsTagged: result.eventsTagged,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[detect-series-cron] Series detection job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
