import { db } from '@/lib/db/client';
import { scrape_sources, venues } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { fetchAndPreprocess } from './fetcher';
import { extractEvents } from './extractor';
import { extractJsonLdEvents } from './json-ld';
import { upsertEvent } from './normalizer';
import { geocodeAddress } from './geocoder';
import { scrapeEventbrite } from './eventbrite';
import { scrapeBandsintown } from './bandsintown';
import { scrapeTicketmaster } from './ticketmaster';
import { tryFeedFallback, tryDiscoveredFeeds } from './feed-discovery';
import { scrapeFacebookEvents } from './facebook';
import { scrapeEventsWithFirecrawl } from './firecrawl-events';
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

// Delay between AI extraction requests to stay within Gemini rate limits.
// Free tier: 20 req/day. Paid tier: much higher — can reduce this to 0.
const AI_THROTTLE_MS = parseInt(process.env.SCRAPE_THROTTLE_MS ?? '4000', 10);

// Delay between venue_website sources (not AI-related — HTTP courtesy throttle).
const HTTP_THROTTLE_MS = parseInt(process.env.HTTP_THROTTLE_MS ?? '1000', 10);

// Skip sources scraped within this window (in hours)
const STALE_THRESHOLD_HOURS = parseInt(process.env.SCRAPE_STALE_HOURS ?? '4', 10);

export const PROVINCES = ['NS', 'NB', 'PEI', 'NL'] as const;
export type Province = (typeof PROVINCES)[number];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScrapeResult {
  province: Province | 'all';
  success: number;
  failed: number;
  skipped: number;
  events: number;
}

