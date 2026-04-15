# Firecrawl Integration — Follow-ups

## 1. ✅ DONE — Orchestrator dispatch for `firecrawl-events` (commit 049018c)

`scrapeEventsWithFirecrawl` is now wired into both `runScrapeForProvince` and
`scrapeOneSource` in `src/lib/scraper/orchestrator.ts`.

Notes:
- `scrape_sources.source_type` is free-text (not an enum) — **no DB migration
  was needed**. A row with `source_type = 'firecrawl_extract'` can be inserted
  directly via SQL or a seed script.
- Cost guard implemented: both dispatch sites check
  `process.env.FIRECRAWL_SCRAPE_ENABLED === '1'` before calling Firecrawl.
  If not set, the source is skipped with a log message and 0 events — no error.
- Events flow through the standard `upsertEvent` pipeline identical to
  `venue_website` and `facebook_page` sources.

## 1b. Admin UI to create `firecrawl_extract` scrape_sources (future work)

Currently, `firecrawl_extract` rows must be inserted via SQL or a seed script —
there is no admin interface for creating sources with this type. A future task
should add a UI form (or at minimum a seeding utility) to make it easy to onboard
new Firecrawl-powered sources without direct DB access.

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
