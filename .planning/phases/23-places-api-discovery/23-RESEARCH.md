# Phase 23: Places API Discovery - Research

**Researched:** 2026-03-15
**Domain:** Google Maps Places API (New) — Text Search, pagination, dedup pipeline, cron isolation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**City List & Cron Chunking**
- One cron endpoint per province: `/api/cron/discover-places-ns`, `-nb`, `-pei`, `-nl`
- Each province runs on its own weekly schedule, staggered (NS Monday, NB Tuesday, etc.)
- City list includes all communities 2k+ population (~50+ total across 4 provinces)
- City list hardcoded as a constant object in the Places discoverer file, organized by province
- Each province endpoint calls the shared discoverer with its city list

**Search Query Strategy**
- Use Places API Text Search (New) method
- Single broad query per city: "bars nightclubs live music venues in {city} {province}"
- Filter results by place_types in code after response (bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium)
- Follow all pagination (nextPageToken) until exhausted — don't cap pages
- Essential fields only in X-Goog-FieldMask: places.id, places.displayName, places.websiteUri, places.formattedAddress, places.location, places.types
- No phone field in initial request

**Places Scoring Design**
- Simple tier-based scoring, NOT multi-signal weighted
- Core types (bar, night_club, concert_hall, performing_arts_theater, comedy_club) = 0.85 → auto-approve at 0.8 threshold
- Secondary types (community_center, stadium) = 0.70 → admin review queue
- New `scorePlacesCandidate()` function, separate from existing `scoreCandidate()`
- Update existing Gemini discovery threshold to 0.9 in this phase (SCORE-02 requirement)
- Per-method threshold constants: PLACES_AUTO_APPROVE = 0.8, GEMINI_AUTO_APPROVE = 0.9

**Dedup Staging Behavior**
- google_place_id exact match as fast-path dedup: if venue already has same place_id, skip staging entirely and enrich
- Then fall through to scoreVenueCandidate() name+geo check for venues without place_id match
- Dedup scope: same province only (not all venues)
- On MERGE decision: skip discovered_sources insert, auto-enrich existing venue (backfill google_place_id, richer address), log enrichment
- On REVIEW decision: stage as 'pending' with near-match context in raw_context field, admin decides
- On KEEP_SEPARATE: stage normally as new candidate

### Claude's Discretion
- Exact query string wording for Text Search (as long as it targets venue types in a city)
- Rate limiting / throttle implementation between API calls (p-limit or sequential)
- Error handling per-city (continue on failure, retry logic)
- Synthetic URL pattern for no-website venues (follow Ticketmaster precedent: `places:{google_place_id}`)
- Domain column value for no-website venues
- Logging verbosity and format for discovery runs

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PLACES-01 | System discovers venues via Google Maps Places API Text Search across configured cities | Places API Text Search (New) at `https://places.googleapis.com/v1/places:searchText` supports exactly this via `textQuery` field |
| PLACES-02 | System filters Places results by venue-relevant place types | Post-response filtering on `places[].types` array — locked types list: bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium |
| PLACES-03 | System respects Places API rate limits with configurable throttle | Sequential per-city requests with `DISCOVERY_THROTTLE_MS` env var (already established pattern in discovery-orchestrator.ts) |
| PLACES-04 | System deduplicates Places-discovered venues against existing venues before staging | Two-step: google_place_id exact match first, then `scoreVenueCandidate()` name+geo check — both tools already exist |
| PLACES-05 | System extracts website URLs from Places results for scrape source promotion | `places.websiteUri` field from Places API maps directly to `discovered_sources.url` for `promoteSource()` |
| PLACES-06 | System creates no-website venue stubs with coordinates for venues without websiteUri | Synthetic URL `places:{google_place_id}`, domain column value TBD (discretion), status='no_website' — promoteSource() must accept 'no_website' in Phase 23 |
| PLACES-07 | System stores google_place_id on discovered sources and venues for cross-source dedup | `discovered_sources.google_place_id` and `venues.google_place_id` columns exist from Phase 22; unique index already in place |
| GEO-01 | System covers ~30 population centers across all 4 Atlantic provinces | City list hardcoded in places-discoverer.ts — covers communities 2k+ population (~50+ total) |
| GEO-02 | Discovery jobs run as chunked crons (per-province or per-region) to stay within 60s timeout | 4 cron endpoints, one per province — each runs its province city list sequentially |
| GEO-03 | Each discovery channel (Places, Gemini, Reddit) runs on its own cron schedule | vercel.json updated with 4 new cron entries; existing `/api/cron/discover` unchanged |
| SCORE-01 | System uses Places-specific scoring with higher auto-approve confidence (structured data bonus) | New `scorePlacesCandidate()`: core types → 0.85, secondary types → 0.70 |
| SCORE-02 | System uses higher threshold for Reddit-sourced venues (lower data quality) | Update `discovery-orchestrator.ts` `AUTO_APPROVE_THRESHOLD` env var default from 0.8 to 0.9; add `GEMINI_AUTO_APPROVE = 0.9` constant |
| SCORE-03 | System tracks discovery_method on all discovered sources for per-method scoring | `discovery_method: 'google_places'` on all Places-sourced inserts (column already exists) |
</phase_requirements>

