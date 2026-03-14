# Architecture Research

**Domain:** Automatic venue/source discovery + AI event categorization — integration with existing scraping pipeline
**Researched:** 2026-03-14
**Confidence:** HIGH (based on direct codebase inspection + verified Vercel docs)

> This document supersedes the v1.1 heatmap timelapse architecture file. The existing scraping/data-layer and frontend sections are retained where still accurate; this file adds a focused integration design for the v1.2 Event Discovery milestone.

---

## Existing Architecture (Verified from Codebase — Still Current)

### Scraping Pipeline

```
/api/cron/scrape (GET, daily at 06:00 UTC)
    ↓
runScrapeJob()  [orchestrator.ts]
    ↓ iterates scrape_sources WHERE enabled = true
    ├── source_type = 'venue_website'
    │       ↓
    │   fetchAndPreprocess(url)      [fetcher.ts]    → raw page text
    │       ↓
    │   extractEvents(text, url)     [extractor.ts]  → Gemini call → ExtractedEvent[]
    │       ↓
    │   upsertEvent(venue_id, event) [normalizer.ts] → INSERT ON CONFLICT DO UPDATE
    │
    ├── source_type = 'eventbrite'
    │       ↓
    │   scrapeEventbrite(source)     [eventbrite.ts]
    │
    └── source_type = 'bandsintown'
            ↓
        scrapeBandsintown(source)    [bandsintown.ts]
```

### Database Schema (Current)

```
venues
  id, name, address, city, province, lat, lng, website, phone, venue_type, created_at

events
  id, venue_id (FK), performer, normalized_performer, event_date, event_time,
  source_url, scrape_timestamp, raw_extracted_text, price, ticket_link,
  description, cover_image_url, created_at, updated_at
  UNIQUE INDEX: (venue_id, event_date, normalized_performer)

scrape_sources
  id, url, venue_id (FK), scrape_frequency, last_scraped_at, last_scrape_status,
  source_type, enabled, created_at
```

### Frontend Data Flow (Current)

```
mount
  ↓
fetch('/api/events')               — loads ALL future events once
  ↓
allEvents (EventWithVenue[])       — held in HomeContent state
  ↓
filterByDateRange + filterByProvince + filterByBounds  — client-side
  ↓
sidebarEvents → EventList
allEvents     → MapClientWrapper (ClusterLayer shows all)
```

### Key Constraint: Vercel Function Duration

**Updated finding (HIGH confidence — verified against Vercel docs March 2026):**

With Fluid Compute enabled (the default for all new projects as of April 23, 2025), the Hobby plan receives:
- Default max duration: **300 seconds (5 minutes)**
- Maximum configurable: **300 seconds (5 minutes)**

The old 60-second limit applies only if Fluid Compute is disabled. The existing codebase sets `export const maxDuration = 60` in the scrape cron, which works but is unnecessarily conservative. This constraint is significantly less restrictive than previously assumed, giving the discovery job sufficient headroom.

---

## v1.2 Integration Design

### What Is Being Added

1. **event_category column on events** — Gemini assigns a category during extraction
2. **discovered_sources table** — queue for candidate sources found by discovery
3. **Discovery pipeline** — separate cron job that finds new venue URLs via search and queues them
4. **Category filter** — new chip filter in `EventFilters` component; category passed via nuqs URL param

### Schema Changes

```sql
-- Add to events table
ALTER TABLE events ADD COLUMN event_category TEXT;

-- New table for discovery pipeline
CREATE TABLE discovered_sources (
  id          SERIAL PRIMARY KEY,
  url         TEXT NOT NULL UNIQUE,
  source_name TEXT,                          -- candidate venue/org name
  province    TEXT,                          -- NB, NS, PEI, NL
  city        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | duplicate
  discovery_method TEXT,                     -- 'search_api', 'gemini_grounding', 'manual'
  raw_context TEXT,                          -- snippet/description from discovery source
  discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  added_to_sources_at TIMESTAMP
);
```

**Why a separate `discovered_sources` table rather than writing directly to `scrape_sources`:**

Discovery is speculative. A search query for "event venues in Halifax" may return irrelevant, duplicate, or low-quality URLs. Writing directly to `scrape_sources` means junk URLs get scraped the same night they are found. The queue table allows:
- Manual or automated review before promotion
- Deduplication against existing `scrape_sources.url`
- Tracking of which discovery method found what

