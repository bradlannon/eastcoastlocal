# Phase 16: Ticketmaster Integration - Research

**Researched:** 2026-03-15
**Domain:** Ticketmaster Discovery API v2 — new source_type handler, venue find-or-create, attribution
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLAT-01 | System scrapes Atlantic Canada events from Ticketmaster Discovery API filtered by province | TM Discovery API v2 `/events` endpoint verified; `countryCode=CA` + `stateCode` param confirmed for NS/NB/PE/NL; handler pattern follows established eventbrite.ts model |
| PLAT-02 | Ticketmaster events are matched to existing venues or new venues are auto-created with geocoding | Venue ILIKE find-or-create logic designed; geocoder.ts already handles null lat/lng on first scrape; upsertEvent() contract unchanged |
| PLAT-03 | Ticketmaster attribution is displayed on events sourced from their API (per ToS) | Attribution requirement confirmed; `source_url` already stored per event; UI display of "via Ticketmaster" needs adding to event card rendering |
</phase_requirements>

---

## Summary

Phase 16 adds Ticketmaster as a new scrape source type, following the established `source_type` dispatch pattern in `orchestrator.ts`. The work is scoped to one new file (`ticketmaster.ts`), one new branch in `orchestrator.ts`, four seed rows in `scrape_sources` (one per Atlantic Canada province), and one new env var (`TICKETMASTER_API_KEY`). No schema migration is needed — all required columns were added in Phase 14/15.

The highest-complexity piece is venue find-or-create: unlike Eventbrite and Bandsintown (which have a pre-assigned `venue_id` in the `scrape_sources` row), TM events carry their own venue data and require matching against `venues` by name + city, then inserting if not found. The geocoder already handles null lat/lng on first scrape, so auto-created venues behave identically to manually promoted ones.

The other mandatory concern is ToS attribution: every event sourced from Ticketmaster must display "via Ticketmaster" attribution and link back to the TM event URL. The `ticket_link` field already carries the TM event URL; the attribution UI is the one net-new UI change in this phase.

**Primary recommendation:** Build `ticketmaster.ts` mirroring `eventbrite.ts` structure, add ILIKE venue matching before insert, map `classifications[0].segment.name` to the 8-category enum, and extend the event card frontend to show "via Ticketmaster" when `source_url` matches `ticketmaster:`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fetch` (native) | — | Ticketmaster API HTTP calls | Already used by eventbrite.ts and bandsintown.ts; no new dependency needed |
| `drizzle-orm` | 0.39.x | DB queries: ILIKE venue match, insert, upsertEvent | Already the project ORM |
| `ilike` from `drizzle-orm` | 0.39.x | Case-insensitive venue name matching | Drizzle's built-in; use `ilike(venues.name, tmVenueName)` |

**No new npm packages are needed for Phase 16.**

### Ticketmaster API Coordinates

| Parameter | Value | Notes |
|-----------|-------|-------|
| Endpoint | `https://app.ticketmaster.com/discovery/v2/events.json` | Verified 2026-03-15 |
| Auth | `?apikey={TICKETMASTER_API_KEY}` | Query param, not header |
| Province filter | `stateCode=NB` / `NS` / `PE` / `NL` | Canadian postal abbreviations |
| Country filter | `countryCode=CA` | Required alongside stateCode |
| Date window | `startDateTime` / `endDateTime` ISO-8601 | Use today → today+30d |
| Page size | `size=200` | Max safe value before deep-paging limit |
| Rate limit | 5 req/sec, 5000 req/day | 4 province calls/day is trivial |
| Stable event ID | `event.id` (string) | Idempotency key for deduplication |

### Response Field Map