---

## Summary

Phase 23 builds a parallel discovery pipeline using the Google Maps Places API (New) Text Search endpoint. The core challenge is fitting ~50 city searches (with pagination) into 4 Vercel cron functions, each under the 60-second limit. The existing codebase provides almost all building blocks: the dedup engine (`scoreVenueCandidate()`), the promotion path (`promoteSource()`), the DB schema with `google_place_id` columns, and the cron endpoint auth pattern. What is new is the Places API HTTP integration, the `scorePlacesCandidate()` scoring function, the no-website stub staging path, and the 4 per-province cron endpoints.

The Places API (New) Text Search endpoint (`POST https://places.googleapis.com/v1/places:searchText`) returns up to 60 results across at most 3 pages of 20. The `nextPageToken` must be included in the `X-Goog-FieldMask` header to be returned in the response — this is a known gotcha confirmed by community reports. Billing tier is determined by the fields requested: the locked field set (id, displayName, websiteUri, formattedAddress, location, types) spans Essentials and Pro tiers, so all requests will be billed at the Pro SKU.

The dedup strategy is two-step: fast-path exact match on `google_place_id` (already indexed with unique constraint), then fuzzy `scoreVenueCandidate()` name+geo check for unanchored venues. The `p-limit` package (v3.1.0) is already installed in the project and available for throttle implementation if needed, though sequential per-city fetches are simpler and the timeout budget allows it at ~1s per request.

**Primary recommendation:** Build `places-discoverer.ts` as a shared function accepting a city list array, with 4 thin cron route wrappers. Implement sequential city iteration with configurable throttle, follow pagination fully, and apply type filtering in code. Use `scorePlacesCandidate()` for placement scoring and wire into the existing `promoteSource()` path with the no-website stub extension.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fetch` (native) | Node 18+ built-in | HTTP requests to Places API | Already used in geocoder.ts — no new dep needed |
| `drizzle-orm` | ^0.45.1 | DB inserts/updates for discovered_sources, venues | Project ORM — all existing DB code uses it |
| `fastest-levenshtein` | ^1.0.16 | Name ratio for dedup (via venue-dedup.ts) | Already installed, used in scoreVenueCandidate() |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `p-limit` | 3.1.0 | Concurrency cap for parallel city requests | Use if switching to parallel fetch; for sequential, not needed |

**Note:** No new package installations required for this phase. All dependencies are already in `package.json`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | `@googlemaps/google-maps-services-js` | SDK adds 500KB+ but doesn't support Places API (New) Text Search as of early 2026; native fetch is the right choice |
| Sequential city iteration | p-limit parallel | Parallel is faster but harder to reason about for timeout budgeting; sequential is simpler and sufficient |

**No installation required** — all deps already present.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/scraper/
│   └── places-discoverer.ts       # Core: searchCity(), runPlacesDiscovery(), scorePlacesCandidate()
└── app/api/cron/
    ├── discover-places-ns/route.ts  # Nova Scotia cron endpoint
    ├── discover-places-nb/route.ts  # New Brunswick cron endpoint
    ├── discover-places-pei/route.ts # PEI cron endpoint
    └── discover-places-nl/route.ts  # Newfoundland & Labrador cron endpoint
```

