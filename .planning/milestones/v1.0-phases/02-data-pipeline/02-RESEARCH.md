# Phase 2: Data Pipeline - Research

**Researched:** 2026-03-13
**Domain:** AI-powered web scraping pipeline — HTML fetch, LLM extraction, geocoding, deduplication, API integration, Vercel cron
**Confidence:** HIGH (Vercel AI SDK, Drizzle upsert, Vercel cron), MEDIUM (Eventbrite/Bandsintown API access model), MEDIUM (JS-rendered site handling)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **LLM extraction:** Gemini Pro via Vercel AI SDK (`@ai-sdk/google` provider) — user already pays for it
- `generateObject()` + Zod schema for structured extraction (band, venue, date, time, price, ticket link, description, cover image)
- Heavy HTML preprocessing before LLM: strip scripts, styles, nav, footer, ads — send only main content to minimize token cost
- LLM returns a **confidence score (0-1)** per extracted event; reject events below threshold (e.g., 0.5)
- **Reject and log** events with missing required fields (date, performer) — never store garbage data
- Skip events with dates in the past — only store today or future
- Error tracking: update `last_scrape_status` column only. No email/notification alerts for v1. Log failures for manual review.
- **Geocoding:** Google Maps Geocoding API — best accuracy for Canadian addresses
- Geocode once per venue at creation time, cache lat/lng on the `venues` table
- Pre-populate seed venues with manual lat/lng coordinates as primary source
- Geocoder is fallback for newly discovered venues
- If geocoding fails: log the failure, don't show venue on map until coords are available
- **Cron:** Daily rescan — once per day, works on Vercel Hobby plan (free)
- All sources in one cron run — single sequential pass through all enabled sources
- Vercel cron configured in `vercel.json`
- **Platform APIs:** Eventbrite and Bandsintown APIs are must-have for v1 — they cover venues without their own websites
- API data goes through the same normalization and dedup pipeline as scraped data
- Use official APIs (not scraping their HTML) — source type distinguishes origin: `venue_website`, `eventbrite`, `bandsintown`

### Claude's Discretion
- JS-rendered site handling strategy (skip vs scraping service)
- Multi-event extraction approach (all events vs upcoming only per page)
- Exact confidence score threshold value
- HTML preprocessing implementation details (cheerio vs regex vs other)
- Vercel AI SDK version and exact Gemini model string
- Google Maps API key management approach
- Eventbrite/Bandsintown API key setup and rate limiting strategy

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCRP-01 | System can fetch and parse HTML from configured venue website URLs | fetch + cheerio preprocessing pipeline documented |
| SCRP-02 | System uses LLM (Gemini Pro via @ai-sdk/google) to extract structured event data from arbitrary page formats | Vercel AI SDK 6 generateText + Output.object + Zod schema pattern documented |
| SCRP-03 | System preprocesses HTML (strip scripts/styles/nav) before LLM extraction to minimize token costs | cheerio v1 remove() pattern documented with 10-25x token reduction |
| SCRP-04 | System rejects events with null/missing dates rather than accepting LLM-hallucinated values | Zod nullable fields + post-extraction rejection logic documented |
| SCRP-07 | System deduplicates events using composite key (venue + date + normalized band name) | Drizzle onConflictDoUpdate with composite index target documented; schema already has uniqueIndex |
| SCRP-08 | System geocodes venue addresses at import time and caches coordinates on the venue record | Google Maps Geocoding API REST pattern documented; geocode-once strategy confirmed |
| SCRP-09 | System runs scheduled rescans via cron (daily minimum) without manual intervention | vercel.json cron syntax confirmed; CRON_SECRET security pattern documented |
| SCRP-10 | System integrates with Eventbrite/Bandsintown APIs (not scraping) for platform-sourced events | Eventbrite org/venue endpoints confirmed; Bandsintown artist-centric model documented with key constraint |
</phase_requirements>

---

## Summary

Phase 2 builds the automated scraping pipeline that feeds real Atlantic Canada live music events into the database. The pipeline runs as a Vercel cron job (daily), iterates all enabled `scrape_sources` rows, fetches HTML or calls platform APIs, extracts events via Gemini LLM, normalizes and validates, geocodes venues once, and upserts events using the composite dedup key already defined in the schema.

The existing database schema (`schema.ts`) is fully compatible with Phase 2 requirements. The `uniqueIndex('events_dedup_key')` on `(venue_id, event_date, normalized_performer)` is the dedup mechanism. The `last_scrape_status` column on `scrape_sources` is the error-tracking mechanism. No schema changes are needed.

The key architectural decision Claude must make: **how to handle JS-rendered venue sites**. The recommended approach is to **skip JS-rendered sites in v1** — use plain `fetch` + cheerio for static HTML pages, and flag JS-heavy sources as `enabled: false` pending a follow-up decision. This avoids the Vercel 50MB function limit entirely. Firecrawl (500 free credits/month) is the viable alternative if JS sites must be covered in v1.

