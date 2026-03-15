# Architecture Research

**Domain:** Event scraping / API integration platform (Atlantic Canada)
**Researched:** 2026-03-15
**Confidence:** HIGH — based on direct codebase review + verified API documentation

> This document supersedes the v1.2 discovery architecture file for purposes of v1.4 planning.
> The existing pipeline sections are retained as baseline; this file adds a focused integration
> design for Ticketmaster, Google Events JSON-LD, multi-page scraping, rate limiting, scrape
> quality metrics, and auto-approve discovery.

---

## Existing Architecture (v1.3 Verified Baseline)

### Scraping Pipeline

```
/api/cron/scrape (GET, daily at 06:00 UTC)
    ↓
runScrapeJob()  [orchestrator.ts]
    ↓ iterates scrape_sources WHERE enabled = true
    ├── source_type = 'venue_website'
    │       ↓
    │   fetchAndPreprocess(url)      [fetcher.ts]    → cleaned page text (15k char limit)
    │       ↓
    │   extractEvents(text, url)     [extractor.ts]  → Gemini call → ExtractedEvent[]
    │       ↓
    │   upsertEvent(venue_id, event) [normalizer.ts] → INSERT ON CONFLICT DO UPDATE
    │
    ├── source_type = 'eventbrite'
    │       ↓
    │   scrapeEventbrite(source)     [eventbrite.ts] → Eventbrite REST API → upsertEvent()
    │
    └── source_type = 'bandsintown'
            ↓
        scrapeBandsintown(source)    [bandsintown.ts] → Bandsintown REST API → upsertEvent()
```

### Database Schema (v1.3 Current)

```
venues
  id, name, address, city, province, lat, lng, website, phone, venue_type, created_at

events
  id, venue_id (FK), performer, normalized_performer, event_date, event_time,
  source_url, scrape_timestamp, raw_extracted_text, price, ticket_link,
  description, cover_image_url, event_category, created_at, updated_at
  UNIQUE INDEX: (venue_id, event_date, normalized_performer)

scrape_sources
  id, url, venue_id (FK), scrape_frequency, last_scraped_at, last_scrape_status,
  source_type, enabled, created_at

discovered_sources
  id, url, domain, source_name, province, city, status, discovery_method,
  raw_context, discovered_at, reviewed_at, added_to_sources_at
```

### Key Extension Point

The orchestrator dispatches on `scrape_sources.source_type`. Every new API integration adds:
1. A new `source_type` string value (stored in the plain-text column — no migration needed for the value itself)
2. A corresponding handler module in `src/lib/scraper/`
3. An `else if` branch in `orchestrator.ts`

This is the established, low-friction pattern for new integrations.

---

## v1.4 Integration Design

### Overview of Changes

| Feature | Type | Files Changed |
|---------|------|---------------|
| Ticketmaster API | New source_type + handler | NEW: ticketmaster.ts; MODIFIED: orchestrator.ts |
| Songkick | Blocked — commercial license required | None |
| Google Events JSON-LD | New fast path before AI | NEW: json-ld.ts; MODIFIED: fetcher.ts, orchestrator.ts |
| Multi-page scraping | Extended fetcher + schema column | MODIFIED: fetcher.ts, schema.ts, orchestrator.ts |
| Rate limiting | Extended fetcher + orchestrator | MODIFIED: fetcher.ts, orchestrator.ts |
| Scrape quality metrics | New schema columns + metric writes | MODIFIED: schema.ts, orchestrator.ts, /admin UI |
| Auto-approve discovery | Scoring pass in discovery orchestrator | MODIFIED: discovery-orchestrator.ts, schema.ts |

---

