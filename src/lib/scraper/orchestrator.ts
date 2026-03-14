import { db } from '@/lib/db/client';
import { scrape_sources, venues } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchAndPreprocess } from './fetcher';
import { extractEvents } from './extractor';
import { upsertEvent } from './normalizer';
import { geocodeAddress } from './geocoder';
import { scrapeEventbrite } from './eventbrite';
import { scrapeBandsintown } from './bandsintown';

export async function runScrapeJob(): Promise<void> {
  const sources = await db.query.scrape_sources.findMany({
    where: eq(scrape_sources.enabled, true),
  });

  for (const source of sources) {
    try {
      if (source.source_type === 'venue_website') {
        // Fetch venue record to check for geocoding needs
        const venue = await db.query.venues.findFirst({
          where: eq(venues.id, source.venue_id),
        });

        if (!venue) {
          console.error(`Venue not found for source ${source.id} (venue_id=${source.venue_id})`);
          await db
            .update(scrape_sources)
            .set({ last_scraped_at: new Date(), last_scrape_status: 'failure' })
            .where(eq(scrape_sources.id, source.id));
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

        // Fetch, extract, and upsert events
        const pageText = await fetchAndPreprocess(source.url);
        const extracted = await extractEvents(pageText, source.url);

        for (const event of extracted) {
          await upsertEvent(source.venue_id, event, source.url);
        }
      } else if (source.source_type === 'eventbrite') {
        await scrapeEventbrite(source);
      } else if (source.source_type === 'bandsintown') {
        await scrapeBandsintown(source);
      } else {
        console.warn(`Unknown source_type '${source.source_type}' for source ${source.id} — skipping`);
      }

      // Mark success
      await db
        .update(scrape_sources)
        .set({ last_scraped_at: new Date(), last_scrape_status: 'success' })
        .where(eq(scrape_sources.id, source.id));
    } catch (err) {
      console.error(`Error processing source ${source.id} (${source.url}):`, err);
      await db
        .update(scrape_sources)
        .set({ last_scraped_at: new Date(), last_scrape_status: 'failure' })
        .where(eq(scrape_sources.id, source.id));
      // Continue to next source — never abort full run
    }
  }
}
