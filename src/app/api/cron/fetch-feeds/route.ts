import { fetchAllWpEventFeeds } from '@/lib/scraper/wordpress-events';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedToken) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await fetchAllWpEventFeeds();
    const totals = results.reduce(
      (acc, r) => ({
        feeds: acc.feeds + 1,
        eventsFound: acc.eventsFound + r.eventsFound,
        eventsUpserted: acc.eventsUpserted + r.eventsUpserted,
        errors: acc.errors + r.errors,
      }),
      { feeds: 0, eventsFound: 0, eventsUpserted: 0, errors: 0 }
    );
    return Response.json({ success: true, ...totals, results, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Cron fetch-feeds job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