## System Overview (v1.4 Target State)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel Cron                               │
├────────────────────────────┬────────────────────────────────────┤
│  GET /api/cron/scrape      │  GET /api/cron/discover            │
│  maxDuration = 60          │  maxDuration = 60                  │
├────────────────────────────┴────────────────────────────────────┤
│                      orchestrator.ts                             │
│   Dispatches on scrape_sources.source_type                      │
│                                                                  │
│  venue_website  ──→  fetcher.ts                                 │
│                       Rate-limited HTTP fetch (retry/backoff)   │
│                       Multi-page loop (max_pages column)        │
│                       Returns { text, rawHtml }                 │
│                       ↓                                         │
│                       json-ld.ts  (NEW)                         │
│                       Try JSON-LD Event schema parse            │
│                       ↓ if found: skip AI                       │
│                       ↓ if not found:                           │
│                       extractor.ts → Gemini → ExtractedEvent[]  │
│                       ↓                                         │
│                       normalizer.ts → upsertEvent()             │
│                       ↓                                         │
│                       write quality metrics to scrape_sources   │
│                                                                  │
│  eventbrite     ──→  eventbrite.ts  → upsertEvent()            │
│  bandsintown    ──→  bandsintown.ts → upsertEvent()             │
│  ticketmaster   ──→  ticketmaster.ts (NEW)                      │
│                       TM Discovery API → venue find-or-create   │
│                       → upsertEvent()                           │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│               discovery-orchestrator.ts                          │
│   Gemini + Google Search → candidates                           │
│   scoreCandidate() → write discovery_score                      │
│   score >= 0.8 → promoteSource() (auto-approve)                 │
│   score <  0.8 → discovered_sources pending (human review)      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                       Neon Postgres
┌───────────┬──────────┬──────────────────────────┬──────────────────────┐
│ venues    │ events   │ scrape_sources            │ discovered_sources   │
│           │          │ + max_pages               │ + discovery_score    │
│           │          │ + last_event_count        │                      │
│           │          │ + avg_confidence          │                      │
│           │          │ + consecutive_failures    │                      │
│           │          │ + total_scrapes           │                      │
│           │          │ + total_events_extracted  │                      │
└───────────┴──────────┴──────────────────────────┴──────────────────────┘
```

---

## Feature Integration Details

### 1. Ticketmaster Discovery API

**Integration point:** New `source_type = 'ticketmaster'` in `scrape_sources`.

**Handler:** New `src/lib/scraper/ticketmaster.ts` — mirrors the `eventbrite.ts` pattern.

**URL scheme (synthetic, matching existing pattern):**
The `url` field in `scrape_sources` is overloaded as a config carrier for non-website sources (precedent: `eventbrite:org:12345`, `bandsintown:artist:name`). Ticketmaster uses: `ticketmaster:province:NB`.

The handler decodes this to build the API request.

**API details (HIGH confidence — verified at developer.ticketmaster.com 2026-03-15):**
- Endpoint: `GET https://app.ticketmaster.com/discovery/v2/events`
- Auth: `?apikey={TICKETMASTER_API_KEY}` query parameter
- Location params: `countryCode=CA`, `stateCode=NB|NS|PE|NL`
- Date range: `startDateTime` / `endDateTime` in ISO-8601
- Pagination: `size` + `page`, deep paging capped at `size × page < 1000`
- Rate limit: 5 req/sec, 5000 req/day — 4 province requests/day is trivial

**Venue matching (TM-specific challenge):**
TM events include a venue name and address. Unlike Eventbrite/Bandsintown sources (which already have a `venue_id`), TM sources must find or create a venue row:

```
For each TM event:
  1. Normalize venue name + city from TM response
  2. venues.findFirst({ where: ilike(name, normalized) AND city = tmCity })
  3. If found → use existing venue_id
  4. If not found → INSERT venue (name, city, province, address)
                 → lat/lng omitted; geocoded on first scrape per orchestrator pattern
  5. upsertEvent(venue_id, extracted, sourceUrl)
```

**Category mapping:** TM events have `classifications[].segment.name` (e.g., "Music", "Arts & Theatre"). Map these to the existing 8-category enum.

**What is new vs modified:**
- NEW: `src/lib/scraper/ticketmaster.ts`
- MODIFIED: `orchestrator.ts` — add `else if (source.source_type === 'ticketmaster')` branch
- NEW: `TICKETMASTER_API_KEY` env var
- NEW: 4 seed rows in `scrape_sources` (one per province: NB, NS, PE, NL)

---

### 2. Songkick

**Status: Blocked — do not implement in v1.4.**

Songkick requires a paid commercial partnership agreement and license fee. They explicitly exclude hobbyist and indie developers (HIGH confidence — verified at songkick.com/developer 2026-03-15).

