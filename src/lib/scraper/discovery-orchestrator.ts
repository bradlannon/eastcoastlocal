import { google } from '@ai-sdk/google';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { discovered_sources, scrape_sources } from '@/lib/db/schema';
import { promoteSource } from './promote-source';

export interface DiscoveryJobResult {
  candidatesFound: number;
  autoApproved: number;
  queuedPending: number;
  errors: number;
}

const ATLANTIC_CITIES: Array<{ city: string; province: string }> = [
  { city: 'Halifax', province: 'NS' },
  { city: 'Moncton', province: 'NB' },
  { city: 'Fredericton', province: 'NB' },
  { city: 'Saint John', province: 'NB' },
  { city: 'Charlottetown', province: 'PEI' },
  { city: "St. John's", province: 'NL' },
];

const AGGREGATOR_DOMAINS = ['eventbrite.com', 'bandsintown.com', 'facebook.com', 'ticketmaster.com'];

const GEMINI_AUTO_APPROVE = parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9');

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

export function scoreCandidate(candidate: {
  url: string;
  city: string | null;
  province: string | null;
  source_name: string | null;
}): number {
  let score = 0.5;
  if (candidate.city) score += 0.15;
  if (candidate.province) score += 0.15;
  if (candidate.source_name) score += 0.10;
  if (candidate.url.startsWith('https://')) score += 0.05;
  if (/\/events\/|\/tickets\/|\/shows\//i.test(candidate.url)) score -= 0.20;
  if (/facebook\.com|instagram\.com|eventbrite\.com/i.test(candidate.url)) score -= 1.0;
  return Math.max(0, Math.min(score, 1.0));
}

export async function runDiscoveryJob(): Promise<DiscoveryJobResult> {
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

  // Collect inserted candidates for scoring after city loop
  const insertedCandidates: Array<{
    url: string;
    city: string | null;
    province: string | null;
    source_name: string | null;
  }> = [];

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

      insertedCandidates.push({
        url: candidate.url,
        city: candidate.city ?? null,
        province: candidate.province ?? null,
        source_name: candidate.name ?? null,
      });

      knownDomains.add(hostname); // Prevent intra-run duplicates
      totalInserted++;
    }
  }

  // Step 4: Score all inserted candidates and auto-promote high scorers
  let autoApproved = 0;
  for (const candidate of insertedCandidates) {
    const score = scoreCandidate(candidate);

    // Write discovery_score to DB
    await db
      .update(discovered_sources)
      .set({ discovery_score: score })
      .where(eq(discovered_sources.url, candidate.url));

    // Auto-promote if score meets threshold
    if (score >= GEMINI_AUTO_APPROVE) {
      const staged = await db.query.discovered_sources.findFirst({
        where: eq(discovered_sources.url, candidate.url),
      });

      if (staged && staged.status === 'pending') {
        await promoteSource(staged.id);
        autoApproved++;
        console.log(`Auto-approved: ${candidate.url} (score: ${score.toFixed(2)})`);
      }
    }
  }

  console.log(
    `Discovery complete: ${totalInserted} new candidates staged, ${autoApproved} auto-approved`
  );

  return {
    candidatesFound: totalInserted,
    autoApproved,
    queuedPending: totalInserted - autoApproved,
    errors: 0,
  };
}
