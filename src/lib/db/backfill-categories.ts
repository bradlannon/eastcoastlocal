import 'dotenv/config';
import { db } from './client';
import { events } from './schema';
import { isNull } from 'drizzle-orm';

async function backfillCategories() {
  const result = await db
    .update(events)
    .set({ event_category: 'community' })
    .where(isNull(events.event_category))
    .returning({ id: events.id });

  console.log(`Backfilled ${result.length} events with category 'community'`);
}

backfillCategories()
  .catch(console.error)
  .finally(() => process.exit(0));

// Run command: tsx src/lib/db/backfill-categories.ts