The Ticketmaster Discovery API covers the same Atlantic Canada concert data with a free tier. Bandsintown already handles artist-based concert lookups. There is no gap that justifies pursuing Songkick.

---

### 3. Google Events Structured Data (JSON-LD)

**What this is:** Venue websites increasingly embed `<script type="application/ld+json">` blocks with `@type: "Event"` markup per the schema.org Event spec. Cheerio can parse these directly — no AI needed.

**Integration point:** A new pre-pass in the `venue_website` scrape path, BEFORE calling Gemini.

**Interface change to fetcher.ts:** Currently returns `string` (cleaned text). Must also return raw HTML for JSON-LD parsing. New return type: `{ text: string; rawHtml: string }`.

**Data flow (modified venue_website path):**
```
fetcher.ts returns { text, rawHtml }
    ↓
json-ld.ts → extractJsonLdEvents(rawHtml)
    ↓
If events.length > 0:
    → skip extractor.ts (no AI call)
    → each event → upsertEvent()
    → confidence = 1.0 (structured data is authoritative)
Else:
    → extractor.ts → extractEvents(text, url)  [existing AI path]
    → each event → upsertEvent()
```

**JSON-LD parse logic:**
```typescript
// src/lib/scraper/json-ld.ts
export function extractJsonLdEvents(html: string, venueId: number): ExtractedEvent[] {
  const $ = cheerio.load(html);
  const events: ExtractedEvent[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Event') {
          events.push(mapSchemaOrgEvent(item));
        }
      }
    } catch { /* ignore malformed JSON-LD */ }
  });

  return events;
}

function mapSchemaOrgEvent(item: Record<string, unknown>): ExtractedEvent {
  return {
    performer: extractName(item.performer ?? item.name),
    event_date: normalizeDate(item.startDate),
    event_time: extractTime(item.startDate),
    price: extractPrice(item.offers),
    ticket_link: extractUrl(item.offers ?? item.url),
    description: String(item.description ?? '').slice(0, 500) || null,
    cover_image_url: extractImageUrl(item.image),
    confidence: 1.0,  // structured data is authoritative
    event_category: 'other',  // schema.org eventType rarely maps cleanly; default to 'other'
  };
}
```

**Required schema.org fields (HIGH confidence — verified at developers.google.com):**
- `name` — event title
- `startDate` — ISO-8601 datetime
- `location` — Place with address

**What is new vs modified:**
- NEW: `src/lib/scraper/json-ld.ts`
- MODIFIED: `src/lib/scraper/fetcher.ts` — return `{ text, rawHtml }` instead of `string`
- MODIFIED: `orchestrator.ts` — call json-ld.ts, only call extractor.ts if no JSON-LD events found
- All callers of `fetchAndPreprocess` must be updated to destructure `{ text }` instead of receiving string directly

---

### 4. Multi-Page / Pagination Support

**Problem:** `fetcher.ts` fetches a single URL. Venues with paginated event listings miss events on pages 2+.

**Constraint:** 60s Vercel function timeout. Each page fetch = up to 15s. Cap at 3 pages maximum (enforced in code, not just config).

**Pattern — follow `rel="next"` links:**
```typescript
// src/lib/scraper/fetcher.ts (updated)
export async function fetchAndPreprocess(
  url: string,
  options?: { maxPages?: number }
): Promise<{ text: string; rawHtml: string }> {
  const maxPages = Math.min(options?.maxPages ?? 1, 3); // hard cap at 3
  let allText = '';
  let firstHtml = '';
  let currentUrl: string | null = url;
  let pageCount = 0;

  while (currentUrl && pageCount < maxPages) {
    if (pageCount > 0) await delay(PAGE_DELAY_MS); // 500ms between pages
    const { html, text } = await fetchPage(currentUrl);
    if (pageCount === 0) firstHtml = html; // JSON-LD parsed from first page only
    allText += text;
    currentUrl = detectNextPageUrl(html, currentUrl);
    pageCount++;
  }

  return {
    text: allText.slice(0, 15_000), // keep existing char limit
    rawHtml: firstHtml,
  };
}
```

**Next-page URL detection:**
```typescript
function detectNextPageUrl(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const nextLink = $(
    'a[rel="next"], ' +
    'a[aria-label*="next" i], ' +
    'a.pagination-next, ' +
    'li.next > a'
  ).first();
  const href = nextLink.attr('href');
  if (!href) return null;
  try { return new URL(href, baseUrl).toString(); } catch { return null; }
}
```