**Why `event_category` is nullable:**

Existing events in the database have no category. New events get categories during extraction. Null = uncategorized (pre-v1.2 data or extraction that returned no category). The filter UI treats null events as showing in "All" but not in a specific category chip.

---

## Discovery Pipeline

### Approach: Gemini with Google Search Grounding

The Gemini API supports grounding with Google Search, which allows the model to search the web as part of answering a prompt. This is a first-class Gemini API feature (available via `@ai-sdk/google` with `useSearchGrounding` option). It is the lowest-friction approach for a Vercel-hosted app that already uses Gemini.

**Alternative considered — SerpAPI/SearchAPI:** Third-party Google Search APIs (SerpAPI, HasData, SearchAPI.io) return structured JSON of search results. These would require an additional API key and monthly cost. The Gemini grounding approach uses the existing Gemini API key. SerpAPI is better for scraping the Google Events page specifically (structured event data), but the primary need here is venue URL discovery, not event data extraction.

**Recommendation:** Use Gemini grounding for initial URL discovery. The model can be prompted to return a structured list of `{ name, url, city, province }` objects from search results. This requires no additional API keys.

### Discovery Pipeline Flow

```
/api/cron/discover (GET, daily — separate schedule from scrape)
    ↓
runDiscoveryJob()  [scraper/discovery-orchestrator.ts]
    ↓
For each Atlantic Canada city/province combination:
    ↓
discoverVenueUrls(city, province)  [scraper/discoverer.ts]
    ↓
Gemini call with Google Search grounding:
  prompt: "Find websites for event venues (music, theatre, comedy,
           festivals, community events) in {city}, {province}, Canada.
           Return: { name, url, city, province }[]"
    ↓
Gemini returns list of candidate venues with URLs
    ↓
deduplicateAgainstExisting(candidates)
  → filter out URLs already in scrape_sources.url
  → filter out URLs already in discovered_sources.url
    ↓
insertDiscoveredSources(newCandidates)
  → INSERT INTO discovered_sources ... ON CONFLICT (url) DO NOTHING
```

**Why this runs as a separate cron rather than inside runScrapeJob:**

- The scrape job and discovery job have different time budgets. Scraping 26 sources takes ~2 minutes with throttling. Discovery requires multiple search calls and may take 1-3 minutes for all city/province combinations. Combining them risks one failing and taking down the other.
- Discovery is fundamentally different in character — it produces candidates, not events. Having it in a separate function keeps responsibilities clean.
- On Vercel Hobby, both cron jobs can run daily. The `vercel.json` supports up to 100 cron entries per project, with no per-project limit on Hobby (confirmed via Vercel docs).
- Discovery does not need to run at the same time as scraping. Running it at a different hour distributes load.

### Discovery Cron Schedule

```json
// vercel.json addition
{
  "crons": [
    { "path": "/api/cron/scrape", "schedule": "0 6 * * *" },
    { "path": "/api/cron/discover", "schedule": "0 4 * * *" }
  ]
}
```

Discovery runs at 04:00 UTC (before scrape at 06:00). Any new sources approved between 04:00 and 06:00 would be picked up that same morning. In practice, automated approval (if implemented) would be immediate; manual approval would defer to the next day.

### Promotion Flow: discovered_sources → scrape_sources

A discovered source is not scraped until it is promoted. Promotion means:

1. A record exists in `discovered_sources` with `status = 'pending'`
2. An admin or automated step sets `status = 'approved'`
3. The promotion step creates corresponding `venues` and `scrape_sources` records
4. `discovered_sources.added_to_sources_at` is set and `status` updated to `'approved'` with timestamp

For v1.2, promotion can be manual (direct DB update or a simple admin endpoint). An automated approval heuristic (e.g., "if discovery confidence > 0.8, auto-approve") is a future optimization.

---

## AI Categorization Integration

### Where Categorization Happens: Inside extractEvents()

Categorization is added to the existing Gemini extraction call in `extractor.ts`. It is **not** a second LLM call — the category is returned as part of the same structured output schema.

