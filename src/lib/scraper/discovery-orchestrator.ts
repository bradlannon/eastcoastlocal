import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
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

export const ATLANTIC_CITIES: Array<{ city: string; province: string }> = [
  // Nova Scotia — cities
  { city: 'Halifax', province: 'NS' },
  { city: 'Sydney', province: 'NS' },
  { city: 'Truro', province: 'NS' },
  { city: 'New Glasgow', province: 'NS' },
  { city: 'Wolfville', province: 'NS' },
  { city: 'Antigonish', province: 'NS' },
  { city: 'Yarmouth', province: 'NS' },
  { city: 'Kentville', province: 'NS' },
  { city: 'Bridgewater', province: 'NS' },
  // Nova Scotia — smaller towns
  { city: 'Lunenburg', province: 'NS' },
  { city: 'Mahone Bay', province: 'NS' },
  { city: 'Liverpool', province: 'NS' },
  { city: 'Shelburne', province: 'NS' },
  { city: 'Digby', province: 'NS' },
  { city: 'Annapolis Royal', province: 'NS' },
  { city: 'Pictou', province: 'NS' },
  { city: 'Parrsboro', province: 'NS' },
  { city: 'Inverness', province: 'NS' },
  { city: 'Baddeck', province: 'NS' },
  { city: 'Port Hawkesbury', province: 'NS' },
  { city: 'Amherst', province: 'NS' },
  { city: 'Chester', province: 'NS' },
  { city: 'Tatamagouche', province: 'NS' },
  // New Brunswick — cities
  { city: 'Moncton', province: 'NB' },
  { city: 'Fredericton', province: 'NB' },
  { city: 'Saint John', province: 'NB' },
  { city: 'Miramichi', province: 'NB' },
  { city: 'Bathurst', province: 'NB' },
  { city: 'Edmundston', province: 'NB' },
  { city: 'Sackville', province: 'NB' },
  { city: 'Woodstock', province: 'NB' },
  // New Brunswick — smaller towns
  { city: 'Sussex', province: 'NB' },
  { city: 'St. Andrews', province: 'NB' },
  { city: 'St. Stephen', province: 'NB' },
  { city: 'Shediac', province: 'NB' },
  { city: 'Caraquet', province: 'NB' },
  { city: 'Campbellton', province: 'NB' },
  { city: 'Grand Falls', province: 'NB' },
  { city: 'Bouctouche', province: 'NB' },
  { city: 'Tracadie-Sheila', province: 'NB' },
  { city: 'Dalhousie', province: 'NB' },
  { city: 'Hampton', province: 'NB' },
  { city: 'Grand Manan', province: 'NB' },
  { city: 'Alma', province: 'NB' },
  // PEI
  { city: 'Charlottetown', province: 'PEI' },
  { city: 'Summerside', province: 'PEI' },
  // PEI — smaller towns
  { city: 'Montague', province: 'PEI' },
  { city: 'Souris', province: 'PEI' },
  { city: 'Kensington', province: 'PEI' },
  { city: 'Cavendish', province: 'PEI' },
  { city: 'North Rustico', province: 'PEI' },
  { city: 'Victoria', province: 'PEI' },
  // Newfoundland & Labrador — cities
  { city: "St. John's", province: 'NL' },
  { city: 'Corner Brook', province: 'NL' },
  { city: 'Gander', province: 'NL' },
  { city: 'Grand Falls-Windsor', province: 'NL' },
  // Newfoundland & Labrador — smaller towns
  { city: 'Carbonear', province: 'NL' },
  { city: 'Bay Roberts', province: 'NL' },
  { city: 'Clarenville', province: 'NL' },
  { city: 'Bonavista', province: 'NL' },
  { city: 'Twillingate', province: 'NL' },
  { city: 'Deer Lake', province: 'NL' },
  { city: 'Stephenville', province: 'NL' },
  { city: 'Channel-Port aux Basques', province: 'NL' },
  { city: 'Marystown', province: 'NL' },
  { city: 'Fogo Island', province: 'NL' },
  { city: 'St. Anthony', province: 'NL' },
  { city: 'Happy Valley-Goose Bay', province: 'NL' },
  { city: 'Placentia', province: 'NL' },
];

const AGGREGATOR_DOMAINS = ['eventbrite.com', 'bandsintown.com', 'facebook.com', 'ticketmaster.com'];

const GEMINI_AUTO_APPROVE = parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9');