/** Scrape sources for a single province, skipping recently-scraped ones. */
export async function runScrapeForProvince(province: Province): Promise<ScrapeResult> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  // Get venue IDs for this province
  const provinceVenues = await db.query.venues.findMany({
    where: eq(venues.province, province),
  });
  const venueIds = provinceVenues.map((v) => v.id);

  if (venueIds.length === 0) {
    console.log(`[${province}] No venues found — skipping`);
    return { province, success: 0, failed: 0, skipped: 0, events: 0 };
  }

  // Get enabled sources for those venues
  const allProvinceSources = await db.query.scrape_sources.findMany({
    where: eq(scrape_sources.enabled, true),
  });
  const matchingSources = allProvinceSources.filter((s) => venueIds.includes(s.venue_id));

  // Build venue lookup map
  const venueMap = new Map(provinceVenues.map((v) => [v.id, v]));

  // Split into stale (to scrape) and fresh (to skip)
  const provinceSources = matchingSources.filter(
    (s) => s.last_scraped_at === null || s.last_scraped_at < staleThreshold
  );
  const skippedCount = matchingSources.length - provinceSources.length;

  console.log(`[${province}] Scraping ${provinceSources.length} stale sources (${skippedCount} skipped, threshold: ${STALE_THRESHOLD_HOURS}h)...`);

  let successCount = 0;
  let failCount = 0;
  let eventCount = 0;

  for (const source of provinceSources) {
    try {
      let sourceEventCount: number | null = null;
      let avgConf: number | null = null;

      if (source.source_type === 'venue_website') {
        const venue = venueMap.get(source.venue_id);
        if (!venue) {
          console.error(`[${province}] Venue not found for source ${source.id} (venue_id=${source.venue_id})`);
          await db
            .update(scrape_sources)
            .set({
              last_scraped_at: new Date(),
              last_scrape_status: 'failure',
              consecutive_failures: sql`consecutive_failures + 1`,
              total_scrapes: sql`total_scrapes + 1`,
            })
            .where(eq(scrape_sources.id, source.id));
          failCount++;
          continue;
        }

        // Geocode venue if lat/lng missing
        if (venue.lat == null || venue.lng == null) {
          const address = `${venue.address}, ${venue.city}, ${venue.province}, Canada`;
          const coords = await geocodeAddress(address);
          if (coords) {
            await db
              .update(venues)
              .set({ lat: coords.lat, lng: coords.lng })
              .where(eq(venues.id, venue.id));
          }
        }

        let extracted: ExtractedEvent[];

        try {
          const { text, rawHtml } = await fetchAndPreprocess(source.url, {
            maxPages: source.max_pages ?? 1,
          });

          const jsonLdEvents = extractJsonLdEvents(rawHtml);

          if (jsonLdEvents.length > 0) {
            extracted = jsonLdEvents;
            console.log(`  ✓ [${province}] ${venue.name}: ${extracted.length} events (JSON-LD, skipping Gemini)`);
          } else {
            // Try feed discovery from HTML before falling back to AI extraction
            const discoveredEvents = await tryDiscoveredFeeds(rawHtml, source.url);
            if (discoveredEvents.length > 0) {
              extracted = discoveredEvents;
              console.log(`  ✓ [${province}] ${venue.name}: ${extracted.length} events (discovered feed)`);
            } else {
              extracted = await extractEvents(text, source.url, { venueId: source.venue_id, scrapeSourceId: source.id });
              console.log(`  ✓ [${province}] ${venue.name}: ${extracted.length} events`);
              if (AI_THROTTLE_MS > 0) {
                await delay(AI_THROTTLE_MS);
              }
            }
          }
        } catch (fetchErr) {
          // Bot-blocked or JS-gated — try RSS/Atom/iCal feed fallback
          const errMsg = fetchErr instanceof Error ? fetchErr.message : '';
          if (errMsg.includes('bot-blocked') || errMsg.includes('Cloudflare') || errMsg.includes('JS-gated') || errMsg.includes('403')) {
            console.log(`  ↻ [${province}] ${venue.name}: bot-blocked, trying feed fallback...`);
            extracted = await tryFeedFallback(source.url);
            if (extracted.length === 0) {
              throw fetchErr; // No feed found — propagate original error
            }
            console.log(`  ✓ [${province}] ${venue.name}: ${extracted.length} events (feed fallback)`);
          } else {
            throw fetchErr; // Non-bot-block error — propagate
          }
        }

        sourceEventCount = extracted.length;
        avgConf = sourceEventCount > 0
          ? extracted.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / sourceEventCount
          : null;

        for (const event of extracted) {
          await upsertEvent(source.venue_id, event, source.url, source.id, 'scrape');
        }

        eventCount += extracted.length;

        if (HTTP_THROTTLE_MS > 0) {
          await delay(HTTP_THROTTLE_MS);
        }
      } else if (source.source_type === 'eventbrite') {
        await scrapeEventbrite(source);
        console.log(`  ✓ [${province}] Eventbrite source ${source.id}`);
      } else if (source.source_type === 'bandsintown') {
        await scrapeBandsintown(source);
        console.log(`  ✓ [${province}] Bandsintown source ${source.id}`);
      } else if (source.source_type === 'ticketmaster') {
        await scrapeTicketmaster(source);
        console.log(`  ✓ [${province}] Ticketmaster source ${source.id} (${source.url})`);
      } else if (source.source_type === 'facebook_page') {
        const fbEvents = await scrapeFacebookEvents(source.url, {
          venueId: source.venue_id,
          scrapeSourceId: source.id,
        });
        sourceEventCount = fbEvents.length;
        for (const event of fbEvents) {
          await upsertEvent(source.venue_id, event, source.url, source.id, 'scrape');
        }
        eventCount += fbEvents.length;
        const fbVenue = venueMap.get(source.venue_id);
        console.log(`  ✓ [${province}] Facebook ${fbVenue?.name ?? source.id}: ${fbEvents.length} events`);
        if (HTTP_THROTTLE_MS > 0) {
          await delay(HTTP_THROTTLE_MS);
        }
      } else if (source.source_type === 'firecrawl_extract') {
        if (process.env.FIRECRAWL_SCRAPE_ENABLED !== '1') {
          console.log(`[${province}] Skipping firecrawl_extract source ${source.id} — FIRECRAWL_SCRAPE_ENABLED not set`);
          // events = [] (sourceEventCount stays null, no upserts)
        } else {
          const fcEvents = await scrapeEventsWithFirecrawl(source.url);
          sourceEventCount = fcEvents.length;
          avgConf = sourceEventCount > 0
            ? fcEvents.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / sourceEventCount
            : null;
          for (const event of fcEvents) {
            await upsertEvent(source.venue_id, event, source.url, source.id, 'scrape');
          }
          eventCount += fcEvents.length;
          console.log(`  ✓ [${province}] Firecrawl source ${source.id}: ${fcEvents.length} events`);
        }
      } else {
        console.warn(`[${province}] Unknown source_type '${source.source_type}' for source ${source.id} — skipping`);
      }

      await db
        .update(scrape_sources)
        .set({
          last_scraped_at: new Date(),
          last_scrape_status: 'success',
          last_event_count: sourceEventCount,
          avg_confidence: avgConf,
          consecutive_failures: 0,
          total_scrapes: sql`total_scrapes + 1`,
          total_events_extracted: sql`total_events_extracted + ${sourceEventCount ?? 0}`,
        })
        .where(eq(scrape_sources.id, source.id));
      successCount++;
    } catch (err) {
      console.error(`  ✗ [${province}] Source ${source.id} (${source.url}):`, err instanceof Error ? err.message : err);
      await db
        .update(scrape_sources)
        .set({
          last_scraped_at: new Date(),
          last_scrape_status: 'failure',
          consecutive_failures: sql`consecutive_failures + 1`,
          total_scrapes: sql`total_scrapes + 1`,
        })
        .where(eq(scrape_sources.id, source.id));
      failCount++;
    }
  }

  console.log(`[${province}] Scrape complete: ${successCount} succeeded, ${failCount} failed, ${skippedCount} skipped, ${eventCount} events`);
  return { province, success: successCount, failed: failCount, skipped: skippedCount, events: eventCount };
}