### Pattern 1: Text Search (New) HTTP Request
**What:** POST to the Places API with JSON body and header-based field mask
**When to use:** Every per-city search call
**Example:**
```typescript
// Source: https://developers.google.com/maps/documentation/places/web-service/text-search
const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY ?? '',
    // CRITICAL: nextPageToken MUST be in field mask or it won't be returned
    'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.formattedAddress,places.location,places.types,nextPageToken',
  },
  body: JSON.stringify({
    textQuery: `bars nightclubs live music venues in ${city} ${province}`,
    pageSize: 20,
    // pageToken: nextPageToken (on subsequent pages)
  }),
});
const data = await response.json() as PlacesSearchResponse;
```

### Pattern 2: Full Pagination Loop
**What:** Exhaust all pages by following nextPageToken until absent
**When to use:** After every initial city request
**Example:**
```typescript
// Source: https://developers.google.com/maps/documentation/places/web-service/text-search
let allPlaces: PlaceResult[] = [];
let pageToken: string | undefined;

do {
  const body: Record<string, unknown> = {
    textQuery: `bars nightclubs live music venues in ${city} ${province}`,
    pageSize: 20,
  };
  if (pageToken) body.pageToken = pageToken;

  const data = await fetchPlacesPage(body);
  allPlaces = allPlaces.concat(data.places ?? []);
  pageToken = data.nextPageToken;
} while (pageToken);
```

### Pattern 3: scorePlacesCandidate()
**What:** Tier-based scoring function based on place_types membership
**When to use:** After type filtering, before dedup check
**Example:**
```typescript
// Source: CONTEXT.md decisions
const CORE_TYPES = new Set(['bar', 'night_club', 'concert_hall', 'performing_arts_theater', 'comedy_club']);
const SECONDARY_TYPES = new Set(['community_center', 'stadium']);

export function scorePlacesCandidate(types: string[]): number {
  if (types.some(t => CORE_TYPES.has(t))) return 0.85;
  if (types.some(t => SECONDARY_TYPES.has(t))) return 0.70;
  return 0; // Should not reach here — filtered before calling
}
```

### Pattern 4: Two-Step Dedup Before Staging
**What:** google_place_id fast-path, then name+geo fuzzy check
**When to use:** For every place result before inserting into discovered_sources
**Example:**
```typescript
// Step 1: Fast-path dedup by google_place_id
const existingByPlaceId = await db.query.venues.findFirst({
  where: and(
    eq(venues.google_place_id, place.id),
    eq(venues.province, province)
  ),
});
if (existingByPlaceId) {
  // Enrich existing venue with new data and skip staging
  await enrichVenue(existingByPlaceId.id, place);
  continue;
}

// Step 2: Fuzzy dedup via scoreVenueCandidate()
const provinceVenues = await db.select().from(venues).where(eq(venues.province, province));
for (const existing of provinceVenues) {
  const decision = scoreVenueCandidate(
    { name: place.displayName.text, lat: place.location.latitude, lng: place.location.longitude },
    { name: existing.name, lat: existing.lat, lng: existing.lng }
  );
  if (decision.action === 'merge') { /* enrich, skip */ }
  if (decision.action === 'review') { /* stage as pending with context */ }
}
// KEEP_SEPARATE: fall through to normal staging
```

### Pattern 5: No-Website Stub Staging
**What:** Stage a `no_website` record for venues without websiteUri
**When to use:** When `place.websiteUri` is absent
**Example:**
```typescript
// Following Ticketmaster precedent: ticketmaster:province:XX
const syntheticUrl = `places:${place.id}`;  // e.g. "places:ChIJfake123"
const domain = `places.google.com`;          // or 'google-places' — Claude's discretion

await db.insert(discovered_sources).values({
  url: syntheticUrl,
  domain,
  source_name: place.displayName.text,
  province,
  city,
  status: 'no_website',
  discovery_method: 'google_places',
  google_place_id: place.id,
  lat: place.location?.latitude ?? null,
  lng: place.location?.longitude ?? null,
  address: place.formattedAddress ?? null,
  place_types: JSON.stringify(place.types),
  discovery_score: scorePlacesCandidate(place.types),
}).onConflictDoNothing();
```