| TM Response Field | Maps To | Notes |
|-------------------|---------|-------|
| `event.name` | `performer` | Primary event/show name |
| `event._embedded.attractions[0].name` | `performer` fallback | Use if `event.name` is generic venue-branded title |
| `event.dates.start.localDate` | `event_date` | "YYYY-MM-DD" string |
| `event.dates.start.localTime` | `event_time` | May be absent when `timeTBA = true` |
| `event.url` | `ticket_link` + `source_url` | TM event page; required for attribution |
| `event.images[0].url` | `cover_image_url` | Use `ratio: "16_9"` image if available |
| `event.priceRanges[0].min` | `price` | Optional; format as string e.g. "$25+" |
| `event.classifications[0].segment.name` | `event_category` | Map to 8-category enum |
| `event._embedded.venues[0].name` | venue lookup key | ILIKE match against `venues.name` |
| `event._embedded.venues[0].city.name` | venue lookup + insert | Exact match filter alongside ILIKE name |
| `event._embedded.venues[0].state.stateCode` | venue province | NB, NS, PE, NL |
| `event._embedded.venues[0].address.line1` | venue address | Street address for new venue rows |

---

## Architecture Patterns

### Recommended File Structure for Phase 16

```
src/lib/scraper/
├── ticketmaster.ts        # NEW — TM Discovery API handler
├── ticketmaster.test.ts   # NEW — unit tests (mock fetch)
├── orchestrator.ts        # MODIFIED — add else-if branch for 'ticketmaster'
└── [all other files unchanged]

src/app/                   # MODIFIED — event card attribution display
```

### Pattern 1: Source Type Dispatch (existing, extend here)

The orchestrator's `for (const source of sources)` loop dispatches on `source.source_type`. Phase 16 adds one branch:

```typescript
// orchestrator.ts — add after the bandsintown branch
} else if (source.source_type === 'ticketmaster') {
  await scrapeTicketmaster(source);
  console.log(`  ✓ Ticketmaster source ${source.id} (${source.url})`);
}
```

The success metrics write immediately follows this block (already in orchestrator) and runs automatically for all source types — no changes to the metrics path needed.

### Pattern 2: Synthetic URL as Config Carrier (existing, apply here)

TM sources encode the province into the `url` field using the established pattern:

```
ticketmaster:province:NB    → stateCode=NB
ticketmaster:province:NS    → stateCode=NS
ticketmaster:province:PE    → stateCode=PE
ticketmaster:province:NL    → stateCode=NL
```

The handler decodes:
```typescript
const stateCode = source.url.replace('ticketmaster:province:', '');
```

### Pattern 3: Venue Find-or-Create (new, specific to TM)

Unlike Eventbrite/Bandsintown which already have a `venue_id` in the `scrape_sources` row, TM sources must resolve venue at runtime:

```typescript
// src/lib/scraper/ticketmaster.ts
import { db } from '@/lib/db/client';
import { venues, scrape_sources } from '@/lib/db/schema';
import { ilike, eq, and } from 'drizzle-orm';
import { upsertEvent } from './normalizer';
import { geocodeAddress } from './geocoder';
import type { ScrapeSource } from '@/types';

async function findOrCreateVenue(
  tmVenueName: string,
  city: string,
  province: string,
  address: string
): Promise<number> {
  // 1. Try ILIKE match on name + exact city
  const existing = await db.query.venues.findFirst({
    where: and(
      ilike(venues.name, tmVenueName),
      eq(venues.city, city)
    ),
  });

  if (existing) return existing.id;

  // 2. Insert new venue — lat/lng omitted, geocoded on first scrape
  const [inserted] = await db
    .insert(venues)
    .values({ name: tmVenueName, address, city, province })
    .returning({ id: venues.id });

  return inserted.id;
}
```

**ILIKE matching edge cases for Atlantic Canada venues:**

| TM Venue Name | Expected DB Match | Risk |
|---------------|-------------------|------|
| `Scotiabank Centre` | `Scotiabank Centre` | LOW — exact match likely |
| `Rebecca Cohn Auditorium` | `Rebecca Cohn Auditorium` | LOW |
| `Avenir Centre` | `Avenir Centre` | LOW |
| `Casino New Brunswick` | `Casino New Brunswick` | MEDIUM — may differ in DB |
| `Harbour Station` | `Harbour Station` | LOW |

