import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { discovered_sources, scrape_sources } from '@/lib/db/schema';

const ATLANTIC_CITIES: Array<{ city: string; province: string }> = [
  { city: 'Halifax', province: 'NS' },
  { city: 'Moncton', province: 'NB' },
  { city: 'Fredericton', province: 'NB' },
  { city: 'Saint John', province: 'NB' },
  { city: 'Charlottetown', province: 'PEI' },
  { city: "St. John's", province: 'NL' },
];

const AGGREGATOR_DOMAINS = ['eventbrite.com', 'bandsintown.com', 'facebook.com', 'ticketmaster.com'];

const CandidateSchema = z.object({
  candidates: z.array(
    z.object({
      url: z.string().url(),
      name: z.string().nullable(),
      province: z.string().nullable(),
      city: z.string().nullable(),
      rawContext: z.string().nullable(),
    })
  ),
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDiscoveryJob(): Promise<void> {
  // Step 1: Fetch all existing domains for deduplication
  const existingSources = await db.select({ url: scrape_sources.url }).from(scrape_sources);
  const existingStaged = await db.select({ url: discovered_sources.url }).from(discovered_sources);

  const knownDomains = new Set<string>(
    [
      ...existingSources.map((r) => {
        try {
          return new URL(r.url).hostname;
        } catch {
          return '';
        }
      }),
      ...existingStaged.map((r) => {
        try {
          return new URL(r.url).hostname;
        } catch {
          return '';
        }
      }),
    ].filter(Boolean)
  );

  let totalInserted = 0;
  const throttleMs = parseInt(process.env.DISCOVERY_THROTTLE_MS ?? '2000', 10);

  // Step 2: Loop over ATLANTIC_CITIES, query Gemini per city
  for (let i = 0; i < ATLANTIC_CITIES.length; i++) {
    const { city, province } = ATLANTIC_CITIES[i];

    if (i > 0) {
      await delay(throttleMs);
    }

    const { experimental_output } = await generateText({
      model: google('gemini-2.5-flash'),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      output: Output.object({ schema: CandidateSchema }),
      prompt: `Search for event venue websites in ${city}, ${province}, Canada.
Find bars, pubs, theatres, concert halls, and community centres that host public events and have their own events pages.
Return their official website URLs — NOT Eventbrite, Facebook, Bandsintown, or Ticketmaster pages.
For each venue return: url (full URL with https://), name, province ("${province}"), city ("${city}"), and a brief rawContext describing the venue.`,
    });

    const candidates = experimental_output?.candidates ?? [];

    // Step 3: Deduplicate, filter aggregators, and insert
    for (const candidate of candidates) {
      let hostname: string;
      try {
        hostname = new URL(candidate.url).hostname;
      } catch {
        continue; // Skip malformed URLs
      }

      if (knownDomains.has(hostname)) continue;

      if (AGGREGATOR_DOMAINS.some((agg) => hostname.includes(agg))) continue;

      await db
        .insert(discovered_sources)
        .values({
          url: candidate.url,
          domain: hostname,
          source_name: candidate.name ?? null,
          province: candidate.province ?? null,
          city: candidate.city ?? null,
          status: 'pending',
          discovery_method: 'gemini_google_search',
          raw_context: candidate.rawContext ?? null,
        })
        .onConflictDoNothing();

      knownDomains.add(hostname); // Prevent intra-run duplicates
      totalInserted++;
    }
  }

  console.log(`Discovery complete: ${totalInserted} new candidates staged`);
}
