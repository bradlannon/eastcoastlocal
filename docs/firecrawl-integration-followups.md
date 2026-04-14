# Firecrawl Integration — Follow-ups

## 1. Orchestrator dispatch for `firecrawl-events`

`scrapeEventsWithFirecrawl` in `src/lib/scraper/firecrawl-events.ts` is not yet
wired into the orchestrator (`src/lib/scraper/orchestrator.ts`) because it requires:

1. A new enum value in `scrape_sources.source_type` (e.g. `firecrawl_extract`) —
   this is a DB schema migration.
2. A new `else if (source.source_type === 'firecrawl_extract')` branch in both
   `runScrapeForProvince` and `scrapeOneSource`.
3. Cost guard: consider gating behind a per-source flag or a daily credit budget
   check before enabling for bulk scraping.

## 2. Firecrawl fallback in fetcher — rate limiting

The current fallback shares the domain rate-limiter with the primary fetch path,
but Firecrawl has its own rate limits. If a domain is frequently bot-blocked and
fallback is enabled, the per-domain `domainLastRequest` state from the failed primary
fetch still applies — meaning Firecrawl calls for that domain won't be double-delayed.
This is probably fine, but worth revisiting if Firecrawl starts returning 429s.

## 3. `__resetForTests` export in firecrawl.ts

`__resetForTests` is exported from the production module for test isolation.
If preferred, this can be refactored to use Jest's module reset (`jest.resetModules()`)
or a separate test-only barrel instead.
