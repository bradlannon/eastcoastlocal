import { fetchAllWpEventFeeds } from '@/lib/scraper/wordpress-events';

async function main() {
  console.log('Fetching all event feeds...\n');
  const results = await fetchAllWpEventFeeds();

  for (const r of results) {
    const status = r.errors > 0 ? '✗' : '✓';
    console.log(`  ${status} ${r.feedName}: ${r.eventsUpserted}/${r.eventsFound} upserted${r.errors > 0 ? ` (${r.errors} errors)` : ''}`);
  }

  const totals = results.reduce(
    (acc, r) => ({ found: acc.found + r.eventsFound, upserted: acc.upserted + r.eventsUpserted, errors: acc.errors + r.errors }),
    { found: 0, upserted: 0, errors: 0 }
  );
  console.log(`\nTotal: ${totals.upserted}/${totals.found} events upserted, ${totals.errors} errors`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
