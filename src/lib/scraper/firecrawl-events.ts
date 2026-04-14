/**
 * AI-extract scraper using Firecrawl's JSON-schema extraction.
 *
 * Schema shape: { events: z.array(extractedEventSchema) }
 * (ExtractedEventSchema from src/lib/schemas/extracted-event.ts already
 * wraps the events array — we pass it directly to Firecrawl's extractWithSchema.)
 *
 * Usage:
 *   const events = await scrapeEventsWithFirecrawl('https://venue.com/events');
 *
 * Each call consumes Firecrawl credits.
 */
import { extractWithSchema } from './firecrawl';
import { ExtractedEventSchema, type ExtractedEvent } from '@/lib/schemas/extracted-event';

/**
 * Scrape a URL and extract a list of events using Firecrawl's AI extraction.
 * Returns an empty array if no events are found or Firecrawl returns null.
 * Propagates errors (including the URL) if extraction fails.
 */
export async function scrapeEventsWithFirecrawl(url: string): Promise<ExtractedEvent[]> {
  const result = await extractWithSchema(url, ExtractedEventSchema);

  if (!result || !Array.isArray((result as { events?: unknown }).events)) {
    return [];
  }

  return (result as { events: ExtractedEvent[] }).events ?? [];
}