**Critical AI SDK update:** The package version in use (`ai` package) is now **AI SDK 6**, where `generateObject()` is deprecated. The correct pattern is `generateText()` with `Output.object({ schema })`. The `output` property (not `object`) holds the result.

**Critical Eventbrite constraint:** The public event search endpoint (`/v3/events/search`) was removed in 2020. Eventbrite integration must use organization-scoped or venue-scoped endpoints: `GET /v3/organizations/{org_id}/events/` or `GET /v3/venues/{venue_id}/events/`. This means venue operators must provide their Eventbrite organization ID, not just a URL.

**Critical Bandsintown constraint:** The API is artist-centric, not venue-centric. You query by artist name to get their upcoming events. This is useful for tracking specific Atlantic Canada artists but requires knowing artist names in advance, not venue URLs.

**Primary recommendation:** Build the pipeline as a sequential orchestrator (one source at a time), use `generateText + Output.object` with Gemini 2.5 Flash for extraction, use Google Maps Geocoding REST API directly (no client library needed), and upsert via Drizzle `onConflictDoUpdate` targeting the existing composite unique index.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | 6.x (current) | Vercel AI SDK — LLM orchestration | Official Vercel AI library; `generateText + Output.object` pattern for structured extraction |
| `@ai-sdk/google` | 1.x | Google Gemini provider for AI SDK | Plugs into `ai` package; enables `google('gemini-2.5-flash')` model reference |
| `cheerio` | 1.x | HTML parsing and preprocessing | jQuery-like DOM API for stripping noise before LLM; no browser required; installed in Phase 1 |
| `drizzle-orm` | 0.45.x | Database upsert operations | Already installed; `onConflictDoUpdate` covers dedup; Neon HTTP driver already configured |
| `zod` | 4.x | Extraction schema definition and validation | Already installed; defines event shape for `Output.object` and post-extraction validation |
| `date-fns` | 4.x | Date parsing and normalization | Already installed; normalizes heterogeneous date strings from venue sites |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@sparticuz/chromium` + `playwright-core` | latest | Headless browser for JS-rendered sites | Only if skipping JS sites in v1 is not acceptable; adds 50MB bundle complexity |
| Firecrawl API (external service) | hosted | Managed JS rendering + markdown output | Alternative to Playwright; 500 free credits/month; call their API instead of running Chromium |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `generateText + Output.object` | `generateObject` (AI SDK 5) | `generateObject` is deprecated in AI SDK 6 — do not use |
| Gemini 2.5 Flash | Gemini 2.5 Pro | Flash is faster and cheaper; Pro has higher reasoning for complex layouts — use Flash first |
| Google Maps Geocoding REST API (direct fetch) | `@google/maps` Node.js client | Client library is heavier; direct REST fetch is 2 lines and sufficient for this volume |
| Firecrawl for JS sites | `@sparticuz/chromium` | Firecrawl avoids bundle limit issues; `@sparticuz/chromium` is more fragile but free |

**Installation (new packages for Phase 2):**
```bash
npm install ai @ai-sdk/google
```
Note: `cheerio`, `drizzle-orm`, `zod`, `date-fns` are already installed from Phase 1.

---

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)
```
src/
├── app/
│   └── api/
│       └── cron/
│           └── scrape/
│               └── route.ts       # Cron entry point — GET handler
├── lib/
│   └── scraper/
│       ├── orchestrator.ts        # Iterates scrape_sources, dispatches by source_type
│       ├── fetcher.ts             # fetch() + cheerio preprocessing for venue_website sources
│       ├── extractor.ts           # generateText + Output.object (Gemini) — returns ExtractedEvent[]
│       ├── normalizer.ts          # Date parsing, performer normalization, confidence filter
│       ├── geocoder.ts            # Google Maps Geocoding REST API call
│       ├── eventbrite.ts          # Eventbrite API client (org/venue endpoint)
│       └── bandsintown.ts         # Bandsintown API client (artist events endpoint)
└── lib/
    └── schemas/
        └── extracted-event.ts     # Zod schema used by Output.object and normalizer
vercel.json                        # Cron configuration
```

### Pattern 1: Sequential Orchestrator (SCRP-09)

**What:** Single cron hit runs all enabled sources one-by-one. Each source dispatches to the appropriate fetcher/API client based on `source_type`. Failures are caught per-source — one failure does not abort the run.

**When to use:** Always for v1 with < 50 sources.

```typescript
// src/lib/scraper/orchestrator.ts
import { db } from '@/lib/db/client';
import { scrape_sources } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { scrapeVenueWebsite } from './fetcher';
import { scrapeEventbrite } from './eventbrite';
import { scrapeBandsintown } from './bandsintown';

