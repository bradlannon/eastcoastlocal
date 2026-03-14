# Phase 2: Data Pipeline - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the automated scraping pipeline that populates the database with real Atlantic Canada live music events. This includes: fetching web pages, AI-powered event extraction via LLM, geocoding venues, deduplicating across sources, integrating Eventbrite/Bandsintown APIs, and scheduling daily cron rescans. The pipeline must be hands-off after configuration.

</domain>

<decisions>
## Implementation Decisions

### LLM extraction
- Use **Gemini Pro** via Vercel AI SDK (`@ai-sdk/google` provider) — user already pays for it
- `generateObject()` + Zod schema for structured extraction (band, venue, date, time, price, ticket link, description, cover image)
- Heavy HTML preprocessing before LLM: strip scripts, styles, nav, footer, ads — send only main content to minimize token cost
- LLM returns a **confidence score (0-1)** per extracted event; reject events below threshold (e.g., 0.5)
- **Reject and log** events with missing required fields (date, performer) — never store garbage data
- Skip events with dates in the past — only store today or future
- Error tracking: update `last_scrape_status` column only. No email/notification alerts for v1. Log failures for manual review.

### Geocoding
- Use **Google Maps Geocoding API** — best accuracy for Canadian addresses
- Geocode once per venue at creation time, cache lat/lng on the `venues` table
- Pre-populate seed venues with manual lat/lng coordinates as primary source
- Geocoder is fallback for newly discovered venues
- If geocoding fails: log the failure, don't show venue on map until coords are available

### Cron scheduling
- **Daily rescan** — once per day, works on Vercel Hobby plan (free)
- **All sources in one cron run** — single sequential pass through all enabled sources
- Vercel cron configured in `vercel.json`
- If source count grows beyond Vercel timeout (60s Hobby / 300s Pro), revisit batching strategy

### Platform API integration
- Eventbrite and Bandsintown APIs are **must-have for v1** — they cover venues without their own websites
- API data goes through the **same normalization and dedup pipeline** as scraped data
- Use official APIs (not scraping their HTML) — research noted this is both legally and technically correct
- Source type distinguishes origin: `venue_website`, `eventbrite`, `bandsintown`

### JS-rendered sites
- Claude's discretion on approach — pragmatic choice between skipping JS sites for v1 or using a scraping service like Firecrawl

### Claude's Discretion
- JS-rendered site handling strategy (skip vs scraping service)
- Multi-event extraction approach (all events vs upcoming only per page)
- Exact confidence score threshold value
- HTML preprocessing implementation details (cheerio vs regex vs other)
- Vercel AI SDK version and exact Gemini model string
- Google Maps API key management approach
- Eventbrite/Bandsintown API key setup and rate limiting strategy

</decisions>

<specifics>
## Specific Ideas

- User already pays for Gemini Pro — use that instead of GPT-4o mini or Claude
- The pipeline should be truly hands-off: configure sources once, cron handles the rest
- Confidence scoring on extraction is important to the user — they want quality control on what enters the database

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db/schema.ts`: Full Drizzle schema for venues, events, scrape_sources — scraper writes to these tables
- `src/lib/db/client.ts`: Lazy Proxy-based Neon HTTP client — import `db` for all database operations
- `src/lib/db/seed-data.ts`: 5 seed venues with addresses across 4 provinces — scraper targets these
- `src/types/index.ts`: TypeScript types via `InferSelectModel`/`InferInsertModel`

### Established Patterns
- Drizzle ORM for all DB operations (not raw SQL)
- Lazy DB client initialization (defers DATABASE_URL to query time)
- Migrations in build step (`npm run db:migrate && next build`)
- `integer()` for FK columns, not `serial()`

### Integration Points
- `scrape_sources` table: scraper reads `url`, `source_type`, `enabled` to know what to scrape
- `venues` table: scraper upserts venues with geocoded coordinates
- `events` table: scraper upserts events using composite dedup key (venue_id + event_date + normalized_performer)
- `vercel.json`: cron configuration for daily rescan trigger
- `/api/` routes: cron hits an API route that triggers the pipeline

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-data-pipeline*
*Context gathered: 2026-03-13*
