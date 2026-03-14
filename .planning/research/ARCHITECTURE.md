# Architecture Research

**Domain:** Local events discovery with AI-powered web scraping + map frontend
**Researched:** 2026-03-13
**Confidence:** HIGH (Vercel docs verified, scraping pipeline patterns from multiple sources)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      SCHEDULED SCRAPING LAYER                    │
│                                                                   │
│  Vercel Cron Jobs (vercel.json)                                  │
│       ↓ HTTP GET to /api/cron/scrape                             │
│  ┌─────────────────────────────────────────────────┐             │
│  │             Scrape Orchestrator                  │             │
│  │  - Iterates configured source list               │             │
│  │  - Spawns per-source scrape jobs (sequential     │             │
│  │    or batched to respect rate limits)             │             │
│  └──────────────────────┬──────────────────────────┘             │
│                         │                                         │
│          ┌──────────────┼──────────────┐                         │
│          ↓              ↓              ↓                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ Venue Site   │ │  Eventbrite  │ │ Bandsintown  │             │
│  │  Fetcher     │ │   Fetcher    │ │   Fetcher    │             │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘             │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          ↓                                        │
│  ┌─────────────────────────────────────────────────┐             │
│  │              AI Extraction Layer                 │             │
│  │  - Raw HTML/markdown → LLM prompt                │             │
│  │  - Structured JSON output (Zod schema)           │             │
│  │  - OpenAI / Firecrawl Extract                    │             │
│  └──────────────────────┬──────────────────────────┘             │
│                         ↓                                         │
│  ┌─────────────────────────────────────────────────┐             │
│  │           Normalization + Deduplication          │             │
│  │  - Date/time standardization                     │             │
│  │  - Geocoding (venue lat/lng lookup or call)      │             │
│  │  - Dedup by source URL or composite key          │             │
│  └──────────────────────┬──────────────────────────┘             │
└─────────────────────────┼───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                               │
│                                                                   │
│  ┌───────────────────┐       ┌───────────────────┐              │
│  │     events        │       │      venues        │              │
│  │  - id             │       │  - id              │              │
│  │  - title          │  FK   │  - name            │              │
│  │  - performer      │◄──────│  - address         │              │
│  │  - venue_id       │       │  - lat             │              │
│  │  - start_at       │       │  - lng             │              │
│  │  - end_at         │       │  - city            │              │
│  │  - source_url     │       │  - province        │              │
│  │  - scraped_at     │       └───────────────────┘              │
│  └───────────────────┘                                           │
│                                                                   │
│  ┌───────────────────┐                                           │
│  │   scrape_sources  │                                           │
│  │  - id             │                                           │
│  │  - url            │                                           │
│  │  - venue_id (FK)  │                                           │
│  │  - last_scraped   │                                           │
│  │  - enabled        │                                           │
│  └───────────────────┘                                           │
│                                                                   │
│   PostgreSQL (Supabase / Neon) — hosted, no self-management      │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                         API LAYER                                │
│                                                                   │
│  Next.js App Router — Vercel serverless functions                │
│                                                                   │
│  GET /api/events          - list/filter events (date, bbox)      │
│  GET /api/events/[id]     - event detail                         │
│  GET /api/venues          - venue list with coords               │
│  GET /api/cron/scrape     - cron-triggered scrape entry point    │
└─────────────────────────┬───────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                       FRONTEND LAYER                             │
│                                                                   │
│  ┌───────────────────────┐    ┌──────────────────────────┐      │
│  │      Map View          │    │       List View           │      │
│  │  Mapbox GL JS /        │    │  Event cards, filter      │      │
│  │  react-leaflet         │    │  by date / location       │      │
│  │  + Supercluster        │    │                           │      │
│  │    pin clustering      │    │                           │      │
│  └───────────────────────┘    └──────────────────────────┘      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────┐       │
│  │                  Event Detail Panel                    │       │
│  │  Band, venue, date/time, link-out to source            │       │
│  └───────────────────────────────────────────────────────┘       │
│                                                                   │
│  Next.js App Router — static + server components                 │
│  Deployed to Vercel CDN edge                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Cron Orchestrator | Triggers periodic scrapes, iterates sources | Next.js API route called by Vercel cron |
| Page Fetcher | Retrieves raw HTML from a source URL | Playwright / Firecrawl / native fetch |
| AI Extractor | Parses page content into structured event data | OpenAI with JSON schema, or Firecrawl Extract |
| Normalizer | Standardizes dates, cleans strings, validates schema | Zod, date-fns or Temporal API |
| Geocoder | Converts venue address to lat/lng | Mapbox Geocoding API or cached lookup table |
| Deduplicator | Prevents duplicate events across scrape runs | Upsert on source_url or composite key |
| Event Store | Persists events and venue records | PostgreSQL (Supabase or Neon) |
| Events API | Serves events to the frontend with filtering | Next.js App Router route handlers |
| Map View | Displays events as clustered pins on a map | react-map-gl (Mapbox GL JS) or react-leaflet + Supercluster |
| List View | Browseable event list with date/location filters | Next.js server components or client-filtered |
| Admin Config | Manages scrape source URLs and enable/disable | Simple DB table; no UI required for v1 |

