import { findOrCreateVenue } from './ticketmaster';
import { upsertEvent } from './normalizer';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

// ─── WordPress Events Calendar (Tribe) REST API types ─────────────────────

interface TribeVenue {
  venue: string;
  address: string;
  city: string;
  province: string;
  country: string;
  zip: string;
}

interface TribeCategory {
  name: string;
  slug: string;
}

interface TribeEvent {
  id: number;
  url: string;
  title: string;
  description: string;
  start_date: string; // "2026-04-01 19:00:00"
  end_date: string;
  cost: string;
  website: string;
  venue: TribeVenue;
  categories: TribeCategory[];
  image: { url: string } | false;
}

interface TribeResponse {
  events: TribeEvent[];
  total: number;
  total_pages: number;
}

// ─── WordPress REST API (custom post type) types ──────────────────────────

interface WpEventPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  acf?: Record<string, string>;
  meta?: Record<string, string>;
  // Theatre NS specific fields
  event_location?: string;
  production_start_date?: string;
  production_end_date?: string;
  ticket_link?: string;
}

// ─── Feed registry ────────────────────────────────────────────────────────

export interface WpEventFeed {
  id: string;
  name: string;
  url: string;
  type: 'tribe' | 'wp-event' | 'drupal-json' | 'livewhale';
  province: string; // Default province when venue data is missing
  defaultCity?: string;
}

export const WP_EVENT_FEEDS: WpEventFeed[] = [
  {
    id: 'tourism-ns',
    name: 'Tourism Nova Scotia',
    url: 'https://novascotia.com/wp-json/tribe/events/v1/events',
    type: 'tribe',
    province: 'NS',
  },
  {
    id: 'halifax-events',
    name: 'Halifax Events',
    url: 'https://halifaxevents.ca/wp-json/tribe/events/v1/events',
    type: 'tribe',
    province: 'NS',
    defaultCity: 'Halifax',
  },
  {
    id: 'destination-stj',
    name: "Destination St. John's",
    url: 'https://destinationstjohns.com/wp-json/tribe/events/v1/events',
    type: 'tribe',
    province: 'NL',
    defaultCity: "St. John's",
  },
  {
    id: 'theatre-ns',
    name: 'Theatre Nova Scotia',
    url: 'https://theatrens.ca/wp-json/wp/v2/event?per_page=100',
    type: 'wp-event',
    province: 'NS',
  },
  {
    id: 'dalhousie',
    name: 'Dalhousie University',
    url: 'https://events.dal.ca/live/json/events',
    type: 'livewhale',
    province: 'NS',
    defaultCity: 'Halifax',
  },
  {
    id: 'tourism-pei',
    name: 'Tourism PEI',
    url: 'https://www.tourismpei.com/events-json',
    type: 'drupal-json',
    province: 'PEI',
  },
];

// ─── Province code normalization ──────────────────────────────────────────

const PROVINCE_ALIASES: Record<string, string> = {
  'Nova Scotia': 'NS',
  'New Brunswick': 'NB',
  'Prince Edward Island': 'PEI',
  'Newfoundland and Labrador': 'NL',
  'Newfoundland': 'NL',
  'Labrador': 'NL',
  NS: 'NS',
  NB: 'NB',
  PE: 'PEI',
  PEI: 'PEI',
  NL: 'NL',
};

function normalizeProvince(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  return PROVINCE_ALIASES[raw.trim()] ?? fallback;
}

// ─── Category mapping ─────────────────────────────────────────────────────

function mapCategory(categories: TribeCategory[]): ExtractedEvent['event_category'] {
  const slugs = categories.map((c) => c.slug.toLowerCase());
  const names = categories.map((c) => c.name.toLowerCase());
  const all = [...slugs, ...names].join(' ');

  if (all.includes('music') || all.includes('concert')) return 'live_music';
  if (all.includes('comedy') || all.includes('standup')) return 'comedy';
  if (all.includes('theatre') || all.includes('theater') || all.includes('drama')) return 'theatre';
  if (all.includes('art') || all.includes('gallery') || all.includes('exhibit')) return 'arts';
  if (all.includes('sport') || all.includes('hockey') || all.includes('soccer')) return 'sports';
  if (all.includes('festival')) return 'festival';
  if (all.includes('community') || all.includes('family') || all.includes('market')) return 'community';
  return 'other';
}

// ─── Feed fetchers ────────────────────────────────────────────────────────

export interface FeedResult {
  feedId: string;
  feedName: string;
  eventsFound: number;
  eventsUpserted: number;
  errors: number;
}