ILIKE handles case differences but not name abbreviations (e.g., "Scotiabank Ctr"). After the first run, review for any duplicate venue rows and merge manually if needed. This is a known pending todo in STATE.md.

### Pattern 4: Category Mapping

The TM `classifications[0].segment.name` field maps to our 8-category enum:

```typescript
function mapTmClassification(
  classifications: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
): ExtractedEvent['event_category'] {
  const segment = classifications?.[0]?.segment?.name?.toLowerCase() ?? '';
  const genre   = classifications?.[0]?.genre?.name?.toLowerCase() ?? '';

  if (segment === 'music')                             return 'live_music';
  if (segment === 'sports')                            return 'sports';
  if (segment === 'arts & theatre') {
    if (genre.includes('comedy'))                      return 'comedy';
    if (genre.includes('theatre') || genre.includes('theater')) return 'theatre';
    if (genre.includes('classical') || genre.includes('opera')) return 'arts';
    return 'arts';
  }
  if (segment === 'film')                              return 'arts';
  if (segment === 'family')                            return 'community';
  if (segment === 'miscellaneous')                     return 'community';
  return 'other';
}
```

### Pattern 5: Attribution (new UI concern)

PLAT-03 requires "via Ticketmaster" attribution with a link to the TM event page. The `source_url` column on events already stores the URL passed to `upsertEvent()`. For TM events, pass `event.url` (the TM event page URL) as `sourceUrl`.

For display, the event card (or event list item) should check whether `source_url` starts with `https://www.ticketmaster.com` or `https://ticketmaster.com` and render attribution. Do not add a new DB column — the existing `source_url` field is sufficient.

```typescript
// In event card component
const isTmSource = event.source_url?.includes('ticketmaster.com') ?? false;
// Render: <a href={event.source_url}>via Ticketmaster</a> when isTmSource
```

### Anti-Patterns to Avoid

- **Fetching by country only and filtering client-side**: `countryCode=CA` alone returns events across all of Canada — thousands of rows requiring pagination. Always filter by `stateCode` too.
- **Calling Gemini for TM events**: TM data arrives structured. `scrapeTicketmaster()` must call `upsertEvent()` directly, bypassing extractor.ts entirely. The handler never calls `fetchAndPreprocess()`.
- **Creating a single catch-all TM scrape_sources row**: One row per province is the correct pattern. It enables per-province quality metrics (consecutive_failures, last_event_count) and allows disabling one province independently.
- **Storing TM events without ticket_link**: The `ticket_link` and `source_url` fields must both be set to `event.url` so attribution works and users can buy tickets.
- **Accumulating TM events indefinitely**: TM ToS requires treating data as ephemeral. The existing `upsertEvent()` ON CONFLICT DO UPDATE pattern already refreshes data on each run — this is the correct behavior. Do not add a separate delete-old-events step; the upsert is sufficient.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive venue name match | Custom SQL LOWER() comparison | `ilike()` from drizzle-orm | Already imported in the codebase; Drizzle generates correct `ILIKE` SQL |
| Geocoding new TM venues | Custom geocode integration | `geocodeAddress()` from `./geocoder` | Already handles null lat/lng pattern on first scrape; orchestrator calls it on the venue_website path for the same reason |
| Event deduplication across daily runs | Custom duplicate check | `upsertEvent()` via `ON CONFLICT DO UPDATE` | The unique index `(venue_id, event_date, normalized_performer)` already handles this for all source types |
| Event category detection | LLM classification | `mapTmClassification()` on `classifications[0].segment.name` | TM provides structured segment/genre data — no AI needed |

---

## Common Pitfalls

### Pitfall 1: The `dates.start.localTime` field is a complex object, not a string

**What goes wrong:** The TM API docs show `localTime` as a time object with sub-fields (`hourOfDay`, `minuteOfHour`, etc.), not a simple "HH:MM" string. Treating it as a string gives `[object Object]` in the DB.