export async function runScrapeJob(): Promise<void> {
  const sources = await db.query.scrape_sources.findMany({
    where: eq(scrape_sources.enabled, true),
    with: { venue: true },
  });

  for (const source of sources) {
    try {
      switch (source.source_type) {
        case 'venue_website':
          await scrapeVenueWebsite(source);
          break;
        case 'eventbrite':
          await scrapeEventbrite(source);
          break;
        case 'bandsintown':
          await scrapeBandsintown(source);
          break;
      }
      await db.update(scrape_sources)
        .set({ last_scraped_at: new Date(), last_scrape_status: 'success' })
        .where(eq(scrape_sources.id, source.id));
    } catch (err) {
      console.error(`Scrape failed: ${source.url}`, err);
      await db.update(scrape_sources)
        .set({ last_scraped_at: new Date(), last_scrape_status: 'failure' })
        .where(eq(scrape_sources.id, source.id));
      // Continue to next source — never abort the full run
    }
  }
}
```

### Pattern 2: HTML Preprocessing + LLM Extraction (SCRP-01, SCRP-02, SCRP-03, SCRP-04)

**What:** Fetch page HTML, strip noise with cheerio, send condensed text to Gemini via `generateText + Output.object`. Zod schema includes nullable fields and a `confidence` field.

**When to use:** For all `venue_website` sources.

**Preprocessing with cheerio:**
```typescript
// src/lib/scraper/fetcher.ts
import * as cheerio from 'cheerio';

export async function fetchAndPreprocess(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EastCoastLocal/1.0)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const html = await response.text();

  // Validate: Cloudflare challenge pages are small (~10KB) with no real content
  if (html.length < 5_000 || html.includes('Just a moment') || html.includes('Enable JavaScript')) {
    throw new Error(`Bot-blocked or JS-gated page: ${url}`);
  }

  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, aside, [class*="ad"], [id*="ad"]').remove();

  // Extract main content — fall back to body if no main/article
  const mainContent = $('main, article, [role="main"]').text() || $('body').text();
  return mainContent.replace(/\s+/g, ' ').trim().slice(0, 15_000); // hard token budget
}
```

**Extraction schema:**
```typescript
// src/lib/schemas/extracted-event.ts
import { z } from 'zod';

export const ExtractedEventSchema = z.object({
  events: z.array(z.object({
    performer: z.string().nullable().describe('Band or artist name. Null if not clearly stated.'),
    event_date: z.string().nullable().describe('Event date in ISO 8601 format (YYYY-MM-DD). Null if not clearly stated on the page — do NOT guess.'),
    event_time: z.string().nullable().describe('Start time (HH:MM 24h). Null if not present.'),
    price: z.string().nullable().describe('Ticket price as text (e.g. "$15", "Free"). Null if unknown.'),
    ticket_link: z.string().url().nullable().describe('Direct ticket purchase URL. Null if not present.'),
    description: z.string().nullable().describe('Brief event description. Null if none.'),
    cover_image_url: z.string().url().nullable().describe('Event image URL. Null if not present.'),
    confidence: z.number().min(0).max(1).describe('Confidence 0-1 that this is a real upcoming live music event at this venue.'),
  })),
});

export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>['events'][number];
```

**LLM extraction (AI SDK 6 pattern):**
```typescript
// src/lib/scraper/extractor.ts
// Source: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { ExtractedEventSchema, type ExtractedEvent } from '@/lib/schemas/extracted-event';

const CONFIDENCE_THRESHOLD = 0.5;

export async function extractEvents(
  pageText: string,
  sourceUrl: string,
): Promise<ExtractedEvent[]> {
  const { output } = await generateText({
    model: google('gemini-2.5-flash'),
    output: Output.object({ schema: ExtractedEventSchema }),
    prompt: `
You are extracting live music events from a venue website.
Source URL: ${sourceUrl}
Today's date: ${new Date().toISOString().slice(0, 10)}

RULES:
- Only extract live music events (bands, singers, DJs performing live).
- If a field is not clearly stated on this page, return null — do NOT infer or guess.
- event_date must be a real date explicitly mentioned. Never construct a date from context.
- Skip events with dates in the past.
- Set confidence to 0 if you are unsure this is a real event listing.

Page content:
${pageText}
    `.trim(),
  });

  return (output.events ?? []).filter(
    (e) => e.event_date !== null && e.performer !== null && e.confidence >= CONFIDENCE_THRESHOLD,
  );
}
```

### Pattern 3: Upsert-Based Deduplication (SCRP-07)

**What:** Insert events using Drizzle `onConflictDoUpdate` targeting the existing `events_dedup_key` unique index on `(venue_id, event_date, normalized_performer)`. Re-scraping updates existing rows rather than inserting duplicates.

**Important:** The unique index uses the `uniqueIndex()` name `events_dedup_key`, but Drizzle's `onConflictDoUpdate` `target` parameter takes the **column references** (not the index name) that form the composite key.

```typescript
// src/lib/scraper/normalizer.ts (upsert portion)
// Source: https://orm.drizzle.team/docs/guides/upsert
import { db } from '@/lib/db/client';
import { events } from '@/lib/db/schema';

