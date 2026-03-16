import { runRedditDiscovery, ALL_REDDIT_SUBREDDITS } from '@/lib/scraper/reddit-discoverer';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runRedditDiscovery(ALL_REDDIT_SUBREDDITS);
    return Response.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Reddit discovery failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
