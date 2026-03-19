import { verifyCronSecret } from '@/lib/cron-auth';
import { fetchAllWpEventFeeds } from '@/lib/scraper/wordpress-events';
import { fetchAllDiscordEvents } from '@/lib/scraper/discord-events';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!verifyCronSecret(request.headers.get('authorization'))) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch WordPress/RSS feeds and Discord events concurrently
    const [feedResults, discordResults] = await Promise.all([
      fetchAllWpEventFeeds(),
      fetchAllDiscordEvents(),
    ]);

    const feedTotals = feedResults.reduce(
      (acc, r) => ({
        feeds: acc.feeds + 1,
        eventsFound: acc.eventsFound + r.eventsFound,
        eventsUpserted: acc.eventsUpserted + r.eventsUpserted,
        errors: acc.errors + r.errors,
      }),
      { feeds: 0, eventsFound: 0, eventsUpserted: 0, errors: 0 }
    );

    const discordTotals = discordResults.reduce(
      (acc, r) => ({
        guilds: acc.guilds + 1,
        eventsFound: acc.eventsFound + r.eventsFound,
        eventsUpserted: acc.eventsUpserted + r.eventsUpserted,
        errors: acc.errors + r.errors,
      }),
      { guilds: 0, eventsFound: 0, eventsUpserted: 0, errors: 0 }
    );

    return Response.json({
      success: true,
      feeds: feedTotals.feeds,
      eventsFound: feedTotals.eventsFound + discordTotals.eventsFound,
      eventsUpserted: feedTotals.eventsUpserted + discordTotals.eventsUpserted,
      errors: feedTotals.errors + discordTotals.errors,
      results: feedResults,
      discord: discordResults.length > 0 ? { ...discordTotals, results: discordResults } : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Cron fetch-feeds job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
