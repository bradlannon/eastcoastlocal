/**
 * Seed community event websites as scrape sources.
 *
 * These are high-value Atlantic Canada event listing pages that should be
 * scraped via the existing venue_website pipeline (got-scraping + Gemini AI).
 *
 * Run: npx tsx scripts/seed-community-sites.ts
 * Requires: DATABASE_URL in environment
 */
import 'dotenv/config';
import { db } from '../src/lib/db/client';
import { venues, scrape_sources } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

interface CommunitySite {
  name: string;
  url: string;
  province: string;
  city: string;
  maxPages: number;
}

const COMMUNITY_SITES: CommunitySite[] = [
  {
    name: 'The Coast Events (Halifax)',
    url: 'https://www.thecoast.ca/halifax/EventSearch',
    province: 'NS',
    city: 'Halifax',
    maxPages: 2,
  },
  {
    name: 'Halifax Municipal Events',
    url: 'https://www.halifax.ca/parks-recreation/events',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'Discover Halifax Events',
    url: 'https://discoverhalifaxns.com/events/',
    province: 'NS',
    city: 'Halifax',
    maxPages: 2,
  },
  {
    name: 'Downtown Halifax Events',
    url: 'https://downtownhalifax.ca/events',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'Digital Nova Scotia Events',
    url: 'https://digitalnovascotia.com/events/',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'East Coast Festivals',
    url: 'https://eastcoastfestivals.org',
    province: 'NS',
    city: '',
    maxPages: 2,
  },
  {
    name: 'Build Nova Scotia Events',
    url: 'https://buildns.ca/visit/halifax/halifax-events/',
    province: 'NS',
    city: 'Halifax',
    maxPages: 1,
  },
  {
    name: 'Confederation Centre of the Arts',
    url: 'https://confederationcentre.com/whats-on/',
    province: 'PEI',
    city: 'Charlottetown',
    maxPages: 1,
  },
  {
    name: 'Arts Culture New Brunswick',
    url: 'https://artsculturenb.ca/en/events/',
    province: 'NB',
    city: '',
    maxPages: 1,
  },
];

async function main() {
  console.log(`Seeding ${COMMUNITY_SITES.length} community event sites...`);

  let created = 0;
  let skipped = 0;

  for (const site of COMMUNITY_SITES) {
    // Check if source URL already exists
    const existing = await db.query.scrape_sources.findFirst({
      where: eq(scrape_sources.url, site.url),
    });
    if (existing) {
      console.log(`  ⊘ ${site.name}: already exists (source ${existing.id})`);
      skipped++;
      continue;
    }

    // Find or create a venue for this site
    let venue = await db.query.venues.findFirst({
      where: eq(venues.name, site.name),
    });

    if (!venue) {
      const [newVenue] = await db.insert(venues).values({
        name: site.name,
        address: site.city || site.province,
        city: site.city,
        province: site.province,
      }).returning();
      venue = newVenue;
    }

    // Insert scrape source
    await db.insert(scrape_sources).values({
      url: site.url,
      venue_id: venue.id,
      source_type: 'venue_website',
      enabled: true,
      max_pages: site.maxPages,
    });

    console.log(`  ✓ ${site.name}: created (venue ${venue.id})`);
    created++;
  }

  console.log(`Done: ${created} created, ${skipped} skipped`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
