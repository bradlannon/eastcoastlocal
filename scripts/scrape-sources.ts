/**
 * Scrape specific sources by ID.
 * Usage: npx tsx scripts/scrape-sources.ts 679 680 681 ...
 * Or no args to scrape all stale sources.
 */
import 'dotenv/config';
import { scrapeOneSource, getStaleSources } from '@/lib/scraper/orchestrator';

async function main() {
  const args = process.argv.slice(2);

  let sourceIds: number[];
  if (args.length > 0) {
    sourceIds = args.map(Number).filter(n => !isNaN(n));
  } else {
    const stale = await getStaleSources();
    sourceIds = stale.map(s => s.id);
    console.log(`Found ${sourceIds.length} stale sources`);
  }

  let success = 0;
  let failed = 0;
  let totalEvents = 0;

  for (const id of sourceIds) {
    try {
      const result = await scrapeOneSource(id);
      const status = result.success ? '✓' : '✗';
      console.log(`  ${status} Source ${id}: ${result.venueName} — events=${result.events}`);
      if (result.success) success++; else failed++;
      totalEvents += result.events;
    } catch (err) {
      console.error(`  ✗ Source ${id}: ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed, ${totalEvents} events`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
