# Phase 1: Foundation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Project scaffold on Vercel with Next.js 16, Neon Postgres database with full schema for events/venues/sources, and a seeded list of scrape targets across Atlantic Canada. This phase delivers the infrastructure and data model that Phase 2 (scraping pipeline) builds on.

</domain>

<decisions>
## Implementation Decisions

### Schema design
- Separate `venues` table: name, address, lat/lng, province, city, website, phone, venue_type (pub, concert hall, outdoor, etc.)
- `events` table referencing venue by FK: band/performer name, date, time, source_url, scrape_timestamp, raw_extracted_text, price (nullable), ticket_link (nullable), description (nullable), cover_image_url (nullable)
- Deduplication via composite key: venue_id + event_date + normalized_band_name (lowercased, trimmed)
- Source tracking fields on events: source_url, scrape_timestamp, raw extracted text for debugging
- Index on event_date for date filtering queries

### Source configuration
- `scrape_sources` database table (not config file) for managing scrape targets
- Fields per source: url, venue_name (FK to venues), scrape_frequency (daily/weekly), last_scraped_at, last_scrape_status (success/failure/pending), source_type (venue_website, eventbrite, bandsintown)
- Sources managed via seed script initially; admin UI can come later

### Initial sources
- Seed 5-10 venues across all four provinces (at least one from NB, NS, PEI, NL)
- Claude selects specific venues based on which have scrapeable event pages

### Project structure
- Next.js 16 with App Router
- Tailwind CSS for styling
- Drizzle ORM for database (from research recommendation)
- Neon Postgres (serverless, Vercel-native)

### Claude's Discretion
- Exact src/ directory layout and folder conventions
- Component library choice (shadcn/ui or similar)
- Drizzle migration strategy
- Seed script implementation approach
- TypeScript configuration details

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the foundation layer.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project

### Established Patterns
- None — patterns will be established in this phase

### Integration Points
- Vercel deployment pipeline (vercel.json for cron config in Phase 2)
- Neon Postgres connection string via environment variable
- Drizzle schema definitions will be imported by Phase 2 scraper code

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-13*
