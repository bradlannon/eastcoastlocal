import { runScrapeJob } from '@/lib/scraper/orchestrator';

// Max function duration in seconds (Hobby plan limit; Pro allows 300)
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedToken) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runScrapeJob();
    return Response.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Cron scrape job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