function normalizePerformer(name: string): string {
  return name.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

export async function upsertEvent(
  venueId: number,
  extracted: ExtractedEvent,
  sourceUrl: string,
): Promise<void> {
  const normalized = normalizePerformer(extracted.performer!);
  const eventDate = new Date(extracted.event_date!);

  await db.insert(events).values({
    venue_id: venueId,
    performer: extracted.performer!,
    normalized_performer: normalized,
    event_date: eventDate,
    event_time: extracted.event_time ?? null,
    source_url: sourceUrl,
    scrape_timestamp: new Date(),
    price: extracted.price ?? null,
    ticket_link: extracted.ticket_link ?? null,
    description: extracted.description ?? null,
    cover_image_url: extracted.cover_image_url ?? null,
    raw_extracted_text: null,
    updated_at: new Date(),
  }).onConflictDoUpdate({
    target: [events.venue_id, events.event_date, events.normalized_performer],
    set: {
      performer: extracted.performer!,  // update display name if changed
      event_time: extracted.event_time ?? null,
      source_url: sourceUrl,
      scrape_timestamp: new Date(),
      price: extracted.price ?? null,
      ticket_link: extracted.ticket_link ?? null,
      description: extracted.description ?? null,
      cover_image_url: extracted.cover_image_url ?? null,
      updated_at: new Date(),
    },
  });
}
```

### Pattern 4: Venue Geocoding — Once at Creation (SCRP-08)

**What:** Call Google Maps Geocoding REST API when a new venue is added. Store `lat`/`lng` on the venue record. Never call geocoding API again for the same venue unless address changes.

**Seed venues already have lat/lng** — geocoding is only needed for venues added after seed.

```typescript
// src/lib/scraper/geocoder.ts
// Source: https://developers.google.com/maps/documentation/geocoding/start
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const encoded = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${process.env.GOOGLE_MAPS_API_KEY}&region=ca&components=country:CA`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.[0]) {
    console.error(`Geocoding failed for "${address}": ${data.status}`);
    return null;
  }

  const location = data.results[0].geometry.location;
  const locationType = data.results[0].geometry.location_type;

  // Reject low-precision results (e.g., geometric center of a city)
  if (locationType === 'APPROXIMATE') {
    console.warn(`Geocoding returned APPROXIMATE result for "${address}" — manual review needed`);
    return null;
  }

  return { lat: location.lat, lng: location.lng };
}
```

**Google Maps response `location_type` precision levels (high to low):**
- `ROOFTOP` — exact address match (use)
- `RANGE_INTERPOLATED` — interpolated between two addresses (use)
- `GEOMETRIC_CENTER` — center of a named feature (use with caution)
- `APPROXIMATE` — approximate location (reject, flag for manual)

**Canadian address tip:** Add `region=ca&components=country:CA` to the query to bias results toward Canada and avoid matching US locations with similar addresses.

### Pattern 5: Vercel Cron Configuration (SCRP-09)

**What:** `vercel.json` triggers a daily GET to `/api/cron/scrape`. The route handler verifies `CRON_SECRET` and runs the orchestrator.

**vercel.json:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "0 6 * * *"
    }
  ]
}
```
(`0 6 * * *` = daily at 6:00 AM UTC = 2:00-3:00 AM Atlantic time — avoids peak user hours)

**Secure route handler:**
```typescript
// src/app/api/cron/scrape/route.ts
import { runScrapeJob } from '@/lib/scraper/orchestrator';

export const maxDuration = 300; // 5 minutes — Vercel Pro limit (Hobby: 60s)

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    await runScrapeJob();
    return Response.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Cron job failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

**Note on `maxDuration`:** On Vercel Hobby plan, serverless functions time out at 60 seconds. On Pro, maximum is 800 seconds (configured up to 300s recommended). For v1 with 5 enabled sources, 60 seconds should be sufficient. Set `maxDuration = 300` from the start to avoid silent truncation when sources grow.

### Pattern 6: Eventbrite API Integration (SCRP-10)

**Critical constraint:** The public event search by location endpoint was removed in 2020. The only available endpoints require knowing the Eventbrite **organization ID** or **venue ID** in advance.

**Endpoint:** `GET https://www.eventbriteapi.com/v3/organizations/{org_id}/events/?expand=venue&status=live`

**Authentication:** Bearer token (OAuth private token from Eventbrite account)

**Approach:** Store the Eventbrite organization ID in `scrape_sources.url` (use a custom URL format like `eventbrite://org/{org_id}`) or add a `metadata` JSONB column to `scrape_sources`.