### Pattern 6: Updating Gemini Threshold (SCORE-02)
**What:** Change `AUTO_APPROVE_THRESHOLD` default in discovery-orchestrator.ts from 0.8 to 0.9
**When to use:** Single line change in existing file
**Example:**
```typescript
// In discovery-orchestrator.ts — change this line:
const AUTO_APPROVE_THRESHOLD = parseFloat(process.env.AUTO_APPROVE_THRESHOLD ?? '0.8');
// To:
const GEMINI_AUTO_APPROVE = parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9');
```

### Pattern 7: Cron Endpoint (per province)
**What:** Thin wrapper that calls shared `runPlacesDiscovery()` with province city list
**When to use:** 4 route files, one per province
**Example:**
```typescript
// src/app/api/cron/discover-places-ns/route.ts
import { runPlacesDiscovery } from '@/lib/scraper/places-discoverer';
import { NS_CITIES } from '@/lib/scraper/places-discoverer';

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await runPlacesDiscovery(NS_CITIES);
    return Response.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Places discovery NS failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

### Pattern 8: vercel.json Cron Entries
**What:** 4 new cron entries staggered across weekdays
**When to use:** Single edit to vercel.json
**Example:**
```json
{
  "crons": [
    { "path": "/api/cron/scrape",               "schedule": "0 6 * * *"   },
    { "path": "/api/cron/discover",              "schedule": "0 8 * * 1"   },
    { "path": "/api/cron/discover-places-ns",    "schedule": "0 9 * * 1"   },
    { "path": "/api/cron/discover-places-nb",    "schedule": "0 9 * * 2"   },
    { "path": "/api/cron/discover-places-pei",   "schedule": "0 9 * * 3"   },
    { "path": "/api/cron/discover-places-nl",    "schedule": "0 9 * * 4"   }
  ]
}
```

### Anti-Patterns to Avoid
- **Single cron for all provinces:** All ~50 cities in one call will exceed 60 seconds — must remain per-province
- **Filtering by includedType in API request:** `includedType` biases but doesn't restrict; post-response type filtering is more reliable and avoids multiple API calls per city
- **Omitting `nextPageToken` from X-Goog-FieldMask:** Known pitfall — the token is NOT returned unless included in the field mask header (confirmed in community issue reports)
- **Inserting no-website venues with status='pending':** They are not promotable — must use status='no_website' from the start to prevent accidental promotion
- **Running dedup against all venues globally:** CONTEXT.md locks dedup scope to same-province only — cross-province dedup is out of scope

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy name dedup | Custom Levenshtein logic | `scoreVenueCandidate()` from `venue-dedup.ts` | Already built and tested with 20+ unit tests |
| geo proximity check | Custom haversine | `haversineDistance()` from `timelapse-utils.ts` | Already used inside `scoreVenueCandidate()` |
| Venue promotion | Custom venue insert | `promoteSource()` from `promote-source.ts` | Carries all Phase 22 fields (lat, lng, address, google_place_id, place_types) |
| Concurrency limiting | Custom queue | `p-limit` v3.1.0 (already installed) | Mature, typed, already in project |
| HTTP fetch | axios or node-fetch | Native `fetch` (Node 18+) | Existing geocoder.ts uses it, no new dep |

**Key insight:** The discovery pipeline shell already exists in `runDiscoveryJob()` — the Places discoverer is the same shape with Places API calls instead of Gemini calls.

---

## Common Pitfalls

### Pitfall 1: nextPageToken Not Returned
**What goes wrong:** Pagination stops after first page (20 results) even when more exist
**Why it happens:** `nextPageToken` is a response-level field, not under `places.*`, and must be explicitly included in `X-Goog-FieldMask` or the API omits it
**How to avoid:** Always include `nextPageToken` (without prefix) in the field mask: `X-Goog-FieldMask: places.id,...,nextPageToken`
**Warning signs:** Always getting exactly 20 results per city with no second page

### Pitfall 2: Billing Tier Escalation
**What goes wrong:** Requests billed at Enterprise tier instead of Pro
**Why it happens:** Adding fields from a higher tier (e.g., `places.photos`, `places.rating`) escalates billing to the highest tier requested
**How to avoid:** Strictly limit field mask to: `places.id, places.displayName, places.websiteUri, places.formattedAddress, places.location, places.types, nextPageToken`
**Warning signs:** Billing showing Enterprise SKU charges instead of Pro

### Pitfall 3: Staging No-Website Venues with Wrong Status
**What goes wrong:** No-website venue stubs get picked up by promoteSource() and fail (status guard throws)
**Why it happens:** Current `promoteSource()` has `if (staged.status !== 'pending') throw` — no-website stubs would have status='no_website'
**How to avoid:** Stage no-website stubs with `status: 'no_website'` from the start; the CONTEXT.md notes that `promoteSource()` no-website promotion path is deferred to Phase 23
**Warning signs:** `promoteSource()` throwing "not pending" errors for no-website stubs

### Pitfall 4: google_place_id Unique Constraint Collision
**What goes wrong:** `onConflictDoNothing()` silently drops a re-discovered venue
**Why it happens:** `discovered_sources_google_place_id_key` unique index exists on `discovered_sources.google_place_id`
**How to avoid:** The fast-path dedup check (step 1) catches existing venues before the insert — if it gets to insert, `onConflictDoNothing()` is the correct behavior for idempotency
**Warning signs:** Enrichment log not appearing for previously-seen venues

### Pitfall 5: Places API (New) Not Enabled on GCP Key
**What goes wrong:** All API calls return 403/PERMISSION_DENIED
**Why it happens:** The `GOOGLE_MAPS_API_KEY` env var is shared with the Geocoding API — Places API (New) is a separate product that must be explicitly enabled in GCP Console
**How to avoid:** Before implementing, verify "Places API (New)" is enabled for the API key in GCP Console (distinct from "Places API" legacy)
**Warning signs:** 403 response on first test call even with valid key

### Pitfall 6: 60-Second Timeout Budget
**What goes wrong:** Province cron times out, truncating discovery mid-run
**Why it happens:** Large provinces (NS: ~15 cities × 3 pages × ~500ms API call = ~22s base) plus dedup DB queries per result can accumulate
**How to avoid:** Log per-city start time; if remaining time < 5s, break and log a "budget exceeded" warning rather than letting Vercel kill mid-insert
**Warning signs:** Cron logs showing incomplete city coverage without error

### Pitfall 7: place_types JSON Format
**What goes wrong:** Type filtering fails because `place.types` is an array but `place_types` column stores it as a JSON string
**Why it happens:** `discovered_sources.place_types` is `text` (not a JSON column) — must `JSON.stringify()` before insert and filter on the raw array before storing
**How to avoid:** Filter `place.types` (the raw array from API) before insert; store `JSON.stringify(place.types)` in the column
**Warning signs:** Type filtering passing through non-venue types

---

## Code Examples

### PlacesSearchResponse TypeScript Interface
```typescript
// Source: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText
interface PlacesSearchResponse {
  places?: Array<{
    id: string;                    // google_place_id
    displayName: { text: string; languageCode: string };
    websiteUri?: string;           // absent for no-website venues
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    types?: string[];              // e.g. ["bar", "night_club", "establishment"]
  }>;
  nextPageToken?: string;          // absent when no more pages
}
```

### VENUE_PLACE_TYPES Filter Constant
```typescript
// Source: CONTEXT.md decisions
export const VENUE_PLACE_TYPES = new Set([
  'bar',
  'night_club',
  'concert_hall',
  'performing_arts_theater',
  'comedy_club',
  'community_center',
  'stadium',
]);