**Schema change:**
```typescript
// scrape_sources gets a new column
max_pages: integer('max_pages').notNull().default(1),
```

Default `max_pages = 1` preserves existing single-page behavior for all current sources. Admin can set `max_pages = 2` or `3` on specific sources that need it.

**Orchestrator change:**
```typescript
const pageText = await fetchAndPreprocess(source.url, { maxPages: source.max_pages });
```

**What is new vs modified:**
- MODIFIED: `src/lib/scraper/fetcher.ts` — multi-page loop, next-URL detection, new return type
- MODIFIED: `src/lib/db/schema.ts` — `max_pages` column on `scrape_sources`
- MODIFIED: `orchestrator.ts` — pass `source.max_pages`, destructure `{ text, rawHtml }`
- NEW: Drizzle migration for `max_pages` column

---

### 5. Rate Limiting

**Problem:** No delay between HTTP fetches of venue websites. Risk of 429 responses from venue sites with rate limiting.

**Existing pattern:** `AI_THROTTLE_MS` delays between Gemini calls. Need a parallel pattern for HTTP fetches.

**Two throttle points:**

**a) Inter-source HTTP delay (orchestrator.ts):**
```typescript
const HTTP_THROTTLE_MS = parseInt(process.env.HTTP_THROTTLE_MS ?? '1000', 10);

// After each venue_website source completes (success or failure):
if (source.source_type === 'venue_website' && HTTP_THROTTLE_MS > 0) {
  await delay(HTTP_THROTTLE_MS);
}
```

**b) Intra-page delay (fetcher.ts):**
500ms between pages within a multi-page fetch (hardcoded, not configurable — always appropriate).

**c) Retry with exponential backoff (fetcher.ts):**
```typescript
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await delay(1000 * Math.pow(2, attempt - 1)); // 1s, 2s
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EastCoastLocal/1.0)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.status === 429 || resp.status === 503) {
        if (attempt < retries) continue; // retry
      }
      return resp;
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${url}`);
}
```

**What is new vs modified:**
- MODIFIED: `src/lib/scraper/fetcher.ts` — `fetchWithRetry` wrapper, intra-page delay
- MODIFIED: `orchestrator.ts` — `HTTP_THROTTLE_MS` delay between venue_website sources
- NEW: `HTTP_THROTTLE_MS` env var (default `1000`)

---

### 6. Scrape Quality Metrics

**What to track:** Quantitative per-source metrics on the existing `scrape_sources` table.

**Current state:** `last_scraped_at` and `last_scrape_status` (success/failure) only. No event counts, no confidence tracking.

**New columns:**
```typescript
// scrape_sources additions in schema.ts
last_event_count: integer('last_event_count'),
avg_confidence: doublePrecision('avg_confidence'),
consecutive_failures: integer('consecutive_failures').notNull().default(0),
total_scrapes: integer('total_scrapes').notNull().default(0),
total_events_extracted: integer('total_events_extracted').notNull().default(0),
```

**Metric writes in orchestrator.ts (on success):**
```typescript
const eventCount = extracted.length;
const avgConf = eventCount > 0
  ? extracted.reduce((s, e) => s + e.confidence, 0) / eventCount
  : null;