**How to avoid:** Use `dates.start.localDate` (a plain "YYYY-MM-DD" string) for the date. For time, use `dates.start.dateTime` (ISO-8601 with timezone, e.g., `"2026-04-15T19:00:00Z"`) and extract the time portion, OR check `dates.start.timeTBA` first and skip time if true.

```typescript
const localDate = event.dates.start.localDate; // "2026-04-15"
const timeTba   = event.dates.start.timeTBA ?? false;
const eventTime = timeTba
  ? null
  : (event.dates.start.dateTime?.slice(11, 16) ?? null); // "19:00"
```

### Pitfall 2: Venue ILIKE match creates duplicate rows for abbreviation variants

**What goes wrong:** TM has `"Scotiabank Centre"` but the DB has `"Halifax Scotiabank Centre"` — ILIKE exact match misses, and a second venue row is created.

**Why it happens:** TM venue names and manually entered venue names may differ in prefix/suffix.

**How to avoid:** After the first production run, query for venues with `lat IS NOT NULL` that share similar names and merge manually. This is a known deferred task per STATE.md. Do not try to build fuzzy matching now — it adds complexity and ILIKE covers the most common cases (case differences).

**Warning signs:** Multiple venue rows for the same city with similar names visible in `/admin/venues`.

### Pitfall 3: ToS violation — missing attribution on TM-sourced events

**What goes wrong:** TM events appear on the map without "via Ticketmaster" attribution or without a link back to the TM event page. Ticketmaster reserves the right to revoke API keys without notice for ToS violations.

**How to avoid:** Confirm `source_url` is always set to `event.url` (the TM event page) in every `upsertEvent()` call from `ticketmaster.ts`. Add attribution rendering in the event card UI — check `source_url.includes('ticketmaster.com')` and render "via Ticketmaster" with a link.

**Warning signs:** Events from TM with `source_url = null` or `source_url` pointing to a non-TM URL.

### Pitfall 4: Quota exhaustion from over-broad queries

**What goes wrong:** Querying `countryCode=CA` without `stateCode` returns pan-Canada events, requiring many paginated requests to retrieve the full set. At 5000/day this can exhaust daily quota.

**How to avoid:** Always filter by `stateCode` (one request per province). Use `size=200` to minimize number of pages needed. 4 provinces × 1–2 pages each = 4–8 requests/day, well within the 5000/day limit.

### Pitfall 5: Metrics not written for TM source because `sourceEventCount` stays null

**What goes wrong:** The orchestrator initializes `sourceEventCount = null` and `avgConf = null` before the source-type branches. For `venue_website` sources these get set in the branch. The `scrapeTicketmaster()` function (like `scrapeEventbrite()`) does not return event counts — the metrics write at the bottom of the `try` block writes `last_event_count: null`.

**How to avoid:** Either (a) have `scrapeTicketmaster()` return `{ count: number }` and use that to set `sourceEventCount` in the orchestrator, OR (b) accept that TM sources have `last_event_count = null` in the metrics (same as Eventbrite/Bandsintown today, per STATE.md comment on how metrics variables are set). Both are acceptable — document the decision.

---

## Code Examples

### Full ticketmaster.ts Handler Structure