```typescript
// Extend ExtractedEventSchema in extracted-event.ts
const EVENT_CATEGORIES = [
  'live_music',
  'comedy',
  'theatre',
  'festival',
  'community',
  'sports',
  'arts',
  'film',
  'other',
] as const;

// Add to z.object inside ExtractedEventSchema:
event_category: z.enum(EVENT_CATEGORIES).nullable(),
```

The extractor prompt is updated to include:
- An explicit instruction to classify each event's `event_category` from the defined enum
- Removal of the "live music only" filter constraint (since v1.2 expands to all event types)
- Updated confidence rules that apply to all event types, not just music

**Why not a separate categorization pass:** Each Gemini call costs time and money. The model already reads the full event description to determine performer, date, etc. Category is trivially determinable from the same context window. Adding it to the existing call costs essentially nothing.

### Category Stored on events Table

The `event_category` column is written by `upsertEvent()` in `normalizer.ts`:

```typescript
// normalizer.ts — add to INSERT values and ON CONFLICT SET
event_category: extracted.event_category ?? null,
```

The `ON CONFLICT DO UPDATE` set should include `event_category` so that if a source previously scraped as null gets re-scraped after the v1.2 deploy, the category is backfilled.

### Extractor Prompt: "Live Music Only" Constraint Removed

The current extractor prompt contains:

> "Only include LIVE music events (not DJ sets that aren't music events, trivia nights, etc.)"

This is replaced with:

> "Include all events: live music, comedy, theatre, sports, festivals, community events, etc. Exclude non-events (trivia nights, recurring bar specials, happy hours, open mic sign-ups that aren't events)."

The confidence threshold logic remains: `confidence < 0.5` → filtered out. The model should assign low confidence to things that are clearly not events.

---

## Category Filtering: Frontend Integration

### Filter Flow

```
EventFilters (existing component)
  ↓ add: category nuqs param (?category=live_music)
  ↓
HomeContent useMemo filter chain
  ↓ add: filterByCategory(events, category)
  ↓
sidebarEvents → EventList
allEvents filtered by category → MapClientWrapper (cluster layer)
```

### Changes to EventFilters

A new row of category chips is added below the existing date chips. The category filter is only visible in cluster mode (same as the date filter — both are hidden during timelapse).

```typescript
// New nuqs param
const [category, setCategory] = useQueryState('category');

const CATEGORY_CHIPS = [
  { value: null, label: 'All' },
  { value: 'live_music', label: 'Live Music' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'theatre', label: 'Theatre' },
  { value: 'festival', label: 'Festival' },
  { value: 'community', label: 'Community' },
] as const;
```

The category filter integrates cleanly with the existing nuqs pattern. It is URL-persistent and shareable (e.g., `?category=comedy&province=NS` works naturally).

### Changes to /api/events Route

The category filter is applied **client-side**, consistent with existing date and province filtering. No server-side query parameter is needed.

However, `event_category` must be returned from the `/api/events` endpoint. Because the query uses `db.select().from(events)` which selects all columns, adding the column to the schema is sufficient — no route changes required.

### filterByCategory Utility

```typescript
// lib/filter-utils.ts — new function
export function filterByCategory(
  events: EventWithVenue[],
  category: string | null
): EventWithVenue[] {
  if (!category) return events;
  return events.filter((e) => e.events.event_category === category);
}
```

Added to the existing filter chain in `HomeContent`:

```typescript
const dateFiltered = filterByDateRange(allEvents, when);
const categoryFiltered = filterByCategory(dateFiltered, category);
const provinceFiltered = filterByProvince(categoryFiltered, province);
const sidebarEvents = filterByBounds(provinceFiltered, bounds);
```

The map cluster layer should also respect the category filter so that pins on the map match what's in the sidebar:

```typescript
// In HomeContent, derive filtered events for map layer
const mapEvents = useMemo(() => filterByCategory(allEvents, category), [allEvents, category]);
// Pass mapEvents to MapClientWrapper instead of allEvents
```

---

