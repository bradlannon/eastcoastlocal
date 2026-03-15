import 'dotenv/config';

/**
 * One-time seed script: creates 4 placeholder venues + 4 scrape_sources rows for
 * Ticketmaster Discovery API integration (one per Atlantic Canada province).
 *
 * These placeholder venues satisfy the NOT NULL FK constraint on scrape_sources.venue_id.
 * They are never used as event venues — scrapeTicketmaster() resolves real venues at
 * runtime via findOrCreateVenue().
 *
 * Run with: npx tsx scripts/seed-ticketmaster.ts
 * Requires: DATABASE_URL in environment
 */

import { db } from '@/lib/db/client';
import { venues, scrape_sources } from '@/lib/db/schema';

async function seed() {
  console.log('Seeding Ticketmaster placeholder venues and scrape_sources...');

  // 1. Insert 4 placeholder venues — one per Atlantic Canada province
  const placeholders = [
    { name: 'Ticketmaster NB', address: 'Various', city: 'Various', province: 'NB' },
    { name: 'Ticketmaster NS', address: 'Various', city: 'Various', province: 'NS' },
    { name: 'Ticketmaster PE', address: 'Various', city: 'Various', province: 'PE' },
    { name: 'Ticketmaster NL', address: 'Various', city: 'Various', province: 'NL' },
  ];

  const insertedVenues = await Promise.all(
    placeholders.map(async (v) => {
      const result = await db
        .insert(venues)
        .values(v)
        .onConflictDoNothing()
        .returning({ id: venues.id, name: venues.name, province: venues.province });
      return result[0];
    })
  );

  console.log('Inserted/skipped placeholder venues:', insertedVenues);

  // Retrieve venue IDs (whether just inserted or already existing)
  const allVenues = await db.query.venues.findMany({
    where: (v, { inArray }) =>
      inArray(v.name, ['Ticketmaster NB', 'Ticketmaster NS', 'Ticketmaster PE', 'Ticketmaster NL']),
  });

  const getVenueId = (province: string) => {
    const match = allVenues.find((v) => v.name === `Ticketmaster ${province}`);
    if (!match) throw new Error(`Placeholder venue for ${province} not found after insert`);
    return match.id;
  };

  const nbId = getVenueId('NB');
  const nsId = getVenueId('NS');
  const peId = getVenueId('PE');
  const nlId = getVenueId('NL');

  console.log(`Venue IDs — NB:${nbId}, NS:${nsId}, PE:${peId}, NL:${nlId}`);

  // 2. Insert 4 scrape_sources rows — one per province
  const sources = [
    { url: 'ticketmaster:province:NB', venue_id: nbId, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
    { url: 'ticketmaster:province:NS', venue_id: nsId, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
    { url: 'ticketmaster:province:PE', venue_id: peId, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
    { url: 'ticketmaster:province:NL', venue_id: nlId, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
  ];

  const insertedSources = await db
    .insert(scrape_sources)
    .values(sources)
    .onConflictDoNothing()
    .returning({ id: scrape_sources.id, url: scrape_sources.url });

  console.log('Inserted/skipped scrape_sources:', insertedSources);
  console.log('Done! 4 TM placeholder venues and 4 scrape_sources rows are in place.');
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

export { seed };