```typescript
// src/lib/scraper/eventbrite.ts
export async function scrapeEventbrite(source: ScrapeSource): Promise<void> {
  // source.url format: eventbrite:org:12345678
  const orgId = source.url.replace('eventbrite:org:', '');

  const res = await fetch(
    `https://www.eventbriteapi.com/v3/organizations/${orgId}/events/?status=live&expand=venue`,
    {
      headers: { Authorization: `Bearer ${process.env.EVENTBRITE_TOKEN}` },
    }
  );

  if (!res.ok) throw new Error(`Eventbrite API error: ${res.status}`);

  const data = await res.json();

  for (const event of data.events ?? []) {
    // Eventbrite returns structured data — no LLM extraction needed
    const eventDate = new Date(event.start.utc);
    if (eventDate < new Date()) continue; // skip past events

    await upsertEvent(source.venue_id, {
      performer: event.name.text,
      event_date: event.start.utc.slice(0, 10),
      event_time: event.start.local.slice(11, 16),
      price: null, // ticket pricing requires separate API call
      ticket_link: event.url,
      description: event.description?.text?.slice(0, 500) ?? null,
      cover_image_url: event.logo?.url ?? null,
      confidence: 1.0, // structured API data — no confidence filtering needed
    }, event.url);
  }
}
```

### Pattern 7: Bandsintown API Integration (SCRP-10)

**Critical constraint:** Bandsintown is **artist-centric**. You query by artist name to get their events — there is no venue-centric endpoint. This means Bandsintown integration works differently: store artist names in `scrape_sources.url` (format: `bandsintown:artist:The+Trews`) rather than venue URLs.

Bandsintown requires written consent and an `app_id` from Bandsintown Inc. — this is not a public key you generate yourself. Application needed before using in production.

**Endpoint:** `GET https://rest.bandsintown.com/artists/{artist_name}/events/?app_id={app_id}&date=upcoming`