/** Return list of sources that need scraping (stale or never scraped). */
export async function getStaleSources(): Promise<
  Array<{ id: number; url: string; venueName: string; province: string; sourceType: string }>
> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

  const allSources = await db.query.scrape_sources.findMany({
    where: eq(scrape_sources.enabled, true),
  });

  const staleSources = allSources.filter(
    (s) => s.last_scraped_at === null || s.last_scraped_at < staleThreshold
  );

  const allVenues = await db.query.venues.findMany();
  const venueMap = new Map(allVenues.map((v) => [v.id, v]));

  return staleSources.map((s) => {
    const venue = venueMap.get(s.venue_id);
    return {
      id: s.id,
      url: s.url,
      venueName: venue?.name ?? `Source ${s.id}`,
      province: venue?.province ?? '??',
      sourceType: s.source_type,
    };
  });
}

/** Scrape a single source by ID. Returns events extracted count. */
export async function scrapeOneSource(sourceId: number): Promise<{
  success: boolean;
  events: number;
  venueName: string;
}> {
  const source = await db.query.scrape_sources.findFirst({
    where: eq(scrape_sources.id, sourceId),
  });
  if (!source) throw new Error(`Source ${sourceId} not found`);

  const venue = await db.query.venues.findFirst({
    where: eq(venues.id, source.venue_id),
  });
  const venueName = venue?.name ?? `Source ${sourceId}`;

  try {
    let sourceEventCount: number | null = null;
    let avgConf: number | null = null;

    if (source.source_type === 'venue_website') {
      if (!venue) throw new Error(`Venue not found for source ${sourceId}`);

      if (venue.lat == null || venue.lng == null) {
        const address = `${venue.address}, ${venue.city}, ${venue.province}, Canada`;
        const coords = await geocodeAddress(address);
        if (coords) {
          await db.update(venues).set({ lat: coords.lat, lng: coords.lng }).where(eq(venues.id, venue.id));
        }
      }

      let extracted: ExtractedEvent[];

      try {
        const { text, rawHtml } = await fetchAndPreprocess(source.url, { maxPages: source.max_pages ?? 1 });
        const jsonLdEvents = extractJsonLdEvents(rawHtml);

        if (jsonLdEvents.length > 0) {
          extracted = jsonLdEvents;
        } else {
          const discoveredEvents = await tryDiscoveredFeeds(rawHtml, source.url);
          if (discoveredEvents.length > 0) {
            extracted = discoveredEvents;
          } else {
            extracted = await extractEvents(text, source.url);
          }
        }
      } catch (fetchErr) {
        const errMsg = fetchErr instanceof Error ? fetchErr.message : '';
        if (errMsg.includes('bot-blocked') || errMsg.includes('Cloudflare') || errMsg.includes('JS-gated') || errMsg.includes('403')) {
          console.log(`  ↻ ${venueName}: bot-blocked, trying feed fallback...`);
          extracted = await tryFeedFallback(source.url);
          if (extracted.length === 0) throw fetchErr;
          console.log(`  ✓ ${venueName}: ${extracted.length} events (feed fallback)`);
        } else {
          throw fetchErr;
        }
      }

      sourceEventCount = extracted.length;
      avgConf = sourceEventCount > 0
        ? extracted.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / sourceEventCount
        : null;

      for (const event of extracted) {
        await upsertEvent(source.venue_id, event, source.url, source.id, 'scrape');
      }
    } else if (source.source_type === 'eventbrite') {
      await scrapeEventbrite(source);
    } else if (source.source_type === 'bandsintown') {
      await scrapeBandsintown(source);
    } else if (source.source_type === 'ticketmaster') {
      await scrapeTicketmaster(source);
    } else if (source.source_type === 'firecrawl_extract') {
      if (process.env.FIRECRAWL_SCRAPE_ENABLED !== '1') {
        console.log(`Skipping firecrawl_extract source ${sourceId} — FIRECRAWL_SCRAPE_ENABLED not set`);
        // sourceEventCount stays null, no upserts
      } else {
        const fcEvents = await scrapeEventsWithFirecrawl(source.url);
        sourceEventCount = fcEvents.length;
        avgConf = sourceEventCount > 0
          ? fcEvents.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / sourceEventCount
          : null;
        for (const event of fcEvents) {
          await upsertEvent(source.venue_id, event, source.url, source.id, 'scrape');
        }
        console.log(`  ✓ ${venueName}: ${fcEvents.length} events (firecrawl_extract)`);
      }
    }

    await db
      .update(scrape_sources)
      .set({
        last_scraped_at: new Date(),
        last_scrape_status: 'success',
        last_scrape_error: null,
        last_event_count: sourceEventCount,
        avg_confidence: avgConf,
        consecutive_failures: 0,
        total_scrapes: sql`total_scrapes + 1`,
        total_events_extracted: sql`total_events_extracted + ${sourceEventCount ?? 0}`,
      })
      .where(eq(scrape_sources.id, source.id));

    return { success: true, events: sourceEventCount ?? 0, venueName };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Scrape source ${sourceId} (${source.url}):`, errorMsg);
    await db
      .update(scrape_sources)
      .set({
        last_scraped_at: new Date(),
        last_scrape_status: 'failure',
        last_scrape_error: errorMsg.slice(0, 500),
        consecutive_failures: sql`consecutive_failures + 1`,
        total_scrapes: sql`total_scrapes + 1`,
      })
      .where(eq(scrape_sources.id, source.id));

    return { success: false, events: 0, venueName };
  }
}

/** Run all provinces concurrently, each province processes its sources sequentially. */
export async function runScrapeJob(): Promise<ScrapeResult[]> {
  console.log(`Scraping all provinces concurrently (stale threshold: ${STALE_THRESHOLD_HOURS}h)...`);
  const results = await Promise.all(PROVINCES.map((p) => runScrapeForProvince(p)));
  const totals = results.reduce(
    (acc, r) => ({ success: acc.success + r.success, failed: acc.failed + r.failed, skipped: acc.skipped + r.skipped, events: acc.events + r.events }),
    { success: 0, failed: 0, skipped: 0, events: 0 }
  );
  console.log(`Scrape complete: ${totals.success} succeeded, ${totals.failed} failed, ${totals.skipped} skipped, ${totals.events} events extracted`);
  return results;
}
