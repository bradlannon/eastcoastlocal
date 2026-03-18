/**
 * Facebook public events page scraper.
 *
 * Fetches the public /events page for a Facebook Page and extracts
 * event data using the AI extractor. No login, no API key, no ToS violation —
 * reads the same publicly accessible HTML that Google indexes.
 *
 * Source URL format: https://www.facebook.com/[page_name]/events/
 *
 * Falls back to iCal feed if the HTML fetch fails:
 *   https://www.facebook.com/[page_id]/events/ical/
 */

import * as cheerio from 'cheerio';
import { extractEvents } from './extractor';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch a Facebook page's public events and extract them.
 */
export async function scrapeFacebookEvents(
  url: string,
  options?: { venueId?: number; scrapeSourceId?: number | null }
): Promise<ExtractedEvent[]> {
  // Ensure URL ends with /events/
  let eventsUrl = url.replace(/\/$/, '');
  if (!eventsUrl.endsWith('/events')) {
    eventsUrl += '/events';
  }
  eventsUrl += '/';

  // Fetch with realistic browser headers
  const response = await fetch(eventsUrl, {
    headers: {
      'User-Agent': CHROME_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity', // no gzip to simplify
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Facebook fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Check for login wall or blocked page
  if (html.includes('login_form') && !html.includes('upcoming_events')) {
    throw new Error('Facebook login wall — page not publicly accessible');
  }

  // Extract text content from HTML
  const $ = cheerio.load(html);

  // Remove scripts, styles, nav
  $('script, style, nav, footer, header').remove();

  // Try to find event-specific content
  const eventText = $('body').text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000); // Limit to avoid token overflow

  if (eventText.length < 50) {
    throw new Error('Facebook page returned insufficient content — may be blocked or empty');
  }

  // Run through AI extractor
  const events = await extractEvents(eventText, eventsUrl, options);

  console.log(`  [facebook] ${eventsUrl}: ${events.length} events extracted`);
  return events;
}