## Recommended Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Map view (home)
│   ├── events/
│   │   └── [id]/page.tsx       # Event detail
│   ├── browse/
│   │   └── page.tsx            # List/browse view
│   └── api/
│       ├── events/route.ts     # GET events with bbox/date filters
│       ├── events/[id]/route.ts
│       ├── venues/route.ts
│       └── cron/
│           └── scrape/route.ts # Cron entry point
├── components/
│   ├── map/
│   │   ├── EventMap.tsx        # Map container
│   │   ├── EventMarker.tsx     # Single pin
│   │   └── ClusterMarker.tsx   # Cluster pin
│   ├── events/
│   │   ├── EventCard.tsx
│   │   └── EventDetail.tsx
│   └── ui/                     # Shared UI primitives
├── lib/
│   ├── scraper/
│   │   ├── orchestrator.ts     # Iterates sources, dispatches jobs
│   │   ├── fetcher.ts          # Fetches raw page HTML
│   │   ├── extractor.ts        # LLM-based structured extraction
│   │   ├── normalizer.ts       # Cleans + validates extracted data
│   │   └── geocoder.ts         # Address → lat/lng
│   ├── db/
│   │   ├── client.ts           # Database connection
│   │   ├── events.ts           # Event queries
│   │   ├── venues.ts           # Venue queries
│   │   └── sources.ts          # Scrape source queries
│   └── schemas/
│       ├── event.ts            # Zod schema for extracted event
│       └── venue.ts            # Zod schema for venue
└── types/
    └── index.ts                # Shared TypeScript types
