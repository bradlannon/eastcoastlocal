import 'dotenv/config';
import { db } from './client';
import { venues, scrape_sources } from './schema';
import { venueData, sourceData } from './seed-data';

// Re-export seed data so tests can import from seed.ts without needing a DB connection
export { venueData, sourceData } from './seed-data';

async function seed() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');

  if (reset) {
    console.log('Resetting database...');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`DELETE FROM events`);
    await db.execute(sql`DELETE FROM scrape_sources`);
    await db.execute(sql`DELETE FROM venues`);
    console.log('Cleared all tables.');
  }

  console.log('Seeding venues...');

  // Insert venues first (FK constraint)
  const venueRows = await db
    .insert(venues)
    .values(venueData.map((v) => ({ ...v, website: v.website ?? null })))
    .returning();

  console.log(`Inserted ${venueRows.length} venues`);

  // Insert scrape_sources using returned venue IDs
  const sourceRows = await db
    .insert(scrape_sources)
    .values(
      venueRows.map((venue, i) => ({
        url: sourceData[i].url,
        venue_id: venue.id,
        source_type: sourceData[i].source_type,
        scrape_frequency: sourceData[i].scrape_frequency,
        enabled: sourceData[i].enabled,
      }))
    )
    .returning();

  console.log(`Inserted ${sourceRows.length} scrape sources`);
  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