```typescript
// src/lib/scraper/bandsintown.ts
export async function scrapeBandsintown(source: ScrapeSource): Promise<void> {
  // source.url format: bandsintown:artist:The+Trews
  const artistName = source.url.replace('bandsintown:artist:', '');

  const res = await fetch(
    `https://rest.bandsintown.com/artists/${encodeURIComponent(artistName)}/events/?app_id=${process.env.BANDSINTOWN_APP_ID}&date=upcoming`,
  );

  if (!res.ok) throw new Error(`Bandsintown API error: ${res.status}`);

  const events = await res.json();

  for (const event of events ?? []) {
    // Filter to Atlantic Canada venues only
    const venue = event.venue;
    if (!['NB', 'NS', 'PE', 'NL', 'New Brunswick', 'Nova Scotia', 'Prince Edward Island', 'Newfoundland'].some(
      (p) => venue.region?.includes(p) || venue.country === 'Canada'
    )) continue;

    const eventDate = new Date(event.datetime);
    if (eventDate < new Date()) continue;

    await upsertEvent(source.venue_id, {
      performer: artistName.replace(/\+/g, ' '),
      event_date: event.datetime.slice(0, 10),
      event_time: event.datetime.slice(11, 16),
      price: null,
      ticket_link: event.offers?.[0]?.url ?? event.url,
      description: event.description ?? null,
      cover_image_url: null,
      confidence: 1.0,
    }, event.url);
  }
}
```

### Anti-Patterns to Avoid

- **Calling geocoding on every scrape run:** Venues don't move. Geocode once, store on `venues.lat`/`venues.lng`. Only geocode new venues.
- **Sending full HTML to LLM without preprocessing:** A raw venue page is 50k-200k tokens. After cheerio stripping, it's 2k-15k. Always strip first.
- **Using `generateObject()` from AI SDK 5:** It's deprecated in AI SDK 6. Use `generateText + Output.object`. The result is in `output`, not `object`.
- **Assuming Eventbrite allows public search:** The `/v3/events/search` endpoint was removed in 2020. Only org/venue-scoped endpoints work.
- **Assuming Bandsintown is venue-scoped:** It's artist-scoped. Query by artist name, not venue URL.
- **Inserting events without upsert:** Without `onConflictDoUpdate`, daily cron runs create exponential duplicates.
- **Not validating response before LLM call:** A Cloudflare challenge page is ~10KB with "Just a moment" text. The LLM will try to extract events from it. Always validate response size and content before calling the LLM.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output | Custom JSON parsing | `generateText + Output.object + Zod` | Handles schema enforcement, retries, type safety |
| HTML noise removal | Regex on raw HTML | `cheerio.load() + $('script,style,...').remove()` | Regex on HTML is fragile; cheerio handles malformed HTML correctly |
| Database upsert dedup | Manual SELECT + INSERT/UPDATE | `db.insert().onConflictDoUpdate()` | Drizzle upsert is atomic — no race condition between check and insert |
| Date normalization | Custom string parsing | `date-fns parse()` with format variants | Atlantic Canada venues use ~12 different date string formats |
| Geocoding REST calls | Client SDK | Direct `fetch()` to Maps API | For < 200 venues total, a direct fetch is 2 lines and zero dependency weight |
| Vercel function security | IP allowlisting | `CRON_SECRET` header check | Vercel injects the secret automatically; IP approach is unreliable on serverless |

**Key insight:** The LLM handles the hardest problem (understanding arbitrary HTML page layouts). Everything else in the pipeline is plumbing that existing libraries solve well.

---

## Common Pitfalls

### Pitfall 1: AI SDK Version Mismatch — `generateObject` vs `generateText + Output.object`

**What goes wrong:** Code written against AI SDK 5 docs uses `generateObject()`. In AI SDK 6 (current), this function is deprecated and will be removed. Using it now may work but will break in a future update.
**Why it happens:** Most tutorial content online still shows `generateObject`. The CONTEXT.md also says "generateObject() + Zod schema" (AI SDK 5 terminology).
**How to avoid:** Use `generateText({ output: Output.object({ schema }) })`. Access the result via `output`, not `object`. The package in `package.json` (`ai` and `@ai-sdk/google`) are already installed with no version pinned — assume current = AI SDK 6.
**Warning signs:** TypeScript compilation error on `import { generateObject } from 'ai'` or deprecation warnings.

### Pitfall 2: Eventbrite Public Search Is Gone

**What goes wrong:** Developer adds an Eventbrite URL from the web interface (`eventbrite.com/d/canada--atlantic/music`) to `scrape_sources` and expects the API to return events for that search. The API returns 404 or empty.
**Why it happens:** The search endpoint was removed in 2020. Only org-scoped and venue-scoped endpoints remain.
**How to avoid:** Eventbrite integration requires the organization ID (numeric) of each Atlantic Canada venue using Eventbrite. Store as `eventbrite:org:{org_id}` in the `url` column. Requires manual setup per venue.
**Warning signs:** Eventbrite scraper returns 0 events despite venues having active listings.

### Pitfall 3: Vercel Hobby 60-Second Timeout

**What goes wrong:** The cron hits `/api/cron/scrape`, runs through 10 sources with LLM calls taking 3-8 seconds each, and gets killed at 60 seconds. No events are written for sources after the timeout. No error is visible to the user.
**Why it happens:** Vercel Hobby plan serverless functions max out at 60 seconds. A sequential scrape of 10 sources × 5-8 seconds each = 50-80 seconds.
**How to avoid:** Set `export const maxDuration = 300` in the route file (requires Vercel Pro for full 300s). For Hobby plan: keep the enabled source list short (< 8 sources) and track timeout risk. Test cron duration manually before going live.
**Warning signs:** `FUNCTION_INVOCATION_TIMEOUT` in Vercel logs; last-scraped timestamps stop updating for later sources in the sequence.

### Pitfall 4: LLM Date Hallucination

**What goes wrong:** LLM returns `event_date: "2026-03-15"` for an event page that says "Doors at 8pm" without specifying which date. LLM inferred the date from context.
**Why it happens:** LLMs fill in missing fields when instructed to "extract all event details." Even with null instructions, models sometimes guess.
**How to avoid:** (1) Make `event_date` nullable in the Zod schema. (2) Include explicit prompt instruction: "Return null for event_date if not clearly stated — do not infer or guess." (3) Post-filter: reject any event where `event_date` is null OR the parsed date is in the past.
**Warning signs:** Events appearing with dates clustering on a specific day that doesn't match the source; same event having different dates across re-scrapes.

### Pitfall 5: Bot Detection Returns 200 With Challenge Page

**What goes wrong:** Fetching a Cloudflare-protected venue site returns HTTP 200 with a "Just a moment..." challenge page (~8KB). The LLM receives this as input and returns 0 events or garbage data. `last_scrape_status` stays `success` because no exception was thrown.
**Why it happens:** HTTP 200 doesn't mean valid content. Cloudflare challenge pages are returned with 200 status.
**How to avoid:** Validate response content before calling LLM: check `html.length > 5000` AND `!html.includes('Just a moment')`. Throw an error if validation fails — this triggers the `catch` block and sets `last_scrape_status = 'failure'`.
**Warning signs:** Scrape logs showing 0 events extracted from a source that previously produced events; response body containing Cloudflare keywords.

### Pitfall 6: Normalized Performer Mismatch Across Sources

**What goes wrong:** Same artist appears as "The Trews" from the venue website and "the trews" from Eventbrite. Normalization strips the "the" or punctuation inconsistently. Dedup key produces two separate rows for the same show.
**Why it happens:** `normalizePerformer()` implementation is inconsistent. If it removes articles ("the", "a") or handles punctuation differently, the same artist maps to different normalized strings.
**How to avoid:** Establish a single, simple normalization rule: lowercase + remove non-alphanumeric-except-spaces + trim + collapse whitespace. Do NOT remove common words. Apply the same function everywhere `normalized_performer` is written.

```typescript
function normalizePerformer(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // remove punctuation
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}
```

---

## Code Examples

### Verified: AI SDK 6 generateText + Output.object Pattern
```typescript
// Source: https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

const { output } = await generateText({
  model: google('gemini-2.5-flash'),
  output: Output.object({
    schema: z.object({
      events: z.array(z.object({
        performer: z.string().nullable(),
        event_date: z.string().nullable(),
        confidence: z.number().min(0).max(1),
      })),
    }),
  }),
  prompt: 'Extract live music events from: ...',
});

