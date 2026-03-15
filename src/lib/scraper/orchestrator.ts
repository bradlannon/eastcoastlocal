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
import type { ExtractedEvent } from '@/lib/schemas/extracted-event';

// Delay between AI extraction requests to stay within Gemini rate limits.
// Free tier: 20 req/day. Paid tier: much higher — can reduce this to 0.
const AI_THROTTLE_MS = parseInt(process.env.SCRAPE_THROTTLE_MS ?? '4000', 10);

// Delay between venue_website sources (not AI-related — HTTP courtesy throttle).
const HTTP_THROTTLE_MS = parseInt(process.env.HTTP_THROTTLE_MS ?? '1000', 10);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runScrapeJob(): Promise<void> {
  const sources = await db.query.scrape_sources.findMany({
    where: eq(scrape_sources.enabled, true),
  });

  console.log(`Scraping ${sources.length} enabled sources (throttle: ${AI_THROTTLE_MS}ms)...`);
  let successCount = 0;
  let failCount = 0;
  let eventCount = 0;

  for (const source of sources) {
    try {
      // Track per-source metrics — set inside venue_website branch, null for other types
      let sourceEventCount: number | null = null;
      let avgConf: number | null = null;

      if (source.source_type === 'venue_website') {
        // Fetch venue record to check for geocoding needs
        const venue = await db.query.venues.findFirst({
          where: eq(venues.id, source.venue_id),
        });

        if (!venue) {
          console.error(`Venue not found for source ${source.id} (venue_id=${source.venue_id})`);
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

        // Fetch page(s) — multi-page support via source.max_pages
        const { text, rawHtml } = await fetchAndPreprocess(source.url, {
          maxPages: source.max_pages ?? 1,
        });

        // JSON-LD fast path: structured data is authoritative (confidence=1.0)
        // Short-circuit — do NOT also call Gemini if JSON-LD found events
        const jsonLdEvents = extractJsonLdEvents(rawHtml);

        let extracted: ExtractedEvent[];
        if (jsonLdEvents.length > 0) {
          extracted = jsonLdEvents;
          console.log(`  ✓ ${venue.name}: ${extracted.length} events (JSON-LD, skipping Gemini)`);
        } else {
          extracted = await extractEvents(text, source.url);
          console.log(`  ✓ ${venue.name}: ${extracted.length} events`);

          // AI throttle only applies when Gemini was actually called
          if (AI_THROTTLE_MS > 0) {
            await delay(AI_THROTTLE_MS);
          }
        }

        // Compute quality metrics for this source
        sourceEventCount = extracted.length;
        avgConf = sourceEventCount > 0
          ? extracted.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / sourceEventCount
          : null;

        for (const event of extracted) {
          await upsertEvent(source.venue_id, event, source.url, source.id, 'scrape');
        }

        eventCount += extracted.length;

        // HTTP throttle between venue_website sources (separate from AI throttle)
        if (HTTP_THROTTLE_MS > 0) {
          await delay(HTTP_THROTTLE_MS);
        }
      } else if (source.source_type === 'eventbrite') {
        await scrapeEventbrite(source);
        console.log(`  ✓ Eventbrite source ${source.id}`);
      } else if (source.source_type === 'bandsintown') {
        await scrapeBandsintown(source);
        console.log(`  ✓ Bandsintown source ${source.id}`);
      } else if (source.source_type === 'ticketmaster') {
        await scrapeTicketmaster(source);
        console.log(`  ✓ Ticketmaster source ${source.id} (${source.url})`);
      } else {
        console.warn(`Unknown source_type '${source.source_type}' for source ${source.id} — skipping`);
      }

      // Mark success with quality metrics
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
      console.error(`  ✗ Source ${source.id} (${source.url}):`, err instanceof Error ? err.message : err);
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
      // Continue to next source — never abort full run
    }
  }

  console.log(`Scrape complete: ${successCount} succeeded, ${failCount} failed, ${eventCount} events extracted`);
}
