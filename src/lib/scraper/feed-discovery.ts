import * as cheerio from 'cheerio';
import { gotScraping } from 'got-scraping';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

// ─── Feed auto-discovery ─────────────────────────────────────────────────

interface DiscoveredFeed {
  url: string;
  type: 'rss' | 'atom' | 'ical';
  title?: string;
}

/**
 * Scan HTML <head> for <link rel="alternate"> tags pointing to RSS/Atom/iCal feeds.
 */
export function discoverFeedsFromHtml(html: string, baseUrl: string): DiscoveredFeed[] {
  const $ = cheerio.load(html);
  const feeds: DiscoveredFeed[] = [];

  $('link[rel="alternate"]').each((_, el) => {
    const type = $(el).attr('type') ?? '';
    const href = $(el).attr('href');
    if (!href) return;

    let feedType: DiscoveredFeed['type'] | null = null;
    if (type.includes('rss') || type.includes('xml')) feedType = 'rss';
    else if (type.includes('atom')) feedType = 'atom';
    else if (type.includes('calendar') || type.includes('ics')) feedType = 'ical';

    if (feedType) {
      try {
        feeds.push({
          url: new URL(href, baseUrl).toString(),
          type: feedType,
          title: $(el).attr('title') ?? undefined,
        });
      } catch { /* invalid URL, skip */ }
    }
  });

  return feeds;
}

// ─── Common feed URL patterns to probe ───────────────────────────────────

const FEED_PATH_PATTERNS = [
  '/feed',
  '/feed/',
  '/events/feed',
  '/events/feed/',
  '/rss',
  '/rss.xml',
  '/events.ics',
  '/calendar.ics',
  '/events/calendar.ics',
  '/feed.xml',
  '/atom.xml',
  '/.ics',
  '/wp-json/tribe/events/v1/events',
];

/**
 * Probe common feed URL patterns for a given site.
 * Returns the first feed that responds with valid content.
 */
export async function probeFeedUrls(siteUrl: string): Promise<{ url: string; body: string; type: 'rss' | 'atom' | 'ical' } | null> {
  const base = new URL(siteUrl);
  const origin = base.origin;

  for (const path of FEED_PATH_PATTERNS) {
    const feedUrl = origin + path;
    try {
      const resp = await gotScraping({
        url: feedUrl,
        timeout: { request: 8_000 },
        headerGeneratorOptions: {
          browsers: ['chrome'],
          operatingSystems: ['macos'],
          locales: ['en-US'],
        },
      });

      if (resp.statusCode !== 200 || resp.body.length < 100) continue;

      const body = resp.body;
      const type = detectFeedType(body);
      if (type) {
        console.log(`  ↻ Discovered feed at ${feedUrl} (${type})`);
        return { url: feedUrl, body, type };
      }
    } catch {
      // Connection refused, timeout, etc. — skip
    }
  }

  return null;
}

/**
 * Fetch a discovered feed URL and return its body + type.
 */
export async function fetchFeedUrl(url: string): Promise<{ body: string; type: 'rss' | 'atom' | 'ical' } | null> {
  try {
    const resp = await gotScraping({
      url,
      timeout: { request: 10_000 },
      headerGeneratorOptions: {
        browsers: ['chrome'],
        operatingSystems: ['macos'],
        locales: ['en-US'],
      },
    });

    if (resp.statusCode !== 200 || resp.body.length < 100) return null;

    const type = detectFeedType(resp.body);
    if (!type) return null;

    return { body: resp.body, type };
  } catch {
    return null;
  }
}

function detectFeedType(body: string): 'rss' | 'atom' | 'ical' | null {
  const head = body.slice(0, 500);
  if (head.includes('BEGIN:VCALENDAR')) return 'ical';
  if (head.includes('<rss') || head.includes('<channel>')) return 'rss';
  if (head.includes('<feed') && head.includes('xmlns="http://www.w3.org/2005/Atom"')) return 'atom';
  // Some RSS feeds start with <?xml then <rss
  if (head.includes('<?xml') && body.slice(0, 1000).includes('<rss')) return 'rss';
  if (head.includes('<?xml') && body.slice(0, 1000).includes('<feed')) return 'atom';
  return null;
}

// ─── Feed parsers ────────────────────────────────────────────────────────

/**
 * Parse an RSS feed body into ExtractedEvents.
 */
export function parseRssFeed(xml: string): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const now = new Date();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const item of items) {
    const title = extractTag(item, 'title');
    const description = extractTag(item, 'description');
    const pubDate = extractTag(item, 'pubDate');
    const link = extractTag(item, 'link');

    // Try dc:date or other date fields if pubDate missing
    const dateStr = pubDate ?? extractTag(item, 'dc:date');
    if (!title || !dateStr) continue;

    const date = new Date(dateStr);
    if (isNaN(date.getTime()) || date < now) continue;

    events.push({
      performer: stripHtml(title),
      event_date: date.toISOString().slice(0, 10),
      event_time: date.toISOString().slice(11, 16) !== '00:00' ? date.toISOString().slice(11, 16) : null,
      price: null,
      ticket_link: link ?? null,
      description: stripHtml(description ?? '').slice(0, 500) || null,
      cover_image_url: null,
      confidence: 0.85,
      event_category: guessCategoryFromText(title + ' ' + (description ?? '')),
    });
  }

  return events;
}

/**
 * Parse an Atom feed body into ExtractedEvents.
 */