## Revised System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         VERCEL CRON JOBS                              │
│                                                                        │
│  04:00 UTC: /api/cron/discover          06:00 UTC: /api/cron/scrape  │
│      ↓                                       ↓                        │
│  runDiscoveryJob()                      runScrapeJob()                │
│  [discovery-orchestrator.ts]            [orchestrator.ts]             │
│      ↓                                       ↓                        │
│  discoverVenueUrls()                    for each scrape_source:       │
│  [discoverer.ts]                         fetchAndPreprocess()         │
│  Gemini + Google Search Grounding        extractEvents()  ← MODIFIED  │
│      ↓                                   (now extracts category)      │
│  INSERT discovered_sources               upsertEvent()   ← MODIFIED  │
│  (pending status)                        (stores category)            │
│      ↓                                                                 │
│  [promotion step — manual or auto]                                    │
│      ↓                                                                 │
│  INSERT venues + scrape_sources                                        │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                         NEON POSTGRES                                  │
│                                                                        │
│  venues              events              scrape_sources               │
│  (unchanged)         (+ event_category)  (unchanged)                  │
│                                                                        │
│  discovered_sources  (NEW)                                             │
│  status: pending → approved → added                                   │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                       │
│                                                                        │
│  /api/events (unchanged route, now includes event_category column)    │
│      ↓                                                                 │
│  HomeContent                                                           │
│  allEvents → filterByCategory → filterByDateRange → filterByProvince  │
│            → filterByBounds → sidebarEvents → EventList               │
│      ↓                                                                 │
│  EventFilters (+ category chip row)                                   │
│  URL params: ?when, ?province, ?category (all nuqs)                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown: New vs Modified

### New Files

| File | Type | Responsibility |
|------|------|---------------|
| `src/lib/scraper/discovery-orchestrator.ts` | Server | Discovery cron entry point; iterates city/province combos; calls discoverer; deduplicates; inserts to discovered_sources |
| `src/lib/scraper/discoverer.ts` | Server | Single city/province discovery call; Gemini + Google Search grounding; returns `{ name, url, city, province }[]` |
| `src/app/api/cron/discover/route.ts` | API Route | Auth + calls runDiscoveryJob(); `export const maxDuration = 300` |
| `drizzle migration` | SQL | Add `event_category` to events; create `discovered_sources` table |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/schemas/extracted-event.ts` | Add `event_category: z.enum([...]).nullable()` to ExtractedEventSchema |
| `src/lib/scraper/extractor.ts` | Update prompt: remove "live music only" constraint; add category classification instruction |
| `src/lib/scraper/normalizer.ts` | Write `event_category` in INSERT values and ON CONFLICT SET |
| `src/lib/db/schema.ts` | Add `event_category: text('event_category')` to events table definition |
| `src/lib/filter-utils.ts` | Add `filterByCategory()` function |
| `src/components/events/EventFilters.tsx` | Add category chip row; add `category` nuqs param |
| `src/app/page.tsx` (HomeContent) | Add `category` to filter chain; pass filtered events to map layer |
| `src/types/index.ts` | EventWithVenue type picks up new column automatically (Drizzle InferSelectModel) |
| `vercel.json` | Add discovery cron entry |

### Unchanged Files

| File | Why Unchanged |
|------|--------------|
| `src/app/api/events/route.ts` | `db.select()` returns all columns; new column flows through automatically |
| `src/lib/scraper/fetcher.ts` | Discovery uses Gemini grounding, not fetcher |
| `src/lib/scraper/geocoder.ts` | Geocoding happens at venue creation time — unchanged |
| `src/components/map/` (all) | Map layers receive filtered events; no awareness of categories needed |
| `src/components/events/EventList.tsx` | Receives already-filtered events; no changes needed |

---

## Build Order

Dependencies flow strictly downward. Each item can start only after the items above it are complete.

```
1. DB schema migration
   Add event_category to events.
   Create discovered_sources table.
   Run migration. Verify columns exist.
   (Prerequisite for everything else — schema changes must be live first)

2. ExtractedEventSchema update + extractor.ts prompt update
   Add event_category to schema.
   Update prompt: remove live-music filter, add all-event-types + category instruction.
   Test with a real venue URL to verify category extraction works.
   (No DB dependency beyond events table having the column from step 1)

3. normalizer.ts: write event_category to DB
   Add event_category to INSERT values and ON CONFLICT SET.
   Integration test: run a scrape, verify events.event_category is populated.
   (Depends on steps 1 + 2)

4. filter-utils.ts: add filterByCategory()
   Pure function, no dependencies. Can be done in parallel with steps 2-3.
   Unit test: verify null category returns all, specific category filters correctly.