// Access: output.events (typed, validated)
```

### Verified: Drizzle Upsert with Composite Index Target
```typescript
// Source: https://orm.drizzle.team/docs/guides/upsert
await db.insert(events)
  .values(newEvent)
  .onConflictDoUpdate({
    target: [events.venue_id, events.event_date, events.normalized_performer],
    set: {
      performer: newEvent.performer,
      scrape_timestamp: new Date(),
      updated_at: new Date(),
    },
  });
```

### Verified: Vercel Cron Configuration
```json
// vercel.json — Source: https://vercel.com/docs/cron-jobs/quickstart
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "0 6 * * *"
    }
  ]
}
```

### Verified: Cron Route Authorization with CRON_SECRET
```typescript
// Vercel automatically sends CRON_SECRET as Bearer token
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... run job
}
```

### Verified: Google Maps Geocoding REST (No Client Library)
```typescript
// Source: https://developers.google.com/maps/documentation/geocoding/start
const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}&region=ca&components=country:CA`;
const res = await fetch(url);
const data = await res.json();
if (data.status === 'OK') {
  const { lat, lng } = data.results[0].geometry.location;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject()` from AI SDK | `generateText + Output.object()` | AI SDK 6 (2025) | `generateObject` is now deprecated; switch before it's removed |
| `import { generateObject } from 'ai'` | `import { generateText, Output } from 'ai'` | AI SDK 6 | Result in `output` not `object` property |
| Eventbrite public event search | Organization/venue-scoped endpoints only | 2020 | Must know organization ID before integration |

**Deprecated/outdated:**
- `generateObject()`: deprecated in AI SDK 6 — will be removed in a future version. Use `generateText + Output.object`.
- Eventbrite `/v3/events/search`: removed in 2020. Do not attempt.
- Nominatim public geocoding API: forbidden for production use (rate-limited, no SLA). Use Google Maps.

---

## JS-Rendered Sites: Recommended Decision (Claude's Discretion)

**Recommendation: Skip JS-rendered sites in v1. Flag with `enabled: false`.**

Reasoning:
- Of the 5 seed venues, 4 have confirmed scrapeable static HTML URLs. The Ship Pub (Facebook) is already `enabled: false`.
- Running `@sparticuz/chromium` on Vercel is fragile (tight 50MB limit, fragile across Vercel runtime updates, 10-50s cold start).
- Firecrawl is viable (500 free credits/month at 1 credit/page = 500 pages/month) but adds an external dependency and per-page cost.
- The user's stated goal is "hands-off after configuration" — adding a scraping service to handle a minority of sources adds operational complexity.
- **Deferral cost is LOW:** JS-rendered venues can be added in a future iteration by enabling Firecrawl or `@sparticuz/chromium` for specific `scrape_sources` rows (add a `requires_js: boolean` column).

**If JS sites must be covered in v1**, use Firecrawl:
- `npm install @mendable/firecrawl-js`
- API key from firecrawl.dev (500 free credits)
- Replace `fetch + cheerio` in `fetcher.ts` with `firecrawl.scrapeUrl(url, { formats: ['markdown'] })`

---

## Open Questions

1. **Bandsintown app_id availability**
   - What we know: Bandsintown requires written consent and a per-application ID. This is not self-serve.
   - What's unclear: How quickly Bandsintown grants access. Could block SCRP-10 if they don't respond.
   - Recommendation: Apply immediately (their help center link is the contact point). If not approved before Phase 2 completes, mark `bandsintown` source type as `enabled: false` and document it as pending approval.

2. **Eventbrite organization IDs for Atlantic Canada venues**
   - What we know: The API requires org IDs, not event search by location.
   - What's unclear: Whether the target venues (Capitol Theatre, etc.) use Eventbrite and what their org IDs are.
   - Recommendation: Manually look up each venue on Eventbrite and record their organization ID before implementing the integration. If a venue doesn't use Eventbrite, skip — no fallback needed.

3. **Gemini model string: `gemini-2.5-flash` vs `gemini-2.5-pro`**
   - What we know: Both are available via `@ai-sdk/google`. Flash is faster and cheaper; Pro has higher reasoning.
   - Recommendation: Use `gemini-2.5-flash` as default. The extraction task (identify events from preprocessed text) does not require advanced reasoning. Pro is a cost escalation path if Flash produces poor-quality extractions.

4. **`maxDuration` and Vercel plan**
   - What we know: Hobby plan caps at 60 seconds. 5 enabled sources × 5-8s each = 25-40s (within limit). Source count will grow.
   - Recommendation: Add `export const maxDuration = 60` to the cron route for Hobby. Document the limit explicitly. Upgrade plan or batch sources when source count exceeds 8.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.x with ts-jest |