export function parseAtomFeed(xml: string): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const now = new Date();
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

  for (const entry of entries) {
    const title = extractTag(entry, 'title');
    const summary = extractTag(entry, 'summary') ?? extractTag(entry, 'content');
    const updated = extractTag(entry, 'updated') ?? extractTag(entry, 'published');

    // Extract link href
    const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/);
    const link = linkMatch ? linkMatch[1] : null;

    if (!title || !updated) continue;

    const date = new Date(updated);
    if (isNaN(date.getTime()) || date < now) continue;

    events.push({
      performer: stripHtml(title),
      event_date: date.toISOString().slice(0, 10),
      event_time: date.toISOString().slice(11, 16) !== '00:00' ? date.toISOString().slice(11, 16) : null,
      price: null,
      ticket_link: link,
      description: stripHtml(summary ?? '').slice(0, 500) || null,
      cover_image_url: null,
      confidence: 0.85,
      event_category: guessCategoryFromText(title + ' ' + (summary ?? '')),
    });
  }

  return events;
}

/**
 * Parse an iCal (.ics) feed body into ExtractedEvents.
 */
export function parseIcalFeed(ics: string): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const now = new Date();

  // Split into VEVENT blocks
  const vevents = ics.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

  for (const vevent of vevents) {
    const summary = icalProp(vevent, 'SUMMARY');
    const dtstart = icalProp(vevent, 'DTSTART');
    const description = icalProp(vevent, 'DESCRIPTION');
    const url = icalProp(vevent, 'URL');
    const location = icalProp(vevent, 'LOCATION');

    if (!summary || !dtstart) continue;

    const date = parseIcalDate(dtstart);
    if (!date || date < now) continue;

    events.push({
      performer: unescapeIcal(summary),
      event_date: date.toISOString().slice(0, 10),
      event_time: date.toISOString().slice(11, 16) !== '00:00' ? date.toISOString().slice(11, 16) : null,
      price: null,
      ticket_link: url ?? null,
      description: unescapeIcal(description ?? '').slice(0, 500) || null,
      cover_image_url: null,
      confidence: 0.9,
      event_category: guessCategoryFromText(summary + ' ' + (description ?? '') + ' ' + (location ?? '')),
    });
  }

  return events;
}

// ─── Unified feed parser ─────────────────────────────────────────────────

export function parseFeed(body: string, type: 'rss' | 'atom' | 'ical'): ExtractedEvent[] {
  switch (type) {
    case 'rss': return parseRssFeed(body);
    case 'atom': return parseAtomFeed(body);
    case 'ical': return parseIcalFeed(body);
  }
}

/**
 * Try to get events from a bot-blocked site by discovering and parsing feeds.
 * Attempts: 1) probe common feed URLs, 2) return parsed events.
 */
export async function tryFeedFallback(siteUrl: string): Promise<ExtractedEvent[]> {
  const feed = await probeFeedUrls(siteUrl);
  if (!feed) return [];

  const events = parseFeed(feed.body, feed.type);
  console.log(`  ↻ Feed fallback: ${events.length} events from ${feed.url} (${feed.type})`);
  return events;
}

/**
 * Try feeds discovered from HTML <link> tags.
 */
export async function tryDiscoveredFeeds(html: string, baseUrl: string): Promise<ExtractedEvent[]> {
  const discovered = discoverFeedsFromHtml(html, baseUrl);
  if (discovered.length === 0) return [];

  for (const feed of discovered) {
    const result = await fetchFeedUrl(feed.url);
    if (result) {
      const events = parseFeed(result.body, result.type);
      if (events.length > 0) {
        console.log(`  ↻ Discovered feed: ${events.length} events from ${feed.url} (${result.type})`);
        return events;
      }
    }
  }

  return [];
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function icalProp(vevent: string, prop: string): string | null {
  // iCal properties can have parameters: DTSTART;TZID=America/Halifax:20260415T190000
  // Also handles folded lines (continuation with space/tab)
  const regex = new RegExp(`^${prop}[;:](.*)`, 'm');
  const match = vevent.match(regex);
  if (!match) return null;

  let value = match[1];
  // Strip parameters before the value (e.g., TZID=...)
  if (prop !== 'DESCRIPTION' && prop !== 'SUMMARY' && prop !== 'LOCATION') {
    const colonIdx = value.indexOf(':');
    if (colonIdx !== -1 && !value.startsWith('http')) {
      value = value.slice(colonIdx + 1);
    }
  }

  return value.trim() || null;
}

function parseIcalDate(dtstart: string): Date | null {
  // Formats: 20260415T190000Z, 20260415T190000, 20260415
  const clean = dtstart.replace(/[^0-9TZ]/g, '');

  if (clean.length >= 15) {
    // Full datetime: 20260415T190000
    const iso = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}`;
    const date = new Date(clean.endsWith('Z') ? iso + 'Z' : iso);
    return isNaN(date.getTime()) ? null : date;
  } else if (clean.length >= 8) {
    // Date only: 20260415
    const iso = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
    const date = new Date(iso);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function unescapeIcal(text: string): string {
  return text
    .replace(/\\n/g, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function guessCategoryFromText(text: string): ExtractedEvent['event_category'] {
  const lower = text.toLowerCase();
  if (lower.includes('concert') || lower.includes('music') || lower.includes('band')) return 'live_music';
  if (lower.includes('comedy') || lower.includes('standup') || lower.includes('improv')) return 'comedy';
  if (lower.includes('theatre') || lower.includes('theater') || lower.includes('play') || lower.includes('musical')) return 'theatre';
  if (lower.includes('art') || lower.includes('gallery') || lower.includes('exhibit')) return 'arts';
  if (lower.includes('sport') || lower.includes('game') || lower.includes('match')) return 'sports';
  if (lower.includes('festival') || lower.includes('fest')) return 'festival';
  if (lower.includes('market') || lower.includes('community') || lower.includes('workshop')) return 'community';
  return 'other';
}