await db.update(scrape_sources).set({
  last_scraped_at: new Date(),
  last_scrape_status: 'success',
  last_event_count: eventCount,
  avg_confidence: avgConf,
  consecutive_failures: 0,
  total_scrapes: sql`total_scrapes + 1`,
  total_events_extracted: sql`total_events_extracted + ${eventCount}`,
}).where(eq(scrape_sources.id, source.id));
```

**On failure:**
```typescript
await db.update(scrape_sources).set({
  last_scraped_at: new Date(),
  last_scrape_status: 'failure',
  consecutive_failures: sql`consecutive_failures + 1`,
  total_scrapes: sql`total_scrapes + 1`,
}).where(eq(scrape_sources.id, source.id));
```

**Admin UI:** Extend the existing `/admin` source list table to show `last_event_count`, `avg_confidence`, and `consecutive_failures`. No new routes needed — extend the existing page component.

`consecutive_failures >= 3` is a useful alerting signal (source may be blocked or site has changed).

**What is new vs modified:**
- MODIFIED: `src/lib/db/schema.ts` — 5 new metric columns on `scrape_sources`
- MODIFIED: `orchestrator.ts` — metric writes on success and failure paths
- MODIFIED: `/admin` source list UI — display metric columns
- NEW: Drizzle migration for new columns

---

### 7. Auto-Approve High-Confidence Discovered Sources

**What:** After the discovery job inserts candidates, score each one and auto-promote candidates that clearly look like real venue websites.

**Integration point:** `discovery-orchestrator.ts` — add a scoring + promotion pass after the existing insert loop.

**Why `promoteSource()` needs no changes:** The existing function already handles the full promotion flow (create venue, insert scrape_source, update discovered_sources.status). It can be called from the discovery orchestrator without modification.

**Scoring heuristic:**
```typescript
function scoreCandidate(candidate: {
  url: string;
  city: string | null;
  province: string | null;
  source_name: string | null;
}): number {
  let score = 0.5; // base

  if (candidate.city)         score += 0.15;
  if (candidate.province)     score += 0.15;
  if (candidate.source_name)  score += 0.10;

  // URL quality
  if (candidate.url.startsWith('https://')) score += 0.05;

  // Penalize: event/ticket page paths are likely not venue home pages
  if (/\/events\/|\/tickets\/|\/shows\//i.test(candidate.url)) score -= 0.20;

  // Penalize: social/aggregator hostnames that slipped through
  if (/facebook\.com|instagram\.com|eventbrite\.com/i.test(candidate.url)) score -= 0.50;

  return Math.max(0, Math.min(score, 1.0));
}
```

**Auto-approve threshold:** `0.8`. Candidates scoring >= 0.8 are promoted immediately. Candidates below 0.8 remain `pending` for human review in `/admin/discovery`.

**Flow in discovery-orchestrator.ts:**
```typescript
const AUTO_APPROVE_THRESHOLD = 0.8;

for (const candidate of insertedCandidates) {
  const score = scoreCandidate(candidate);

  // Write score regardless of threshold
  await db.update(discovered_sources)
    .set({ discovery_score: score })
    .where(eq(discovered_sources.url, candidate.url));

  if (score >= AUTO_APPROVE_THRESHOLD) {
    const staged = await db.query.discovered_sources.findFirst({
      where: eq(discovered_sources.url, candidate.url),
    });
    if (staged?.status === 'pending') {
      await promoteSource(staged.id); // reuse existing, unchanged
      console.log(`Auto-approved: ${candidate.url} (score: ${score.toFixed(2)})`);
    }
  }
}
```

**Schema change:**
```typescript
// discovered_sources additions in schema.ts
discovery_score: doublePrecision('discovery_score'),
```

**Admin UI:** Show `discovery_score` on the pending review list so admins can see why a candidate was or wasn't auto-approved.

**What is new vs modified:**
- MODIFIED: `src/lib/scraper/discovery-orchestrator.ts` — scoring + auto-promote pass
- MODIFIED: `src/lib/db/schema.ts` — `discovery_score` column on `discovered_sources`
- NO change to `promote-source.ts` — reused as-is
- MODIFIED: `/admin/discovery` UI — show `discovery_score`
- NEW: Drizzle migration for `discovery_score` column

---

## Component Responsibilities (v1.4)

| Component | Responsibility | Status |
|-----------|---------------|--------|
| `orchestrator.ts` | Source dispatch, metric writes, HTTP throttle between sources | Modified |
| `fetcher.ts` | HTML fetch, multi-page loop, retry/backoff, intra-page delay | Modified |
| `json-ld.ts` | Parse schema.org Event JSON-LD from raw HTML | New |
| `extractor.ts` | AI extraction via Gemini (unchanged interface) | Unchanged |
| `normalizer.ts` | Event upsert (unchanged) | Unchanged |
| `ticketmaster.ts` | TM Discovery API fetch + venue find-or-create | New |
| `eventbrite.ts` | Eventbrite API handler (unchanged) | Unchanged |
| `bandsintown.ts` | Bandsintown API handler (unchanged) | Unchanged |
| `discovery-orchestrator.ts` | Discovery + scoring + auto-promote | Modified |
| `promote-source.ts` | Source promotion (reused unchanged) | Unchanged |
| `schema.ts` | DB schema — new columns on existing tables | Modified |
| `/admin` source list | Quality metrics display | Modified |
| `/admin/discovery` | Show discovery_score | Modified |

---

## Data Flows

### Ticketmaster Data Flow

```
orchestrator.ts (source_type = 'ticketmaster')
    ↓
ticketmaster.ts
    ↓
GET https://app.ticketmaster.com/discovery/v2/events
    ?countryCode=CA
    &stateCode={NB|NS|PE|NL}          (decoded from synthetic url)
    &startDateTime={today}T00:00:00Z
    &endDateTime={+30days}T23:59:59Z
    &apikey={TICKETMASTER_API_KEY}
    &size=200
    ↓
For each TM event:
    venues.findFirst(name ILIKE tmVenueName AND city = tmCity)
    → venue found: use venue_id
    → venue not found: INSERT venue → geocoded on first scrape
    ↓
    upsertEvent(venue_id, {
      performer: event.name || attraction.name,
      event_date: dates.start.localDate,
      event_time: dates.start.localTime,
      ticket_link: event.url,
      event_category: mapTmClassification(event.classifications),
      confidence: 1.0,
    }, sourceUrl)
```

### JSON-LD Fast Path Data Flow

```
orchestrator.ts (source_type = 'venue_website')
    ↓
fetcher.ts → fetchAndPreprocess(url, { maxPages: source.max_pages })
    → returns { text: string, rawHtml: string }
    ↓
json-ld.ts → extractJsonLdEvents(rawHtml)
    ↓ events.length > 0 (structured data found)
        → each event → upsertEvent()          [no Gemini call]
        → avg_confidence = 1.0
    ↓ events.length === 0 (no structured data)
        → extractor.ts → extractEvents(text, url)   [Gemini call]
        → each event → upsertEvent()
        → avg_confidence = mean(extracted[].confidence)
    ↓
orchestrator.ts → write metrics to scrape_sources
```

### Discovery Auto-Approve Flow

```
discovery-orchestrator.ts
    ↓
Gemini + Google Search → candidates[]
    ↓
INSERT INTO discovered_sources (ON CONFLICT DO NOTHING)
    ↓
For each inserted candidate:
    scoreCandidate() → 0.0–1.0
    UPDATE discovered_sources SET discovery_score = score
    ↓
    score >= 0.8?
        YES → promoteSource(id)    [venue + scrape_source created, status = 'approved']
        NO  → leave status = 'pending' (human review in /admin/discovery)
```

---

## Schema Changes Summary (v1.4)

All changes are additive — no column removals, no renames, no breaking changes to existing queries.

```typescript
// scrape_sources — 5 new columns
max_pages:               integer('max_pages').notNull().default(1),
last_event_count:        integer('last_event_count'),
avg_confidence:          doublePrecision('avg_confidence'),
consecutive_failures:    integer('consecutive_failures').notNull().default(0),
total_scrapes:           integer('total_scrapes').notNull().default(0),
total_events_extracted:  integer('total_events_extracted').notNull().default(0),

// discovered_sources — 1 new column
discovery_score:         doublePrecision('discovery_score'),
```

One Drizzle migration covering all of the above.

---

## Build Order (Dependency-Aware)

Build in this order. Items at the same level are independent and can be built in parallel.

```
Step 1: Schema migration  [prerequisite for all metric/score writes]
  - Add all new columns to scrape_sources and discovered_sources
  - Run migration, verify columns exist
  - Required before Steps 2-7

Step 2: Rate limiting (independent — no new schema deps)
  - fetchWithRetry() in fetcher.ts
  - HTTP_THROTTLE_MS in orchestrator.ts
  - Validate: run scrape job, confirm no 429 errors, confirm delay between sources

Step 3: Multi-page support (depends on Step 1 for max_pages column)
  - Extend fetcher.ts: multi-page loop, next-URL detection
  - Change return type: string → { text, rawHtml }
  - Update orchestrator.ts to destructure { text, rawHtml }, pass max_pages
  - Validate: set max_pages = 2 on one venue with known pagination, confirm 2 pages fetched

Step 4: JSON-LD extraction (depends on Step 3 for rawHtml return)
  - Build json-ld.ts: parse + map schema.org Event markup
  - Modify orchestrator.ts: try JSON-LD first, fall back to AI
  - Validate: find a venue site with JSON-LD, confirm events extracted without AI call

Step 5: Scrape quality metrics (depends on Step 1 for new columns)
  - Extend orchestrator.ts metric writes (success + failure)
  - Extend /admin source list UI to display metrics
  - Validate: run scrape job, confirm metric columns populated in DB

Step 6: Ticketmaster integration (depends on Steps 1-5 being stable)
  - Build ticketmaster.ts handler
  - Add else-if branch in orchestrator.ts
  - Add 4 seed rows in scrape_sources (one per province)
  - Add TICKETMASTER_API_KEY to Vercel env vars
  - Validate: trigger scrape manually, confirm TM events appear in events table

Step 7: Auto-approve discovery (depends on Step 1 for discovery_score column)
  - Add scoreCandidate() and auto-promote pass to discovery-orchestrator.ts
  - Extend /admin/discovery UI to show discovery_score
  - Validate: run discovery job, confirm high-score candidates are promoted automatically
```

Steps 2 and 5 are independent of each other and can be built in parallel after Step 1.
Steps 3 and 7 are independent of each other and can be built in parallel after Step 1.
Step 4 depends on Step 3 (rawHtml interface).
Step 6 should be last — it benefits from all pipeline improvements being stable first.

---

## Architectural Patterns

### Pattern 1: Source Type Dispatch

The orchestrator's `source_type` switch is the established extension point. Every new data source gets a new `source_type` string value and a corresponding handler module. Handlers share one contract: accept a `ScrapeSource`, call `upsertEvent()` for each event, throw on unrecoverable errors.

**When to use:** Any new event data source — API-based or structured format.
**Trade-offs:** No abstraction layer means each handler is slightly different. Acceptable given the small number of types.

### Pattern 2: Fast Path Before AI Fallback

For venue_website sources: try cheap structured extraction first (JSON-LD), fall back to expensive AI only when structured data is absent. This pattern reduces Gemini API calls for well-structured sites.

**When to use:** Any extraction step where a deterministic fast path is sometimes available.
**Trade-offs:** Two code paths to maintain. Worth it when the fast path is zero-cost (no API call).

### Pattern 3: Synthetic URL as Config Carrier

Non-website sources encode their API parameters into the `url` field using a custom scheme: `eventbrite:org:12345`, `bandsintown:artist:name`, `ticketmaster:province:NB`. The handler decodes the URL to build the real API request.

**When to use:** Any new API source where the "address" is a config parameter, not a URL.
**Trade-offs:** The `url` column is overloaded. Acceptable given the established precedent and small source count.

### Pattern 4: Additive Schema Only

All v1.4 schema changes are new columns with default values. No existing columns are renamed or removed. Existing queries continue to work without changes.

**When to use:** Always. Destructive schema changes on a live production app require downtime coordination.

---

## Anti-Patterns

### Anti-Pattern 1: Unlimited Page Crawling

**What people do:** Follow pagination links until `nextUrl === null` with no page cap.

**Why it's wrong:** A venue website with 10+ pages × 15s fetch timeout each = function timeout. Events beyond 30 days are filtered out anyway — most venues don't have enough events to need more than 2-3 pages.

**Do this instead:** Hard cap at 3 pages in code (`Math.min(options?.maxPages ?? 1, 3)`), configurable per source with `max_pages` column (default 1).

### Anti-Pattern 2: Bypassing the Metrics Write

**What people do:** Return early from a new source handler (e.g., Ticketmaster) before the metrics update in `orchestrator.ts` runs.

**Why it's wrong:** The metrics write and the success/failure status update are in the `try/catch` wrapper in `orchestrator.ts`, outside the handler. New handlers must be called inside the existing loop's `try` block — the metrics path runs for all source types automatically.

**Do this instead:** Add the new `else if` branch inside the existing `for (const source of sources)` loop, before the metrics write at the bottom of the `try` block.

### Anti-Pattern 3: Auto-Approving Everything

**What people do:** Set the auto-approve threshold to 0.5 to maximize discovery throughput.

**Why it's wrong:** Low-confidence candidates are often aggregator pages, social profiles, or irrelevant sites. They fail scraping, increment `consecutive_failures`, and waste AI quota.

**Do this instead:** Keep threshold at 0.8. A smaller set of high-confidence auto-approvals is more valuable than flooding the scrape pipeline with noise.

### Anti-Pattern 4: JSON-LD Fallthrough That Still Runs AI

**What people do:** Call `extractJsonLdEvents(rawHtml)` but always also call `extractEvents(text, url)` and merge results.

**Why it's wrong:** Duplicates events from the same source. JSON-LD events will conflict-upsert against AI-extracted events with different confidence scores, causing unnecessary writes.

**Do this instead:** Short-circuit: `if (jsonLdEvents.length > 0) { /* use them; return */ }`. Only call Gemini when JSON-LD yields nothing.

---

## Integration Points

### External Services

| Service | Integration Pattern | Auth | Rate Limit | Notes |
|---------|---------------------|------|------------|-------|
| Ticketmaster Discovery API | REST GET, apikey query param | `TICKETMASTER_API_KEY` env | 5 req/sec, 5000/day | countryCode=CA, one request per province |
| Songkick | Not integrating | Commercial license required | N/A | Blocked — deferred indefinitely |
| schema.org Event (JSON-LD) | Parse HTML `<script>` blocks | None | N/A | Cheerio parse; no external call |
| Gemini API (existing) | Vercel AI SDK generateText | `GEMINI_API_KEY` env | Paid tier | Fallback when JSON-LD absent |
| Google Geocoding (existing) | REST GET | `GOOGLE_MAPS_API_KEY` env | Sufficient | TM venues need geocoding too |

### Internal Boundaries

| Boundary | Communication | Change in v1.4 |
|----------|---------------|----------------|
| orchestrator → fetcher | Direct function call | Interface change: returns `{ text, rawHtml }` |
| orchestrator → json-ld | Direct function call | New boundary |
| orchestrator → ticketmaster | Direct function call | New boundary |
| orchestrator → schema (metric columns) | Drizzle update | Extended: 5 new metric columns |
| discovery-orchestrator → promoteSource | Direct function call | Existing, reused unchanged |
| discovery-orchestrator → discovered_sources (score) | Drizzle update | New: writes `discovery_score` |

---

## Scaling Considerations

| Concern | v1.3 | v1.4 Impact |
|---------|------|-------------|
| Vercel 60s timeout | 26 sources × ~4s AI delay is near the limit | JSON-LD reduces AI calls; TM adds 4 fast REST calls. Net: slightly better if JSON-LD hits on common venues |
| Gemini API calls | 26/day | Reduced by JSON-LD fast path hits. Each JSON-LD hit saves one Gemini call |
| Neon Postgres | Light load | Metric writes add 6 extra column updates per source run — negligible |
| TM API quota | N/A | 4 requests/day vs 5000/day limit — trivial |
| Admin UI data volume | 26 rows | 5 new metric columns, still lightweight |

The 60-second timeout remains the binding constraint. Multi-page scraping is the highest-risk addition — enforce the 3-page hard cap and monitor `consecutive_failures` for sources where timeout-induced failures start appearing.

---

## Sources

- Ticketmaster Discovery API: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/ (verified 2026-03-15)
- Google Event structured data schema: https://developers.google.com/search/docs/appearance/structured-data/event (verified 2026-03-15)
- Songkick API terms: https://www.songkick.com/developer (verified 2026-03-15 — commercial license, not viable)
- Scraping quality metrics framework: https://witanworld.com/article/2026/02/02/how-to-evaluate-web-scraping-pipelines-using-the-right-metrics/
- Exponential backoff for scraping: https://substack.thewebscraping.club/p/rate-limit-scraping-exponential-backoff
- Cheerio pagination patterns: https://webscraping.ai/faq/cheerio/how-do-you-handle-pagination-when-scraping-with-cheerio
- Codebase: /Users/brad/Apps/eastcoastlocal/src/lib/scraper/* (direct inspection)

---

*Architecture research for: East Coast Local v1.4 — API integrations + scraping improvements*
*Researched: 2026-03-15*
