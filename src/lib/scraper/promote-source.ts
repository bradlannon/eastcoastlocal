import 'dotenv/config';
import { db } from '@/lib/db/client';
import { venues, scrape_sources, discovered_sources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Promotes a discovered source from 'pending' status to active scraping.
 * Creates a venue row and inserts into scrape_sources, then marks the
 * discovered_source as 'approved'.
 *
 * Usage (CLI): tsx src/lib/scraper/promote-source.ts <discovered_source_id>
 */
export async function promoteSource(discoveredId: number): Promise<void> {
  // Step 1: Fetch discovered source by ID
  const staged = await db.query.discovered_sources.findFirst({
    where: eq(discovered_sources.id, discoveredId),
  });

  // Step 2: Validate existence and status
  if (!staged) {
    throw new Error(`Discovered source with ID ${discoveredId} not found`);
  }

  if (staged.status !== 'pending') {
    throw new Error(
      `Discovered source ${discoveredId} is not pending (current status: ${staged.status})`
    );
  }

  // Step 3: Create venue row
  // Phase 23: expand to allow 'no_website' status for stub promotion
  const venueName = staged.source_name ?? staged.domain;
  const city = staged.city ?? '';
  const province = staged.province ?? '';
  // Prefer structured address from Places API; fall back to placeholder
  const address = staged.address ?? `${city}, ${province}, Canada`.trim();

  const [venue] = await db
    .insert(venues)
    .values({
      name: venueName,
      address,
      city,
      province,
      ...(staged.lat != null ? { lat: staged.lat } : {}),
      ...(staged.lng != null ? { lng: staged.lng } : {}),
      ...(staged.google_place_id != null ? { google_place_id: staged.google_place_id } : {}),
      ...(staged.place_types != null ? { venue_type: staged.place_types } : {}),
    })
    .returning({ id: venues.id });

  // Step 4: Insert into scrape_sources
  await db.insert(scrape_sources).values({
    url: staged.url,
    venue_id: venue.id,
    source_type: 'venue_website',
    scrape_frequency: 'daily',
    enabled: true,
  });

  // Step 5: Update discovered_sources status to approved with timestamps
  const now = new Date();
  await db
    .update(discovered_sources)
    .set({
      status: 'approved',
      reviewed_at: now,
      added_to_sources_at: now,
    })
    .where(eq(discovered_sources.id, discoveredId));

  // Step 6: Confirmation
  console.log(
    `Promoted discovered source ${discoveredId} (${staged.url}) — venue ID: ${venue.id}`
  );
}

// CLI entry point
if (require.main === module) {
  const arg = process.argv[2];
  const id = parseInt(arg ?? '', 10);

  if (!arg || isNaN(id)) {
    console.error('Usage: tsx src/lib/scraper/promote-source.ts <discovered_source_id>');
    process.exit(1);
  }

  promoteSource(id)
    .then(() => {
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error('Error promoting source:', err.message);
      process.exit(1);
    });
}