```

### Structure Rationale

- **lib/scraper/:** Isolated from the web layer. Each step (fetch → extract → normalize → geocode) is a pure function that can be tested independently and swapped out without touching the API or UI.
- **lib/db/:** Query functions centralized here. App Router routes import query functions, never raw SQL, keeping data access auditable.
- **app/api/cron/:** Cron endpoint is a plain GET handler — Vercel hits it on schedule. No job queue infra needed for v1 given the small number of sources.
- **components/map/:** Map is isolated from list views. Both consume the same events data shape from the API.

## Architectural Patterns

### Pattern 1: Sequential Per-Source Scraping (not parallel)

**What:** The cron handler fetches sources from the DB one at a time (or in small batches), scraping and upserting before moving to the next.
**When to use:** When total source count is low (< 50 URLs) and politeness/rate limiting matters more than speed.
**Trade-offs:** Slower total scrape time, but no risk of hammering a venue website with concurrent requests. Simpler to reason about costs since LLM calls happen serially.

**Example:**
```typescript
// lib/scraper/orchestrator.ts
export async function runScrapeJob() {
  const sources = await db.query.scrape_sources.findMany({
    where: eq(scrape_sources.enabled, true),
  });

  for (const source of sources) {
    try {
      const html = await fetchPage(source.url);
      const events = await extractEvents(html, source.url);
      const normalized = events.map(normalizeEvent);
      await upsertEvents(normalized, source.venue_id);
      await markSourceScraped(source.id);
    } catch (err) {
      console.error(`Failed to scrape ${source.url}:`, err);
      // Continue to next source — don't abort the whole run
    }
  }
}
```

### Pattern 2: LLM Extraction with Zod Schema

**What:** Convert page HTML to markdown, pass to OpenAI with a Zod-validated JSON schema for event data. The schema defines what fields are required, optional, and their types.
**When to use:** For all venue websites where page structure varies. LLM understands semantic meaning, not CSS paths — resilient to redesigns.
**Trade-offs:** Costs money per page scraped (~$0.001-$0.01/page with GPT-4o-mini). Must validate and handle hallucinations gracefully. Much more resilient than CSS selectors.

**Example:**
```typescript
// lib/schemas/event.ts
export const ExtractedEventSchema = z.object({
  title: z.string(),
  performer: z.string().optional(),
  start_date: z.string(), // ISO 8601
  start_time: z.string().optional(),
  end_date: z.string().optional(),
  end_time: z.string().optional(),
  description: z.string().optional(),
  ticket_url: z.string().url().optional(),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;
```

### Pattern 3: Upsert-Based Deduplication

**What:** When writing events to the database, use an upsert with `source_url` as the unique key. Re-scraping the same event updates the record rather than creating a duplicate.
**When to use:** Always — events get re-scraped on every cron run. Without upsert, the same event accumulates duplicate rows.
**Trade-offs:** Requires a stable unique identifier per event. Source URL is ideal (a specific event page URL). Platform aggregators like Eventbrite provide stable canonical URLs per event.

## Data Flow

### Scraping Flow (triggered by cron)

```
Vercel Cron (schedule: 0 6 * * *)
    ↓ GET /api/cron/scrape
Orchestrator reads scrape_sources from DB
    ↓ for each enabled source:
Fetcher fetches source URL (plain fetch or headless browser)
    ↓ raw HTML/markdown
AI Extractor: HTML → OpenAI → JSON events[]
    ↓ structured but unvalidated events
Normalizer: Zod parse, date standardization, strip nulls
    ↓ validated ExtractedEvent[]
Geocoder: venue address → lat/lng (if not already cached in venues table)
    ↓ events with coordinates
DB Upsert: INSERT ... ON CONFLICT (source_url) DO UPDATE
    ↓
scrape_sources.last_scraped = NOW()
```

### Frontend Read Flow

```
User loads map
    ↓
Next.js Server Component (or Client) → GET /api/events?bbox=...&from=...
    ↓
API route: SQL query filtering by date range + bounding box
    ↓
JSON events[] with lat/lng
    ↓
Mapbox GL JS / Leaflet renders pins
Supercluster clusters pins at current zoom level
    ↓
User clicks cluster → zoom in → pins expand
User clicks pin → Event Detail panel opens
```

### Key Data Flows

1. **Scrape → Store:** One-way pipeline. Cron triggers fetch → extract → normalize → upsert. No user interaction involved.
2. **Store → Map:** API query filtered by map bounding box + date range. All events with lat/lng are eligible. Frontend handles clustering client-side.
3. **Venue Geocoding:** Geocoding happens once per venue when first encountered. Result cached in the `venues` table — never re-geocoded unless address changes.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 sources | Single cron run, sequential scraping, no queue needed |
| 50-500 sources | Split cron into multiple jobs by province/batch, or introduce a lightweight queue (Inngest) |
| 500+ sources | Dedicated worker process outside Vercel, proper job queue (BullMQ + Redis), parallel fetching with rate limiting |

### Scaling Priorities

1. **First bottleneck:** Vercel function timeout. A cron hitting 60+ slow venue sites sequentially will exceed the 300-second limit (Pro plan). Fix: split into batched cron runs or use Inngest for long-running steps that survive timeouts.
2. **Second bottleneck:** LLM API costs and rate limits. At high volume, OpenAI rate limits kick in. Fix: cache extraction results by source URL hash, skip re-extraction if HTML hasn't changed (ETag/content hash).
3. **Third bottleneck:** Database reads under high frontend traffic. Fix: add caching at the API layer (e.g., Vercel's built-in Edge Cache on read-only routes, or Upstash Redis for event lists).

## Anti-Patterns

### Anti-Pattern 1: CSS Selector Scrapers

**What people do:** Write specific CSS selectors (`div.event-title`, `.show-date`) for each venue's website.
**Why it's wrong:** Venue websites redesign frequently. Every redesign silently breaks the scraper — events stop appearing with no error. Maintenance overhead scales with source count.
**Do this instead:** AI extraction with an LLM prompt that understands semantic content. Resilient to layout changes because it reads meaning, not structure.

### Anti-Pattern 2: Scraping Inline with User Requests

**What people do:** When a user loads the page, trigger a fresh scrape and wait for it to complete before rendering.
**Why it's wrong:** Scraping takes seconds to minutes. User experience is destroyed. Vercel function timeout kills the request before it finishes.
**Do this instead:** Pre-populate the database on a schedule. Users always read from the database — fast and reliable. Staleness of a few hours is acceptable for events data.

### Anti-Pattern 3: Storing Only Raw Scraped Data

**What people do:** Dump raw extracted JSON into a blob column without normalizing dates, addresses, or performer names.
**Why it's wrong:** Date formats vary wildly across sources ("Saturday March 15", "2026-03-15", "Mar 15 @ 8pm"). Without normalization, date filtering and sorting breaks. Geocoding can't be applied without a clean address.
**Do this instead:** Normalize at write time (scrape → normalize → store). The database contains clean, structured data. Frontend queries are simple.

### Anti-Pattern 4: Re-Geocoding on Every Scrape

**What people do:** Call the Mapbox Geocoding API for a venue address every time an event at that venue is scraped.
**Why it's wrong:** Venues don't move. Geocoding the same address repeatedly wastes API quota and money. Mapbox Geocoding has a cost per call.
**Do this instead:** Geocode once per venue, cache in the `venues` table. Events inherit lat/lng from their venue via foreign key. Only re-geocode if address changes.

### Anti-Pattern 5: No Idempotency in Cron Jobs

**What people do:** Insert a new row for every scraped event on every cron run.
**Why it's wrong:** Running the cron daily creates an exponentially growing events table full of duplicates. Deduplication becomes a separate cleanup problem.
**Do this instead:** Upsert using `source_url` as the unique conflict key. Each event has one canonical row, updated in place.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenAI API | Called during extraction step with JSON schema prompt | Use `gpt-4o-mini` for cost; batch by page not by event |
| Mapbox Geocoding API | Called once per new venue address | Cache result in venues.lat/lng; ~$0.005/request |
| Mapbox GL JS (frontend) | Client-side map rendering and clustering | Free tier: 50k loads/month; sufficient for v1 |
| Vercel Cron | HTTP GET to /api/cron/scrape on schedule | Pro plan: up to 100 crons, runs within specified minute |
| PostgreSQL (Supabase or Neon) | Direct connection from API routes | Use connection pooling (PgBouncer); Vercel functions are stateless |
| Firecrawl (optional) | Managed crawl + markdown conversion service | Alternative to self-hosting Playwright; handles JS rendering |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Cron handler ↔ Scraper lib | Direct function call (same process) | No queue for v1; orchestrator called directly |
| Scraper ↔ Database | Drizzle ORM / Prisma queries | Scraper writes; API reads; shared schema |
| API routes ↔ Database | Read-only queries from event/venue tables | Parameterized queries; never raw SQL in routes |
| Frontend ↔ API | REST JSON over HTTP | No GraphQL complexity needed; simple GET endpoints |
| Map component ↔ Event data | Props / context (all events fetched once on load) | For small datasets (<5k events) client-side clustering is fine |

## Build Order Implications

The architecture has clear dependency chains that determine what to build first:

1. **Database schema + migrations** — Everything depends on this. Venues, events, and scrape_sources tables must exist before any other component can work.
2. **Scraper library (fetch → extract → normalize → upsert)** — Can be built and tested independently with seed data before the frontend exists.
3. **Geocoding + venue enrichment** — Depends on scraper producing venue records.
4. **Cron route wiring** — Thin wrapper; depends on scraper library working.
5. **Events API routes** — Depends on events being in the database.
6. **Map frontend** — Depends on the API returning events with lat/lng.
7. **List/browse view and event detail** — Depends on the API; can be built in parallel with map.

This order means the scraping pipeline and database are the critical path. The frontend is unblockable until events exist with valid coordinates.

## Sources

- [Vercel Cron Jobs documentation](https://vercel.com/docs/cron-jobs) — HIGH confidence
- [Vercel Cron Jobs: Managing and Duration](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — HIGH confidence
- [Tech Event Discovery Platform architecture (DEV.to)](https://dev.to/danishaft/how-i-built-a-tech-event-discovery-platform-with-real-time-scraping-3o4f) — MEDIUM confidence
- [Events Data Scraping Architecture Guide (GroupBWT)](https://groupbwt.com/blog/events-data-scraping/) — MEDIUM confidence
- [Mapbox GL JS clustering in Next.js](https://riopulok.medium.com/using-mapbox-gl-in-a-next-js-app-large-scale-data-visualization-with-clustering-and-bounds-loading-3bc61735608b) — MEDIUM confidence
- [Supercluster library (Mapbox)](https://github.com/mapbox/supercluster) — HIGH confidence
- [Firecrawl Extract (structured LLM extraction)](https://docs.firecrawl.dev/v0/features/extract) — MEDIUM confidence
- [Crawl4AI LLM Strategies](https://docs.crawl4ai.com/extraction/llm-strategies/) — MEDIUM confidence
- [AI Web Scraping in 2026 (Morph)](https://www.morphllm.com/ai-web-scraping) — MEDIUM confidence

---
*Architecture research for: Local events discovery — AI scraping + map frontend + Vercel*
*Researched: 2026-03-13*