```typescript
// Source: eventbrite.ts pattern + TM API docs (developer.ticketmaster.com 2026-03-15)
import { db } from '@/lib/db/client';
import { venues } from '@/lib/db/schema';
import { ilike, eq, and } from 'drizzle-orm';
import { upsertEvent } from './normalizer';
import type { ScrapeSource } from '@/types';

interface TmEvent {
  id: string;
  name: string;
  url: string;
  dates: {
    start: {
      localDate: string;
      dateTime?: string;
      timeTBA?: boolean;
    };
  };
  images?: Array<{ url: string; ratio?: string; width?: number }>;
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
  }>;
  _embedded?: {
    venues?: Array<{
      name: string;
      address?: { line1?: string };
      city?: { name?: string };
      state?: { stateCode?: string };
    }>;
    attractions?: Array<{ name: string }>;
  };
}

interface TmResponse {
  _embedded?: { events?: TmEvent[] };
  page?: { totalPages: number; number: number };
}

export async function scrapeTicketmaster(source: ScrapeSource): Promise<void> {
  const stateCode = source.url.replace('ticketmaster:province:', '');
  const apiKey = process.env.TICKETMASTER_API_KEY ?? '';

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 30);

  const params = new URLSearchParams({
    apikey: apiKey,
    countryCode: 'CA',
    stateCode,
    startDateTime: today.toISOString().slice(0, 10) + 'T00:00:00Z',
    endDateTime: endDate.toISOString().slice(0, 10) + 'T23:59:59Z',
    size: '200',
  });

  const response = await fetch(
    `https://app.ticketmaster.com/discovery/v2/events.json?${params}`
  );

  if (!response.ok) {
    throw new Error(
      `Ticketmaster API error: ${response.status} ${response.statusText} for stateCode=${stateCode}`
    );
  }

  const data = (await response.json()) as TmResponse;
  const tmEvents = data._embedded?.events ?? [];

  for (const event of tmEvents) {
    const tmVenue = event._embedded?.venues?.[0];
    if (!tmVenue) continue;

    const venueName = tmVenue.name;
    const city      = tmVenue.city?.name ?? '';
    const province  = tmVenue.state?.stateCode ?? stateCode;
    const address   = tmVenue.address?.line1 ?? `${city}, ${province}`;

    const venueId = await findOrCreateVenue(venueName, city, province, address);

    const timeTba   = event.dates.start.timeTBA ?? false;
    const eventTime = timeTba
      ? null
      : (event.dates.start.dateTime?.slice(11, 16) ?? null);

    const performer = event._embedded?.attractions?.[0]?.name ?? event.name;

    const bestImage = event.images?.find(i => i.ratio === '16_9') ?? event.images?.[0];

    const price = event.priceRanges?.[0]?.min != null
      ? `$${event.priceRanges[0].min}+`
      : null;

    await upsertEvent(
      venueId,
      {
        performer,
        event_date: event.dates.start.localDate,
        event_time: eventTime,
        price,
        ticket_link: event.url,
        description: null,
        cover_image_url: bestImage?.url ?? null,
        confidence: 1.0,
        event_category: mapTmClassification(event.classifications ?? []),
      },
      event.url  // source_url = TM event page for attribution
    );
  }
}

async function findOrCreateVenue(
  name: string,
  city: string,
  province: string,
  address: string
): Promise<number> {
  const existing = await db.query.venues.findFirst({
    where: and(ilike(venues.name, name), eq(venues.city, city)),
  });
  if (existing) return existing.id;

  const [inserted] = await db
    .insert(venues)
    .values({ name, address, city, province })
    .returning({ id: venues.id });
  return inserted.id;
}

function mapTmClassification(
  classifications: Array<{ segment?: { name?: string }; genre?: { name?: string } }>
): 'live_music' | 'comedy' | 'theatre' | 'arts' | 'sports' | 'festival' | 'community' | 'other' {
  const segment = classifications[0]?.segment?.name?.toLowerCase() ?? '';
  const genre   = classifications[0]?.genre?.name?.toLowerCase() ?? '';

  if (segment === 'music')           return 'live_music';
  if (segment === 'sports')          return 'sports';
  if (segment === 'arts & theatre') {
    if (genre.includes('comedy'))                          return 'comedy';
    if (genre.includes('theatre') || genre.includes('theater')) return 'theatre';
    return 'arts';
  }
  if (segment === 'film')            return 'arts';
  if (segment === 'family')          return 'community';
  return 'other';
}
```

### Seed Rows (insert once via migration or seed script)

```typescript
// Run once — 4 scrape_sources rows for TM, one per province
// venue_id must reference an existing venue — create a placeholder "Ticketmaster (NB)" venue
// or better: use the existing scrape_sources pattern where TM rows have venue_id
// pointing to a "Ticketmaster Atlantic Canada" placeholder venue row