| Config file | `/Users/brad/Apps/eastcoastlocal/jest.config.ts` |
| Quick run command | `npm test -- --testPathPattern=scraper` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCRP-01 | fetchAndPreprocess returns cleaned text from HTML | unit | `npm test -- --testPathPattern=fetcher` | ❌ Wave 0 |
| SCRP-02 | extractEvents returns typed events from cleaned page text | unit (mocked LLM) | `npm test -- --testPathPattern=extractor` | ❌ Wave 0 |
| SCRP-03 | fetchAndPreprocess strips script/style/nav from raw HTML | unit | `npm test -- --testPathPattern=fetcher` | ❌ Wave 0 |
| SCRP-04 | extractEvents rejects events with null event_date | unit | `npm test -- --testPathPattern=normalizer` | ❌ Wave 0 |
| SCRP-07 | upsertEvent called twice with same composite key yields single DB row | integration (requires DB) | manual / `npm test -- --testPathPattern=upsert` | ❌ Wave 0 |
| SCRP-08 | geocodeAddress returns lat/lng for a valid Canadian address | unit (mocked fetch) | `npm test -- --testPathPattern=geocoder` | ❌ Wave 0 |
| SCRP-09 | GET /api/cron/scrape returns 401 without CRON_SECRET | unit | `npm test -- --testPathPattern=cron` | ❌ Wave 0 |
| SCRP-10 | Eventbrite and Bandsintown normalizers return ExtractedEvent shape | unit | `npm test -- --testPathPattern=eventbrite|bandsintown` | ❌ Wave 0 |

**LLM tests should mock the `ai` package:** Unit tests for `extractor.ts` mock `generateText` to return fixture data — no actual Gemini API calls in CI.

**Integration tests (SCRP-07) require a real DB connection:** These tests should use a separate test database or be marked `skip` for CI runs without a DATABASE_URL.

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=scraper --passWithNoTests`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/scraper/fetcher.test.ts` — covers SCRP-01, SCRP-03 (mock `fetch`, test cheerio stripping)
- [ ] `src/lib/scraper/extractor.test.ts` — covers SCRP-02, SCRP-04 (mock `ai` generateText)
- [ ] `src/lib/scraper/normalizer.test.ts` — covers SCRP-04 (normalizePerformer, date rejection, past-event filtering)
- [ ] `src/lib/scraper/geocoder.test.ts` — covers SCRP-08 (mock `fetch` to Maps API, test null on APPROXIMATE)
- [ ] `src/lib/scraper/eventbrite.test.ts` — covers SCRP-10 Eventbrite adapter (mock fetch)
- [ ] `src/lib/scraper/bandsintown.test.ts` — covers SCRP-10 Bandsintown adapter (mock fetch)
- [ ] `src/app/api/cron/scrape/route.test.ts` — covers SCRP-09 (401 without secret, 200 with secret + mocked orchestrator)

---

## Sources

### Primary (HIGH confidence)
- [Vercel AI SDK 6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — `generateObject` deprecation, `generateText + Output.object` replacement pattern
- [AI SDK Core: Generating Structured Data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — `Output.object` API with Zod schema
- [Vercel Cron Jobs Quickstart](https://vercel.com/docs/cron-jobs/quickstart) — `vercel.json` cron syntax, `CRON_SECRET` pattern
- [Drizzle ORM Upsert Guide](https://orm.drizzle.team/docs/guides/upsert) — `onConflictDoUpdate` with composite target array
- [Google Maps Geocoding API](https://developers.google.com/maps/documentation/geocoding/start) — REST endpoint, response format, `location_type` precision levels
- `src/lib/db/schema.ts` — Existing `uniqueIndex('events_dedup_key')` on `(venue_id, event_date, normalized_performer)` confirms dedup mechanism

### Secondary (MEDIUM confidence)
- [AI SDK Google Generative AI Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai) — `google('gemini-2.5-flash')` model string; `@ai-sdk/google` v1.x
- [Eventbrite API Reference](https://www.eventbrite.com/platform/api) — confirmed org/venue endpoint pattern; public search confirmed removed
- [Bandsintown API Documentation](https://help.artists.bandsintown.com/en/articles/9186477-api-documentation) — artist-centric model, `app_id` consent requirement, event endpoint format
- [GitHub Issue: Eventbrite v3 Search Deprecated](https://github.com/Automattic/eventbrite-api/issues/83) — confirms public search removal

### Tertiary (LOW confidence)
- Firecrawl pricing (500 free credits/month, JS rendering 2-3 credits) — from firecrawl.dev pricing page; verify before committing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — AI SDK 6 and Drizzle patterns verified against official docs
- Architecture: HIGH — sequential orchestrator pattern is well-established for this scale
- Eventbrite/Bandsintown integration: MEDIUM — confirmed endpoints exist, but access model (org IDs, Bandsintown consent) requires manual setup before implementation
- JS-rendered site handling: HIGH (recommendation to skip) — Vercel constraints are well-documented

**Research date:** 2026-03-13
**Valid until:** 2026-06-13 (stable stack; AI SDK versioning is the most likely area to drift)