export function isVenueRelevant(types: string[]): boolean {
  return types.some(t => VENUE_PLACE_TYPES.has(t));
}
```

### Atlantic Canada City List Structure
```typescript
// Source: CONTEXT.md decisions — full list TBD by planner, sample structure:
export const PLACES_CITIES: Record<string, Array<{ city: string; province: string }>> = {
  NS: [
    { city: 'Halifax', province: 'NS' },
    { city: 'Dartmouth', province: 'NS' },
    { city: 'Sydney', province: 'NS' },
    { city: 'Truro', province: 'NS' },
    // ... ~15 total for NS
  ],
  NB: [
    { city: 'Moncton', province: 'NB' },
    { city: 'Saint John', province: 'NB' },
    { city: 'Fredericton', province: 'NB' },
    // ... ~12 total for NB
  ],
  PEI: [
    { city: 'Charlottetown', province: 'PEI' },
    { city: 'Summerside', province: 'PEI' },
    // ... ~4 total for PEI
  ],
  NL: [
    { city: "St. John's", province: 'NL' },
    { city: 'Mount Pearl', province: 'NL' },
    { city: 'Corner Brook', province: 'NL' },
    // ... ~10 total for NL
  ],
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single threshold 0.8 for all methods | Per-method: PLACES=0.8, GEMINI=0.9 | Phase 23 | Gemini discovery quality is lower — higher bar reduces false positives |
| 6 cities (Gemini) | ~50+ cities (Places + Gemini) | Phase 23 | Mass expansion to all Atlantic communities 2k+ population |
| Domain-based dedup (hostname match) | google_place_id fast-path + name+geo fuzzy | Phase 22-23 | Anchors Places venues to existing DB entries without URL matching |
| Places venues without websites discarded | Staged as no_website stubs | Phase 23 | Dedup anchors for Ticketmaster cross-referencing |

**Deprecated/outdated:**
- `AUTO_APPROVE_THRESHOLD = 0.8` in discovery-orchestrator.ts: Replaced by `GEMINI_AUTO_APPROVE = 0.9` constant in Phase 23

---

## Open Questions

1. **promoteSource() no-website path**
   - What we know: Current `promoteSource()` throws if `status !== 'pending'`. No-website stubs have `status = 'no_website'`.
   - What's unclear: Does Phase 23 implement promotion of no-website stubs (creating a venue row without a scrape_source), or only staging them?
   - Recommendation: The CONTEXT.md note says "no_website promotion path deferred to Phase 23" — Phase 23 should update `promoteSource()` to handle `status = 'no_website'` by creating a venue row but skipping scrape_sources insert.

2. **Exact synthetic URL / domain pattern for no-website venues**
   - What we know: CONTEXT.md says follow Ticketmaster precedent (`ticketmaster:province:XX`) — planner recommendation: `places:{google_place_id}` with domain `google-places` (short, queryable).
   - What's unclear: Whether `domain` column needs to be a real hostname for any downstream code that parses it.
   - Recommendation: Use `google-places` as domain string (non-parseable-as-URL is fine — existing code uses `new URL()` with try/catch).

3. **Timeout budget per province**
   - What we know: NS is largest (~15 cities). Text Search returns up to 60 results per city (3 pages). At ~500ms per API call, 15 cities × 3 pages = 22.5s for API calls alone, plus DB dedup queries.
   - What's unclear: Whether DB dedup queries per result (loading all province venues) will exceed budget for NS.
   - Recommendation: Load province venues once before the city loop (not per-result), then iterate in memory.

4. **Places API (New) rate limit**
   - What we know: Official docs do not state a specific QPM. The GCP Console shows project quotas.
   - What's unclear: Whether ~50 requests/run will hit default QPM limits.
   - Recommendation: Add 500ms throttle between cities as a precaution (env var `PLACES_THROTTLE_MS`); can be tuned down if no rate errors observed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 |
| Config file | `jest.config.ts` (root) |
| Quick run command | `npx jest src/lib/scraper/places-discoverer.test.ts --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLACES-01 | `searchCity()` calls Places API with correct textQuery | unit | `npx jest places-discoverer.test.ts -t "searchCity"` | ❌ Wave 0 |
| PLACES-02 | `isVenueRelevant()` filters to only venue place types | unit | `npx jest places-discoverer.test.ts -t "isVenueRelevant"` | ❌ Wave 0 |
| PLACES-03 | Throttle delay is called between city requests | unit | `npx jest places-discoverer.test.ts -t "throttle"` | ❌ Wave 0 |
| PLACES-04 | google_place_id match skips staging and enriches venue | unit | `npx jest places-discoverer.test.ts -t "dedup"` | ❌ Wave 0 |
| PLACES-05 | Venue with websiteUri is staged as pending | unit | `npx jest places-discoverer.test.ts -t "websiteUri"` | ❌ Wave 0 |
| PLACES-06 | Venue without websiteUri staged as no_website | unit | `npx jest places-discoverer.test.ts -t "no.website"` | ❌ Wave 0 |
| PLACES-07 | google_place_id stored on discovered_sources insert | unit | `npx jest places-discoverer.test.ts -t "google_place_id"` | ❌ Wave 0 |
| GEO-01 | PLACES_CITIES has entries for all 4 provinces | unit | `npx jest places-discoverer.test.ts -t "PLACES_CITIES"` | ❌ Wave 0 |
| GEO-02 | Each province cron route calls runPlacesDiscovery with its city list | unit | `npx jest discover-places-ns/route.test.ts` | ❌ Wave 0 |
| GEO-03 | Gemini discover cron schedule unchanged in vercel.json | manual | inspect vercel.json | N/A |
| SCORE-01 | `scorePlacesCandidate()` returns 0.85 for core types, 0.70 for secondary | unit | `npx jest places-discoverer.test.ts -t "scorePlacesCandidate"` | ❌ Wave 0 |
| SCORE-02 | Gemini discoverer auto-approves at 0.9 threshold | unit | `npx jest discovery-orchestrator.test.ts -t "auto-approve"` | existing (update needed) |
| SCORE-03 | discovery_method='google_places' on all Places inserts | unit | `npx jest places-discoverer.test.ts -t "discovery_method"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest src/lib/scraper/places-discoverer.test.ts --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/scraper/places-discoverer.test.ts` — covers PLACES-01 through PLACES-07, GEO-01, SCORE-01, SCORE-03
- [ ] `src/app/api/cron/discover-places-ns/route.test.ts` — covers GEO-02, mirrors existing `discover/route.test.ts`
- [ ] `src/app/api/cron/discover-places-nb/route.test.ts` — same pattern
- [ ] `src/app/api/cron/discover-places-pei/route.test.ts` — same pattern
- [ ] `src/app/api/cron/discover-places-nl/route.test.ts` — same pattern

*(SCORE-02 uses existing `discovery-orchestrator.test.ts` but Test 8/9 must be updated when threshold changes from 0.8 to 0.9)*

---

## Sources

### Primary (HIGH confidence)
- [Google Places API Text Search (New) docs](https://developers.google.com/maps/documentation/places/web-service/text-search) — endpoint URL, request format, field mask, pagination, response shape
- [Google Places API searchText REST reference](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText) — full request/response schema
- `src/lib/scraper/discovery-orchestrator.ts` — existing cron pattern, `scoreCandidate()`, throttle, auto-promote flow
- `src/lib/scraper/venue-dedup.ts` — `scoreVenueCandidate()` API, thresholds
- `src/lib/scraper/promote-source.ts` — Phase 22 updated carry-through for lat/lng/address/google_place_id/place_types
- `src/lib/db/schema.ts` — confirmed column presence: `discovered_sources.google_place_id`, `venues.google_place_id`, unique indexes

### Secondary (MEDIUM confidence)
- [Places API Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) — field mask determines billing tier; Essentials/Pro/Enterprise SKU structure
- Community reports (Google Issue Tracker, googleapis/google-cloud-node#5385) — `nextPageToken` must be in field mask to be returned

### Tertiary (LOW confidence)
- `p-limit` installation in `node_modules` — v3.1.0 confirmed present; available for throttle if needed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all confirmed present
- Architecture: HIGH — endpoint spec confirmed from official docs; existing code patterns directly applicable
- Pitfalls: HIGH (pitfalls 1, 5 verified from official docs/community), MEDIUM (pitfalls 2, 3, 4, 6, 7 from code analysis)
- Test framework: HIGH — jest.config.ts confirmed, existing test patterns directly reusable

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (Places API (New) is stable; billing structure changes infrequently)