async function fetchTribeFeed(feed: WpEventFeed): Promise<FeedResult> {
  const result: FeedResult = { feedId: feed.id, feedName: feed.name, eventsFound: 0, eventsUpserted: 0, errors: 0 };
  const now = new Date();

  // Paginate through all events
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const separator = feed.url.includes('?') ? '&' : '?';
    const url = `${feed.url}${separator}page=${page}&per_page=50&start_date=${now.toISOString().slice(0, 10)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'EastCoastLocal/1.0 (events aggregator)' },
    });

    if (!response.ok) {
      if (page === 1) throw new Error(`${feed.name}: HTTP ${response.status}`);
      break; // End of pages
    }

    const data = (await response.json()) as TribeResponse;
    totalPages = data.total_pages;
    result.eventsFound += data.events.length;

    for (const event of data.events) {
      try {
        const venueName = event.venue?.venue;
        if (!venueName) continue;

        const city = event.venue.city || feed.defaultCity || '';
        const province = normalizeProvince(event.venue.province, feed.province);
        const address = event.venue.address || `${city}, ${province}`;

        const venueId = await findOrCreateVenue(venueName, city, province, address);

        const eventDate = event.start_date.slice(0, 10);
        const eventTime = event.start_date.slice(11, 16);
        if (new Date(eventDate) < now) continue;

        const extracted: ExtractedEvent = {
          performer: stripHtml(event.title),
          event_date: eventDate,
          event_time: eventTime !== '00:00' ? eventTime : null,
          price: event.cost || null,
          ticket_link: event.website || event.url,
          description: stripHtml(event.description).slice(0, 500) || null,
          cover_image_url: event.image ? event.image.url : null,
          confidence: 1.0,
          event_category: mapCategory(event.categories ?? []),
        };

        await upsertEvent(venueId, extracted, event.url, null, 'scrape');
        result.eventsUpserted++;
      } catch (err) {
        console.error(`  [${feed.id}] Event ${event.id} error:`, err instanceof Error ? err.message : err);
        result.errors++;
      }
    }

    page++;
  }

  return result;
}

async function fetchLiveWhaleFeed(feed: WpEventFeed): Promise<FeedResult> {
  const result: FeedResult = { feedId: feed.id, feedName: feed.name, eventsFound: 0, eventsUpserted: 0, errors: 0 };
  const now = new Date();

  const response = await fetch(feed.url, {
    headers: { 'User-Agent': 'EastCoastLocal/1.0 (events aggregator)' },
  });

  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);

  const events = (await response.json()) as Array<{
    id: number;
    title: string;
    description?: string;
    date_utc?: string;
    date2_utc?: string;
    date_iso?: string;
    date2_iso?: string;
    location?: string;
    location_title?: string;
    cost?: string;
    url?: string;
    thumbnail?: string;
    event_types?: string[];
  }>;

  result.eventsFound = events.length;

  for (const event of events) {
    try {
      const dateStr = event.date_utc ?? event.date_iso;
      if (!dateStr) continue;

      const eventDate = dateStr.slice(0, 10);
      const eventTime = dateStr.includes('T') ? dateStr.slice(11, 16) : dateStr.slice(11, 16);
      if (new Date(eventDate) < now) continue;

      const locationStr = event.location ?? '';
      const locationTitle = event.location_title ?? '';
      // Use location_title if available, otherwise first part before comma
      const venueName = locationTitle || locationStr.split(',')[0].trim() || feed.name;
      const city = feed.defaultCity || '';

      const venueId = await findOrCreateVenue(venueName, city, feed.province, locationStr || city);

      const extracted: ExtractedEvent = {
        performer: stripHtml(event.title),
        event_date: eventDate,
        event_time: eventTime !== '00:00' ? eventTime : null,
        price: event.cost || null,
        ticket_link: event.url || null,
        description: stripHtml(event.description ?? '').slice(0, 500) || null,
        cover_image_url: event.thumbnail || null,
        confidence: 1.0,
        event_category: guessCategory(event.title, event.event_types ?? []),
      };

      await upsertEvent(venueId, extracted, event.url ?? feed.url, null, 'scrape');
      result.eventsUpserted++;
    } catch (err) {
      console.error(`  [${feed.id}] Event ${event.id} error:`, err instanceof Error ? err.message : err);
      result.errors++;
    }
  }

  return result;
}

async function fetchDrupalJsonFeed(feed: WpEventFeed): Promise<FeedResult> {
  const result: FeedResult = { feedId: feed.id, feedName: feed.name, eventsFound: 0, eventsUpserted: 0, errors: 0 };
  const now = new Date();

  const response = await fetch(feed.url, {
    headers: { 'User-Agent': 'EastCoastLocal/1.0 (events aggregator)' },
  });

  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);

  const events = (await response.json()) as Array<{
    nid?: string;
    title?: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    address?: string;
    city?: string;
    region?: string;
    lat?: string;
    lng?: string;
    website?: string;
    media?: string;
    categories?: string;
  }>;

  result.eventsFound = events.length;

  for (const event of events) {
    try {
      if (!event.title || !event.start_date) continue;

      const eventDate = event.start_date.slice(0, 10);
      if (new Date(eventDate) < now) continue;
      const eventTime = event.start_date.length > 10 ? event.start_date.slice(11, 16) : null;

      const city = event.city || feed.defaultCity || '';
      const province = normalizeProvince(event.region, feed.province);
      const venueName = event.title; // Drupal events often don't separate venue from event title
      const address = event.address || `${city}, ${province}`;

      const venueId = await findOrCreateVenue(venueName, city, province, address);

      const extracted: ExtractedEvent = {
        performer: stripHtml(event.title),
        event_date: eventDate,
        event_time: eventTime !== '00:00' ? eventTime : null,
        price: null,
        ticket_link: event.website || null,
        description: stripHtml(event.description ?? '').slice(0, 500) || null,
        cover_image_url: event.media || null,
        confidence: 0.9,
        event_category: guessCategoryFromString(event.categories ?? ''),
      };

      await upsertEvent(venueId, extracted, event.website ?? feed.url, null, 'scrape');
      result.eventsUpserted++;
    } catch (err) {
      console.error(`  [${feed.id}] Event error:`, err instanceof Error ? err.message : err);
      result.errors++;
    }
  }

  return result;
}

async function fetchWpEventFeed(feed: WpEventFeed): Promise<FeedResult> {
  const result: FeedResult = { feedId: feed.id, feedName: feed.name, eventsFound: 0, eventsUpserted: 0, errors: 0 };
  const now = new Date();

  const response = await fetch(feed.url, {
    headers: { 'User-Agent': 'EastCoastLocal/1.0 (events aggregator)' },
  });

  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);

  const posts = (await response.json()) as WpEventPost[];
  result.eventsFound = posts.length;

  for (const post of posts) {
    try {
      // Check ACF fields first (Theatre NS pattern), then top-level, then meta
      const rawDate = post.acf?.production_start_date
        ?? post.production_start_date
        ?? post.meta?.start_date
        ?? post.acf?.start_date;
      if (!rawDate) continue;

      // Handle YYYYMMDD (ACF date picker) or YYYY-MM-DD (ISO)
      const eventDate = rawDate.includes('-')
        ? rawDate.slice(0, 10)
        : `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      if (new Date(eventDate) < now) continue;

      const location = post.acf?.event_location ?? post.event_location ?? post.meta?.location ?? '';
      // Extract venue name (before first comma) and city from location string
      const locationParts = location.split(',').map((s: string) => s.trim());
      const venueName = locationParts[0] || feed.name;
      const city = locationParts[1] || feed.defaultCity || '';

      const venueId = location
        ? await findOrCreateVenue(venueName, city, feed.province, location)
        : await findOrCreateVenue(feed.name, city, feed.province, city);

      const ticketLink = post.acf?.ticket_link ?? post.ticket_link ?? post.link;

      const extracted: ExtractedEvent = {
        performer: stripHtml(post.title.rendered),
        event_date: eventDate,
        event_time: null,
        price: null,
        ticket_link: ticketLink,
        description: stripHtml(post.content.rendered).slice(0, 500) || null,
        cover_image_url: null,
        confidence: 1.0,
        event_category: 'theatre',
      };

      await upsertEvent(venueId, extracted, post.link, null, 'scrape');
      result.eventsUpserted++;
    } catch (err) {
      console.error(`  [${feed.id}] Post ${post.id} error:`, err instanceof Error ? err.message : err);
      result.errors++;
    }
  }

  return result;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