// Simpler alternative: create 4 placeholder venue rows, one per province,
// with name = "Ticketmaster [Province]", city = "Various", then insert scrape_sources
await db.insert(scrape_sources).values([
  { url: 'ticketmaster:province:NB', venue_id: nbPlaceholder, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
  { url: 'ticketmaster:province:NS', venue_id: nsPlaceholder, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
  { url: 'ticketmaster:province:PE', venue_id: pePlaceholder, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
  { url: 'ticketmaster:province:NL', venue_id: nlPlaceholder, source_type: 'ticketmaster', enabled: true, scrape_frequency: 'daily' },
]);
```

**Note on venue_id for TM seed rows:** The `scrape_sources.venue_id` FK is NOT NULL and currently has no default. TM sources resolve their actual venue at runtime via find-or-create. The seed rows need a placeholder `venue_id`. Two options:
1. Create 4 "Ticketmaster [Province]" placeholder venue rows (one per province) with no real address, purely to satisfy the FK constraint. These placeholder venues never appear in events (events go to the found/created real venue).
2. Make `venue_id` nullable for TM source types (requires a schema migration).

**Recommended:** Option 1 (placeholder venues) — no schema change needed, consistent with the existing non-null constraint.

### Attribution Rendering (event card)

```typescript
// In event card / event list item component
// source_url is already stored on every event row

{event.source_url?.includes('ticketmaster.com') && (
  <a
    href={event.source_url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-xs text-blue-600 hover:underline"
  >
    via Ticketmaster
  </a>
)}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Scrape Ticketmaster HTML pages | Use Discovery API v2 (official, free) | Structured JSON, no HTML parsing or LLM needed |
| Single global TM query for all of Canada | One query per province with `stateCode` filter | Stays within 5000/day quota, stays under deep-paging limit |

**Deprecated/outdated:**
- `latlong` geographic parameter: Deprecated in TM Discovery API v2 — use `geoPoint` instead. Not needed for this implementation since we filter by `stateCode`.

---

## Open Questions

1. **venue_id FK constraint for TM seed rows**
   - What we know: `scrape_sources.venue_id` is NOT NULL; TM sources resolve their real venue at runtime
   - What's unclear: Whether placeholder venue rows or a schema change is the right approach
   - Recommendation: Create placeholder venues (e.g., "Ticketmaster NB", city="Various", province="NB") — no migration needed, satisfies FK constraint

2. **TM event volume for Atlantic Canada — unknown until first run**
   - What we know: `size=200` is the largest safe page size; deep-paging limit is 1000 items total
   - What's unclear: Whether any province returns > 200 events in a 30-day window (unlikely for Atlantic Canada)
   - Recommendation: Log `data.page.totalPages` on first run; if > 1, add pagination loop up to 5 pages max

3. **Event name vs. attraction name as `performer`**
   - What we know: `event.name` is often the show title (e.g., "Rock Night at Scotiabank Centre"); `_embedded.attractions[0].name` is the artist (e.g., "The Trews")
   - What's unclear: Which is more useful for users
   - Recommendation: Prefer `attractions[0].name` when present; fall back to `event.name`. This matches Bandsintown behavior (artist-centric).

4. **Attribution display location in UI**
   - What we know: PLAT-03 requires "via Ticketmaster" with link; `source_url` already stores the TM URL
   - What's unclear: Which UI component(s) display events (event cards on map, list view, both)
   - Recommendation: Add attribution to all event display components that show `source_url` or `ticket_link`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.x + ts-jest 29.x |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | `scrapeTicketmaster()` fetches TM API with correct params (countryCode=CA, stateCode from URL) | unit | `npx jest src/lib/scraper/ticketmaster.test.ts -t "fetches with correct params"` | ❌ Wave 0 |
| PLAT-01 | `scrapeTicketmaster()` calls upsertEvent for each future event | unit | `npx jest src/lib/scraper/ticketmaster.test.ts -t "calls upsertEvent"` | ❌ Wave 0 |
| PLAT-01 | `scrapeTicketmaster()` throws on non-OK HTTP response | unit | `npx jest src/lib/scraper/ticketmaster.test.ts -t "throws on API error"` | ❌ Wave 0 |
| PLAT-02 | `findOrCreateVenue()` returns existing venue_id when name+city matches (ILIKE) | unit | `npx jest src/lib/scraper/ticketmaster.test.ts -t "findOrCreateVenue matches existing"` | ❌ Wave 0 |
| PLAT-02 | `findOrCreateVenue()` inserts new venue when no match found | unit | `npx jest src/lib/scraper/ticketmaster.test.ts -t "findOrCreateVenue creates new"` | ❌ Wave 0 |
| PLAT-03 | Attribution: `source_url` is set to TM event.url in every upsertEvent call | unit | `npx jest src/lib/scraper/ticketmaster.test.ts -t "passes event.url as sourceUrl"` | ❌ Wave 0 |
| PLAT-03 | UI: attribution renders "via Ticketmaster" when source_url includes ticketmaster.com | manual | Visual inspection on local dev | — |
| PLAT-01 | Orchestrator dispatches to scrapeTicketmaster for source_type='ticketmaster' | unit | `npx jest src/lib/scraper/orchestrator.test.ts -t "ticketmaster"` | ❌ Wave 0 |
| PLAT-01 | `mapTmClassification()` maps "Music" segment to "live_music" | unit | `npx jest src/lib/scraper/ticketmaster.test.ts -t "mapTmClassification"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/scraper/ticketmaster.test.ts` — covers PLAT-01, PLAT-02, PLAT-03 (API mapping, venue find-or-create, attribution sourceUrl)
- [ ] Orchestrator test extension: add `'ticketmaster'` dispatch case to `src/lib/scraper/orchestrator.test.ts`

No new framework install needed — Jest 30 + ts-jest already configured.

---

## Sources

### Primary (HIGH confidence)

- Ticketmaster Discovery API v2 official docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/ — endpoints, rate limits, geographic filtering, response structure, pagination constraints, stable event ID (verified 2026-03-15)
- East Coast Local codebase direct inspection — `src/lib/scraper/eventbrite.ts`, `bandsintown.ts`, `orchestrator.ts`, `normalizer.ts`, `geocoder.ts`, `schema.ts`, `src/types/index.ts` (2026-03-15)
- `.planning/research/ARCHITECTURE.md` — TM integration design, venue find-or-create pattern, synthetic URL scheme, build order
- `.planning/research/FEATURES.md` — TM API behavior details, Songkick exclusion, category mapping approach
- `.planning/research/SUMMARY.md` — v1.4 pitfalls (ToS attribution, quota exhaustion)

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — Confirmed TM synthetic URL pattern `ticketmaster:province:NB`, pending todo for venue dedup post-first-run, TM event volume unknown concern

### Tertiary (LOW confidence / needs runtime validation)

- **Atlantic Canada TM event volume**: Unknown without running the API. Assumption: 4 province queries at `size=200` fit in one page each. Verify by logging `data.page.totalPages` on first run.
- **Venue name normalization coverage**: ILIKE match covers case differences but not abbreviations. Expect 0-3 duplicate venue rows after first run; manual merge acceptable.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing fetch/drizzle/upsertEvent patterns used throughout
- Architecture: HIGH — source_type dispatch pattern is established and verified in current codebase; TM handler structure directly mirrors eventbrite.ts
- TM API response format: HIGH — verified at official developer.ticketmaster.com docs 2026-03-15
- Venue find-or-create: MEDIUM — ILIKE pattern is correct but name normalization edge cases unknown until first run
- Attribution UI: MEDIUM — source_url field already exists; UI change location depends on current event card component structure (not fully inspected)
- Pitfalls: HIGH — ToS and quota pitfalls from prior research; localTime object structure from official API docs

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (Ticketmaster API is stable; 30-day window appropriate)