5. EventFilters.tsx + HomeContent: category filter UI
   Add category nuqs param.
   Add category chips to EventFilters.
   Wire filterByCategory into HomeContent filter chain.
   Wire category-filtered events to MapClientWrapper.
   (Depends on step 4; can begin before step 3 with mock data)

6. discoverer.ts + discovery-orchestrator.ts
   Implement Gemini-grounded discovery.
   Implement deduplication against scrape_sources.url.
   Implement insert to discovered_sources.
   Test with a single city (e.g., Halifax) before all provinces.
   (Independent of steps 2-5; depends only on step 1 for discovered_sources table)

7. /api/cron/discover route + vercel.json cron entry
   Wire route to runDiscoveryJob().
   Add cron schedule to vercel.json.
   Deploy and verify cron fires correctly.
   (Depends on step 6)

8. Promotion mechanism
   Script or endpoint to approve discovered_sources and create venues/scrape_sources.
   Can be a simple DB query or minimal admin endpoint.
   (Depends on step 7 having run and populated discovered_sources with real data)
```

**Parallelizable:** Steps 2-3 (extractor changes) and step 6 (discoverer) are independent. Step 4 (filterByCategory) can be written at any point. Steps 2-3 directly improve the existing scrape pipeline and can be deployed independently before the discovery pipeline is complete.

---

## Architectural Patterns

### Pattern 1: Extend Existing Extraction, Don't Add a Second LLM Call

**What:** Add `event_category` to the existing Gemini extraction schema rather than running a separate classification pass after extraction.

**When to use:** Any new attribute that can be inferred from the same page content the extractor already reads.

**Trade-offs:** Fewer API calls (cost + speed). Risk: adding fields to the schema prompt may slightly reduce extraction accuracy for existing fields — test with a few URLs before deploying. In practice, Gemini handles additional output fields well, especially when they have a constrained enum.

### Pattern 2: Discovery Queue with Manual Promotion Gate

**What:** Discovery writes to `discovered_sources` with `status = 'pending'`. Scraped content only comes from `scrape_sources`. Promotion is an explicit step.

**When to use:** Any automated pipeline that generates candidate data of uncertain quality.

**Trade-offs:** Adds latency to new source onboarding (can't scrape a newly discovered venue until it's approved). This is intentional — quality control. The tradeoff is worth it to avoid scraping junk URLs. Future automation can reduce latency (auto-approve if confidence > threshold).

### Pattern 3: Client-Side Category Filtering via nuqs

**What:** Category is a URL param (`?category=live_music`) filtered client-side, consistent with existing `?when` and `?province` params.

**When to use:** For data volumes where the full event set fits in browser memory. Current Atlantic Canada scope is well within this range.

**Trade-offs:** If categories become high-cardinality or the event set grows beyond ~10k records, adding a server-side `?category=` query param to `/api/events` becomes worthwhile to reduce payload size. Not needed for v1.2.

### Pattern 4: Separate Cron Routes for Separate Concerns

**What:** `/api/cron/scrape` and `/api/cron/discover` are separate routes with separate schedules.

**When to use:** When two background jobs have different cadences, different failure modes, or different time budgets.

**Trade-offs:** Slightly more infrastructure (two routes, two cron entries in vercel.json). The benefit is clean isolation — a discovery job failure does not affect scraping, and vice versa.

---

## Anti-Patterns

### Anti-Pattern 1: Writing Discovered Sources Directly to scrape_sources

**What people do:** Skip the `discovered_sources` queue; immediately add discovered URLs to `scrape_sources` with `enabled = true`.

**Why it's wrong:** Discovery returns speculative results. Gemini may return duplicate URLs, irrelevant websites, or URLs for venues outside the target geography. Auto-activating these means junk URLs get scraped nightly, wasting AI quota and polluting the events table.

**Do this instead:** Queue to `discovered_sources` with `status = 'pending'`. Promote after review (manual or automated confidence threshold).

### Anti-Pattern 2: Running Discovery Inside runScrapeJob()

**What people do:** Add discovery as a step at the start or end of the existing scrape orchestrator.

**Why it's wrong:** Couples two independent concerns. A discovery failure can abort the scrape. The combined job may exceed the function timeout. Scrape frequency (daily, by source) and discovery cadence (by city) are fundamentally different loops.

**Do this instead:** Separate cron routes. Both can be daily on Hobby plan. Stagger by 2 hours.

### Anti-Pattern 3: Running a Second LLM Call for Categorization

**What people do:** After extracting events, pass each event's description back to Gemini to classify it.

**Why it's wrong:** Doubles the number of Gemini API calls. With 26+ sources and throttling, the scrape job already runs for ~2 minutes. Adding a classification pass per event would multiply this by the number of events per source.

**Do this instead:** Add `event_category` to the existing extraction schema. The model classifies in the same pass.

### Anti-Pattern 4: Overloading event_category with UI Logic

**What people do:** Store verbose labels in `event_category` ("Live Music & Concerts", "Comedy Shows") to display directly in the UI.

**Why it's wrong:** UI labels are a presentation concern; DB values should be stable identifiers. If a label changes, all stored values must be migrated.

**Do this instead:** Store short enum keys (`live_music`, `comedy`). Map to display labels in the frontend constants file. Labels can change without a migration.

### Anti-Pattern 5: Filtering the Map Layer by Category but Not the Sidebar (or Vice Versa)

**What people do:** Apply `filterByCategory` to `sidebarEvents` but pass `allEvents` to the map, creating a mismatch between pins and list entries.

**Why it's wrong:** Users see pins on the map for events not in the sidebar, or vice versa. This breaks the visual contract of the interface.

**Do this instead:** Derive a `mapEvents` array from `filterByCategory(allEvents, category)` and pass it to `MapClientWrapper`. The sidebar and map must always show the same filtered set.

---

## Integration Points

### New External Service

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Gemini Google Search Grounding | `@ai-sdk/google` with `useSearchGrounding: true` option in `generateText()` call | Uses existing Gemini API key; no additional credentials. Verify grounding option availability in current `@ai-sdk/google` version before building. |

### New Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `discovery-orchestrator.ts` ↔ `discovered_sources` table | Drizzle INSERT with ON CONFLICT DO NOTHING | Idempotent — running discovery twice for the same city won't duplicate rows |
| `discovered_sources` ↔ `scrape_sources` | Promotion step writes new rows | Promotion is the only coupling between the two tables; keep it in a dedicated promotion function |
| `EventFilters` ↔ `HomeContent` | New `category` nuqs param read in both | Consistent with existing `when` / `province` pattern |
| `filterByCategory` ↔ filter chain | Pure function inserted into existing chain | Position matters: apply category before province (reduces set earlier) |

### Unchanged Integration Points

| Boundary | Status |
|----------|--------|
| `/api/events` route → `HomeContent` | Unchanged; new column flows through automatically |
| `nuqs` URL state pattern | Unchanged; `category` follows same pattern as `when` / `province` |
| Gemini extraction (extractor.ts) | Modified prompt and schema, but same API call pattern |
| `upsertEvent` dedup key | Unchanged: (venue_id, event_date, normalized_performer) |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (26 sources, ~5k events) | Client-side category filter in useMemo; single Gemini call per source; no changes needed |
| 100+ sources | Gemini rate limits become a constraint; increase `SCRAPE_THROTTLE_MS` or batch by day-of-week |
| 500+ sources | Neon HTTP driver connection pool saturation risk; switch to pooled Neon connection string |
| Event volume > 10k | Add server-side `?category=` filter to `/api/events` route to reduce payload; still client-side filter for date/province |

---

## Sources

- Direct codebase inspection: `src/lib/scraper/`, `src/lib/db/schema.ts`, `src/app/api/cron/`, `vercel.json` — HIGH confidence
- [Vercel Cron Jobs Usage and Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) — Hobby plan: 100 cron jobs, once per day — HIGH confidence
- [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute) — Default as of April 23, 2025; Hobby max duration 300s — HIGH confidence
- [Vercel Function Max Duration](https://vercel.com/docs/functions/configuring-functions/duration) — Hobby 300s max with Fluid Compute — HIGH confidence
- [Gemini API Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search) — Grounding as a first-class Gemini API feature — HIGH confidence
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output) — Enum constraints in schema for classification tasks — HIGH confidence
- [Vercel Changelog: Cron jobs now support 100 per project on every plan](https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan) — HIGH confidence

---

*Architecture research for: Automatic venue/source discovery + AI event categorization — East Coast Local v1.2*
*Researched: 2026-03-14*