export async function fetchAllWpEventFeeds(feedIds?: string[]): Promise<FeedResult[]> {
  const feeds = feedIds
    ? WP_EVENT_FEEDS.filter((f) => feedIds.includes(f.id))
    : WP_EVENT_FEEDS;

  console.log(`Fetching ${feeds.length} event feeds concurrently...`);

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      console.log(`  ◆ ${feed.name} (${feed.type})...`);
      const fetcher = {
        tribe: fetchTribeFeed,
        'wp-event': fetchWpEventFeed,
        'drupal-json': fetchDrupalJsonFeed,
        livewhale: fetchLiveWhaleFeed,
      }[feed.type];

      const result = await fetcher(feed);
      console.log(`  ✓ ${feed.name}: ${result.eventsUpserted}/${result.eventsFound} events upserted`);
      return result;
    })
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`  ✗ ${feeds[i].name}: ${r.reason}`);
    return { feedId: feeds[i].id, feedName: feeds[i].name, eventsFound: 0, eventsUpserted: 0, errors: 1 };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

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

function guessCategory(title: string, types: string[]): ExtractedEvent['event_category'] {
  const text = [title, ...types].join(' ').toLowerCase();
  return guessCategoryFromString(text);
}

function guessCategoryFromString(text: string): ExtractedEvent['event_category'] {
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
