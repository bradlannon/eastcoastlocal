import 'dotenv/config';
import { detectAndTagSeries } from '@/lib/series-detector';

async function main() {
  const result = await detectAndTagSeries();
  console.log(`[backfill-series] ${result.seriesUpserted} series upserted, ${result.eventsTagged} events tagged`);
}

main().catch(console.error).finally(() => process.exit(0));

// Run: tsx src/lib/db/backfill-series.ts