const CandidateSchema = z.object({
  candidates: z.array(
    z.object({
      url: z.string().url(),
      name: z.string().nullable(),
      address: z.string().nullable(),
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

async function getKnownDomains(): Promise<Set<string>> {
  const existingSources = await db.select({ url: scrape_sources.url }).from(scrape_sources);
  const existingStaged = await db.select({ url: discovered_sources.url }).from(discovered_sources);

  return new Set<string>(
    [
      ...existingSources.map((r) => {
        try { return new URL(r.url).hostname; } catch { return ''; }
      }),
      ...existingStaged.map((r) => {
        try { return new URL(r.url).hostname; } catch { return ''; }
      }),
    ].filter(Boolean)
  );
}

/** Process a single city — fits within Vercel's 60s timeout */
export async function runDiscoveryForCity(cityIndex: number): Promise<DiscoveryJobResult> {
  const entry = ATLANTIC_CITIES[cityIndex];
  if (!entry) {
    return { candidatesFound: 0, autoApproved: 0, queuedPending: 0, errors: 0 };
  }

  const { city, province } = entry;
  const knownDomains = await getKnownDomains();

  const insertedCandidates: Array<{
    url: string;
    city: string | null;
    province: string | null;
    source_name: string | null;
  }> = [];

  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    prompt: `Search for event venue websites in ${city}, ${province}, Canada.
Find bars, pubs, theatres, concert halls, and community centres that host public events and have their own events pages.
Return their official website URLs — NOT Eventbrite, Facebook, Bandsintown, or Ticketmaster pages.
For each venue return: url (full URL with https://), name, address (full street address like "123 Main St, ${city}, ${province}"), province ("${province}"), city ("${city}"), and a brief rawContext describing the venue.
You MUST search for and include the street address for each venue.

Return ONLY a JSON object in this exact format, no markdown fences:
{"candidates": [{"url": "...", "name": "...", "address": "...", "province": "...", "city": "...", "rawContext": "..."}]}`,
  });

  let candidates: z.infer<typeof CandidateSchema>['candidates'] = [];
  try {
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
    const parsed = CandidateSchema.parse(JSON.parse(cleaned));
    candidates = parsed.candidates;
  } catch (e) {
    console.error(`Failed to parse Gemini response for ${city}:`, e);
    return { candidatesFound: 0, autoApproved: 0, queuedPending: 0, errors: 1 };
  }

  let totalInserted = 0;
  for (const candidate of candidates) {
    let hostname: string;
    try {
      hostname = new URL(candidate.url).hostname;
    } catch {
      continue;
    }

    if (knownDomains.has(hostname)) continue;
    if (AGGREGATOR_DOMAINS.some((agg) => hostname.includes(agg))) continue;

    await db
      .insert(discovered_sources)
      .values({
        url: candidate.url,
        domain: hostname,
        source_name: candidate.name ?? null,
        address: candidate.address ?? null,
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

    knownDomains.add(hostname);
    totalInserted++;
  }

  let autoApproved = 0;
  for (const candidate of insertedCandidates) {
    const score = scoreCandidate(candidate);

    await db
      .update(discovered_sources)
      .set({ discovery_score: score })
      .where(eq(discovered_sources.url, candidate.url));

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

  console.log(`Discovery [${city}]: ${totalInserted} candidates, ${autoApproved} auto-approved`);

  return {
    candidatesFound: totalInserted,
    autoApproved,
    queuedPending: totalInserted - autoApproved,
    errors: 0,
  };
}

/** Run all cities sequentially — used by the cron job (may timeout on Hobby plan) */
export async function runDiscoveryJob(): Promise<DiscoveryJobResult> {
  const throttleMs = parseInt(process.env.DISCOVERY_THROTTLE_MS ?? '2000', 10);
  const totals: DiscoveryJobResult = { candidatesFound: 0, autoApproved: 0, queuedPending: 0, errors: 0 };

  for (let i = 0; i < ATLANTIC_CITIES.length; i++) {
    if (i > 0) await delay(throttleMs);
    const result = await runDiscoveryForCity(i);
    totals.candidatesFound += result.candidatesFound;
    totals.autoApproved += result.autoApproved;
    totals.queuedPending += result.queuedPending;
    totals.errors += result.errors;
  }

  console.log(
    `Discovery complete: ${totals.candidatesFound} new candidates staged, ${totals.autoApproved} auto-approved`
  );

  return totals;
}
