# Firecrawl Integration

SDK: `@mendable/firecrawl-js`. API key must be set as `FIRECRAWL_API_KEY` in `.env`.

## What it does

Three additions to the scraper pipeline:

| Module | Purpose |
|--------|---------|
| `src/lib/scraper/firecrawl.ts` | Lazy-singleton client wrapper: `scrapeMarkdown(url)` and `extractWithSchema(url, schema)` |
| `src/lib/scraper/fetcher.ts` | Fallback path — when primary fetch fails or returns a suspiciously small body, retries via `scrapeMarkdown` |
| `src/lib/scraper/firecrawl-events.ts` | Standalone AI-extract scraper: calls Firecrawl's JSON-schema extraction against `ExtractedEventSchema` |

## Enabling the fetcher fallback

The fallback is **opt-in** to preserve cost control (default off):

```bash
FIRECRAWL_FALLBACK=1
```

When enabled, `fetchAndPreprocess` will call `scrapeMarkdown(url)` if:
- The primary fetch returns a non-2xx status (e.g. 403 bot block), OR
- The primary response body is under 500 chars (likely a JS shell or redirect page)

If Firecrawl itself fails, that error propagates (no silent fallback-of-a-fallback).

## Invoking `firecrawl-events` manually

```ts
// One-liner from a script or REPL:
import { scrapeEventsWithFirecrawl } from './src/lib/scraper/firecrawl-events';

const events = await scrapeEventsWithFirecrawl('https://venue.com/events');
console.log(events);
```

Or via tsx:
```bash
FIRECRAWL_API_KEY=your_key npx tsx -e "
  import { scrapeEventsWithFirecrawl } from './src/lib/scraper/firecrawl-events';
  scrapeEventsWithFirecrawl('https://venue.com/events').then(e => console.log(JSON.stringify(e, null, 2)));
"
```

## Cost caveat

Each `scrapeMarkdown` or `extractWithSchema` call consumes Firecrawl credits.
- Keep `FIRECRAWL_FALLBACK` unset in production unless actively debugging bot-blocked sources.
- `firecrawl-events` is designed for ad-hoc use or new-source evaluation, not bulk scraping.

## Orchestrator integration (follow-up)

`scrapeEventsWithFirecrawl` is not yet wired into the orchestrator dispatch loop.
The `source_type` enum in `scrape_sources` would need a new value (e.g. `firecrawl_extract`)
before automatic scheduling is possible. See `docs/firecrawl-integration-followups.md`.
