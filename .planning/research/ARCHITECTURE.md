# Architecture Research

**Domain:** Event discovery app — bulk venue discovery integration (v2.0)
**Researched:** 2026-03-15
**Confidence:** HIGH (based on direct codebase analysis); MEDIUM on external API specifics (Places billing, Reddit API stability)

---

## Context: What Already Exists

This is a subsequent-milestone document. The architecture is not greenfield — it is a working Next.js 16 + Neon Postgres + Drizzle + Vercel Hobby app (v1.5, shipped). All design decisions must integrate with, not replace, the existing system.

**Core constraint: Vercel Hobby plan — 60s function timeout, no persistent processes.**

Existing pipeline (v1.5 confirmed by direct code read):

```
Vercel Cron (daily @ 06:00)
    └── /api/cron/scrape
            └── runScrapeJob()
                    ├── venue_website → fetchAndPreprocess → JSON-LD | Gemini → upsertEvent
                    ├── ticketmaster  → scrapeTicketmaster → findOrCreateVenue → upsertEvent
                    ├── eventbrite    → scrapeEventbrite → upsertEvent
                    └── bandsintown   → scrapeBandsintown → upsertEvent

Vercel Cron (weekly @ 08:00 Mon)
    └── /api/cron/discover
            └── runDiscoveryJob()
                    ├── Query Gemini+Google Search per city (6 cities × 1 prompt each)
                    ├── Filter aggregator domains + known domains
                    ├── Insert into discovered_sources (status='pending')
                    └── scoreCandidate() → auto-approve if score >= AUTO_APPROVE_THRESHOLD (0.8)
```

The `discovered_sources` table is the staging funnel. Everything new in v2.0 should pour into this same funnel. No new review infrastructure is needed — the admin discovery UI already handles pending/approve/reject.

---

## System Overview: v2.0 Additions

Two new discovery channels feed the existing `discovered_sources` funnel. No new review UI required. New schema columns carry Places API metadata through to promotion to avoid redundant geocoding calls.

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Vercel Cron (weekly — Mon or new day)               │
│               /api/cron/discover  OR  /api/cron/places-discover        │
├────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┐    ┌────────────────────────────────┐   │
│  │  EXISTING                │    │  NEW (v2.0)                    │   │
│  │  Gemini + Google Search  │    │  Google Maps Places API        │   │
│  │  (6 → N cities)          │    │  Text Search per city+type     │   │
│  └────────────┬─────────────┘    └────────────────┬───────────────┘   │
│               │                                   │                   │
│               └──────────────┬────────────────────┘                   │
│                              ▼                                         │
│              Shared dedup (knownDomains Set)                           │
│              db.insert(discovered_sources).onConflictDoNothing()       │
│              scoreCandidate() [per-method threshold]                   │
│              promoteSource() for auto-approved candidates              │
└──────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│              SEPARATE Vercel Cron (new — e.g. Wed)                     │
│              /api/cron/reddit-discover                                  │
├────────────────────────────────────────────────────────────────────────┤
│  Reddit public JSON API (no auth required)                              │
│  → fetch r/halifax, r/fredericton, r/stjohnsnl, r/newbrunswick, etc.   │
│  → Gemini batch extraction: venue names + URLs from post text          │
│  → Same discovered_sources funnel (discovery_method='reddit_gemini')   │
│  → Higher auto-approve threshold (0.9) for lower-precision source      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### New Components

| Component | Type | Responsibility |
|-----------|------|----------------|
| `places-discoverer.ts` | NEW module | Calls Google Maps Places API Text Search per city+type combo, extracts name/address/website/lat/lng/place_id, returns `DiscoveredCandidate[]` |
| `reddit-discoverer.ts` | NEW module | Fetches subreddit JSON, batches post text to Gemini for venue extraction, returns `DiscoveredCandidate[]` |
| `/api/cron/reddit-discover/route.ts` | NEW cron route | Isolated endpoint for Reddit mining; same CRON_SECRET auth pattern as existing crons; `maxDuration = 60` |

### Modified Components

| Component | Change | Rationale |
|-----------|--------|-----------|
| `discovery-orchestrator.ts` → `runDiscoveryJob()` | Call `runPlacesDiscovery()` before or instead of Gemini+Search loop (see Pattern 2 for timing concern) | Places API is the primary new channel |
| `scoreCandidate()` | Accept `discoveryMethod` param; apply per-method base score and auto-approve threshold | Places = higher confidence; Reddit = lower precision |
| `promoteSource()` | Check `discovered_sources.lat/lng` and skip `geocodeAddress()` if pre-populated | Avoids redundant Geocoding API call for Places-confirmed venues |
| `discovered_sources` table | Add `address`, `google_place_id`, `lat`, `lng` columns | Carry Places API structured data through to promotion |
| `venues` table | Add `google_place_id` column (unique) | Dedup anchor for cross-source venue matching |
| `vercel.json` | Add Reddit cron entry | Independent schedule |
| `ATLANTIC_CITIES` constant | Expand from 6 to ~20 cities/towns | Geographic expansion is a config change once the machinery works |

### Unchanged Components

| Component | Notes |
|-----------|-------|
| Admin discovery UI (`/admin/discovery`) | All new candidates flow through existing pending/approve/reject UI; no changes needed |
| `promoteSource()` core logic | Venue + scrape_source creation logic unchanged; only the geocode-skip optimization is added |
| `upsertEvent()` / `normalizer.ts` | Unchanged; all discovered venues are scraped via the existing daily cron once promoted |
| `venue-dedup.ts` / `scoreVenueCandidate()` | Unchanged; Places `google_place_id` provides a fast-path match before fuzzy scoring kicks in |
| `findOrCreateVenue()` (ticketmaster.ts) | Consider adding `google_place_id` exact-match as a fast path, but not required for v2.0 |

---

## Recommended Project Structure

New files only (existing structure unchanged):

```
src/
├── lib/
│   └── scraper/
│       ├── places-discoverer.ts        # NEW: Google Maps Places API bulk discovery
│       ├── places-discoverer.test.ts   # NEW: unit tests with mocked fetch
│       ├── reddit-discoverer.ts        # NEW: Reddit JSON → Gemini venue extraction
│       ├── reddit-discoverer.test.ts   # NEW: unit tests
│       └── discovery-orchestrator.ts   # MODIFIED: add Places channel
├── app/
│   └── api/
│       └── cron/
│           └── reddit-discover/
│               └── route.ts            # NEW: separate cron endpoint
└── lib/
    └── db/
        └── schema.ts                   # MODIFIED: new columns on discovered_sources + venues
```

### Structure Rationale

- **places-discoverer.ts**: Parallel to `discovery-orchestrator.ts` — same output contract, different source. Isolated for testing and independent development.
- **reddit-discoverer.ts**: Completely different input flow (Reddit HTTP → Gemini NLP). Separate module keeps concerns clean.
- **Separate `/api/cron/reddit-discover` route**: Reddit mining requires multiple subreddit fetches + multiple Gemini calls. Runs on its own schedule to avoid timeout competition with Places discovery.
- No new admin routes: the existing `/admin/discovery` handles all new candidates without modification.

---

## Architectural Patterns

### Pattern 1: Discovery Channel Protocol (Shared Output Contract)

**What:** Each discovery channel (Gemini+Search, Places API, Reddit) produces the same `DiscoveredCandidate` shape. The shared dedup + insert + score flow in the orchestrator is channel-agnostic.

**When to use:** Any new discovery source added in the future.

**Trade-offs:** Channel-specific metadata (e.g., `google_place_id`) must be optional fields in the shared type. Orchestrator stays clean; each channel develops independently.

**Example:**
```typescript
// Extend the existing inline candidate type to a shared interface:
interface DiscoveredCandidate {
  url: string | null;           // null = venue confirmed but no scrapeable website
  name: string | null;
  province: string | null;
  city: string | null;
  rawContext: string | null;
  address: string | null;       // formattedAddress from Places API
  googlePlaceId: string | null; // Places API place_id for dedup
  lat: number | null;           // pre-geocoded from Places API
  lng: number | null;
  discoveryMethod: 'gemini_google_search' | 'google_places' | 'reddit_gemini';
}
```

### Pattern 2: Segmented Cron Jobs (60s Timeout Mitigation)

**What:** Each discovery channel runs as its own cron endpoint on a separate schedule rather than stacking in one 60s window.

**When to use:** Any discovery channel that needs more than ~15s of its own budget, or when stacking two channels risks exceeding 60s.

**Trade-offs:** More entries in `vercel.json`, but each job is independently observable, retryable, and measurable. Failure in one channel doesn't block others.

**Recommended schedule:**
```json
{
  "crons": [
    { "path": "/api/cron/scrape",          "schedule": "0 6 * * *" },
    { "path": "/api/cron/discover",        "schedule": "0 8 * * 1" },
    { "path": "/api/cron/reddit-discover", "schedule": "0 8 * * 3" }
  ]
}
```

The Monday `discover` cron is modified to run Places API discovery (either instead of or alongside the existing Gemini+Search). Reddit runs Wednesday independently.

### Pattern 3: Places API as Pre-Geocoded Venue Factory

**What:** Google Maps Places API Text Search returns `displayName`, `formattedAddress`, `websiteUri`, `nationalPhoneNumber`, `location` (lat/lng), and `id` (place_id) in a single call. This is structurally richer than Gemini+Search output.

**When to use:** Primary discovery channel for structured bulk venue discovery.

**Trade-offs:** Per-request billing (Text Search costs ~$0.017/request — MEDIUM confidence, verify current pricing before finalizing the city+type query plan). For ~50 queries/week = ~$0.85/week = ~$3.50/month. Well within budget at this scale. `websiteUri` is populated for approximately 60-70% of bars/venues in Atlantic Canada (MEDIUM confidence based on regional data density — smaller towns may have lower coverage).

**Implementation note — venues without `websiteUri`:** Insert with `url = null` and `status = 'no_website'`. These venues are valuable as dedup anchors (Ticketmaster may later create a venue with the same name). They cannot be scraped but the `google_place_id` provides a future cross-reference.

**Recommended query strategy:**
```
For each city in ATLANTIC_CITIES:
  For each type in ['bar', 'pub', 'live music venue', 'comedy club',
                    'theater', 'concert hall', 'community center']:
    POST /v1/places:searchText
    body: { textQuery: "{type} in {city}, {province}, Canada",
            locationRestriction: { circle: { center: {cityLatLng}, radius: 15000 } } }
    headers: { "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,
                                     places.websiteUri,places.location" }
```

7 type queries × 20 cities = 140 requests/week maximum. With `onConflictDoNothing()` on `google_place_id`, duplicate places across type queries cost nothing in DB operations.

### Pattern 4: Reddit Mining via Public JSON (No OAuth)

**What:** Reddit exposes a public JSON API at `https://www.reddit.com/r/{subreddit}/new.json?limit=100` — no authentication, no OAuth. Post `selftext` + `title` are batched and sent to Gemini with a structured extraction prompt.

**When to use:** Supplementary discovery of informal venues that lack Google Places data (house venues, community halls, breweries that post events on Reddit but are not well-indexed).

**Trade-offs:** Lower precision than Places API. Gemini will sometimes extract event descriptions, not venues. Mitigate with a higher auto-approve threshold (0.9 vs 0.8) for `discovery_method = 'reddit_gemini'`. The `url` field will frequently be null or point to Facebook/Eventbrite — filter these with the existing `AGGREGATOR_DOMAINS` check.

**Target subreddits:** r/halifax, r/fredericton, r/saintjohn, r/newbrunswick, r/pei, r/newfoundland, r/stjohnsnl

**Rate limit:** Reddit public JSON allows ~60 requests/minute without auth. 7 subreddits = 7 requests. Well within limits. Set `User-Agent: eastcoastlocal/2.0` header to avoid bot-detection blocks.

**Gemini prompt approach:**
```
Feed 100 post titles+bodies per subreddit as one batch to Gemini.
Ask for: venue name, address/city, province, website URL, and a confidence score.
Filter output: drop any where confidence < 0.6.
Map to DiscoveredCandidate[].
```

---

## Data Flow

### Places API Discovery Flow

```
/api/cron/discover (Monday, extended) or /api/cron/places-discover
    ↓
runPlacesDiscovery(cities: CityConfig[])
    ↓
For each city × venue_type combo:
    POST https://places.googleapis.com/v1/places:searchText
    [throttle: ~200ms between requests to stay within rate limits]
    ↓
    Receive: places[].id, displayName, formattedAddress, websiteUri, location
    ↓
    For each place:
        Extract hostname from websiteUri (if present)
        Skip if hostname in knownDomains Set
        Skip if place.id in knownPlaceIds Set (intra-run dedup)
        Map to DiscoveredCandidate
    ↓
    Return candidates[]
    ↓
Back in orchestrator:
    db.insert(discovered_sources).values({...}).onConflictDoNothing()
    [conflict on: url (existing unique constraint) OR google_place_id (new unique constraint)]
    ↓
    scoreCandidate(candidate, method='google_places')
    → base score: 0.6 (structured data, confirmed address)
    → +0.15 if city populated, +0.15 if province populated, +0.1 if name
    → auto-approve threshold: 0.8
    ↓
    if score >= 0.8: promoteSource(staged.id)
```

### Promotion Flow (Modified for Pre-Geocoded Venues)

```
promoteSource(discoveredId)
    ↓
    Fetch discovered_sources row
    ↓
    if row.lat IS NOT NULL AND row.lng IS NOT NULL:
        → use row.lat, row.lng directly in venue INSERT
        → skip geocodeAddress() call entirely
    else if row.address IS NOT NULL:
        → geocodeAddress(row.address) [existing logic, better input than city+province only]
    else:
        → geocodeAddress(`${city}, ${province}, Canada`) [existing fallback]
    ↓
    INSERT venues (name, address, city, province, lat, lng, google_place_id)
    ↓
    if row.url IS NOT NULL:
        INSERT scrape_sources (url, venue_id, source_type='venue_website', enabled=true)
    else:
        skip scrape_sources insert (no_website venues)
    ↓
    UPDATE discovered_sources SET status='approved'
```

### Reddit Discovery Flow

```
/api/cron/reddit-discover (Wednesday)
    ↓
runRedditDiscovery(subreddits: string[])
    ↓
For each subreddit:
    GET https://www.reddit.com/r/{sub}/new.json?limit=100
    headers: { 'User-Agent': 'eastcoastlocal/2.0' }
    ↓
    Extract post titles + selftexts
    ↓
    generateText(Gemini, batchPrompt)
    → Output.object({ schema: CandidateSchema })
    → Reuse existing CandidateSchema from discovery-orchestrator.ts
    ↓
    Filter: aggregator domains, known domains
    ↓
    db.insert(discovered_sources).onConflictDoNothing()
    ↓
    scoreCandidate(candidate, method='reddit_gemini')
    → auto-approve threshold: 0.9 (higher bar for unstructured source)
```

---

## Schema Changes Required

### `discovered_sources` table additions

```typescript
// Add to existing pgTable:
address: text('address'),                     // formattedAddress from Places API
google_place_id: text('google_place_id'),     // unique Places place_id — dedup key
lat: doublePrecision('lat'),                  // pre-geocoded from Places API
lng: doublePrecision('lng'),                  // pre-geocoded from Places API
```

**Index recommendation:** Add a unique index on `google_place_id` (nullable — PostgreSQL allows multiple NULLs in unique indexes, so this is safe for non-Places rows).

### `venues` table additions

```typescript
// Add to existing pgTable:
google_place_id: text('google_place_id').unique(),  // dedup anchor for cross-source matching
```

### `discovered_sources` status expansion

Current accepted values: `pending`, `approved`, `rejected`
New value: `no_website` — venues confirmed by Places API with no `websiteUri`. Admin UI should show these distinctly (filter chip or separate section).

---

## Integration Points Summary

### New vs Modified (explicit)

| Component | Status | Integration Point |
|-----------|--------|-------------------|
| `places-discoverer.ts` | NEW | Feeds `DiscoveredCandidate[]` to orchestrator; uses `GOOGLE_MAPS_API_KEY` (existing env var — confirm Places API enabled on GCP key) |
| `reddit-discoverer.ts` | NEW | Feeds `DiscoveredCandidate[]` to separate cron; uses existing Gemini AI SDK |
| `/api/cron/reddit-discover/route.ts` | NEW | Same CRON_SECRET auth + `maxDuration = 60` pattern as existing crons |
| `discovery-orchestrator.ts` | MODIFIED | `runDiscoveryJob()` extended or split; `ATLANTIC_CITIES` expanded |
| `scoreCandidate()` | MODIFIED | Per-method thresholds added; existing signature extended |
| `promoteSource()` | MODIFIED | Pre-populated lat/lng/address used when available; geocoder call skipped |
| `discovered_sources` table | MODIFIED | 4 new columns via Drizzle migration |
| `venues` table | MODIFIED | `google_place_id` column via Drizzle migration |
| `vercel.json` | MODIFIED | Reddit cron entry added |
| Admin discovery UI | UNCHANGED | No changes needed; all new candidates flow through existing review |
| `upsertEvent()`, `normalizer.ts` | UNCHANGED | All promoted venues scrape via existing daily cron |
| `venue-dedup.ts` | UNCHANGED | Two-signal gate still applies when Ticketmaster creates venues |

### External Service Boundaries

| Service | Auth | Notes |
|---------|------|-------|
| Google Maps Places API (New) | `X-Goog-Api-Key: $GOOGLE_MAPS_API_KEY` | Uses same key as geocoder.ts. Verify Places API is enabled in GCP Console — geocoder uses Geocoding API, which is a separate product. |
| Reddit public JSON | None (set User-Agent header) | `https://www.reddit.com/r/{sub}/new.json?limit=100`. No OAuth. Stable public endpoint. |
| Gemini (`@ai-sdk/google`) | `GOOGLE_GENERATIVE_AI_API_KEY` (existing) | No new packages. Reddit mining adds ~7 Gemini calls/week (one per subreddit). |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 26 venues (current v1.5) | Serial scrape cron runs in ~30-40s |
| 100-200 venues (near-term v2.0 target) | Monitor scrape cron duration. Start enabling `scrape_frequency='weekly'` for low-yield sources to keep daily cron under 60s. |
| 300-500 venues | Serial cron will exceed 60s. Options: (a) shard by province across two cron endpoints, (b) upgrade to Vercel Pro ($20/mo, 300s limit), (c) move to Vercel Pro and use a background job queue. |
| Discovery scale | 140 Places queries/week + 7 Reddit fetches + 7 Gemini calls is trivial at any scale. |

### First Bottleneck: The Scrape Cron

The daily scrape cron is serial (`for source of sources`). At ~26 venues with Gemini throttle at 4000ms, it runs in ~30-40s. At 200 enabled venue_website sources, it would take ~800s — far over the 60s limit.

Mitigations available today (no infrastructure change):
1. Set `scrape_frequency = 'weekly'` for venues with low event turnover
2. Reduce `SCRAPE_THROTTLE_MS` for paid Gemini tier (already supported via env var)
3. Skip Gemini for venues that consistently return JSON-LD (already implemented)

Mitigation requiring change:
- Shard: split sources into buckets by province, run four separate crons on different hours

### Second Bottleneck: Venue Dedup at Scale

The `findOrCreateVenue()` call in `scrapeTicketmaster()` loads all venues in a city for fuzzy matching. At 500 venues this is still fast (city-scoped, in-memory Levenshtein). At 10,000 venues it may degrade. Not a concern for Atlantic Canada scale.

---

## Anti-Patterns

### Anti-Pattern 1: Stacking Places Discovery Inside the Existing 60s Discover Cron

**What people do:** Add `await runPlacesDiscovery()` directly at the top of `runDiscoveryJob()`.

**Why it's wrong:** The existing Gemini+Search loop already uses ~20-30s (6 cities × 2s throttle + Gemini latency). Adding 140 Places API calls with inter-request throttle will reliably exceed 60s.

**Do this instead:** Run Places discovery as its own cron endpoint on a separate day, or replace the Gemini+Search discovery on Mondays with Places discovery (Gemini+Search is lower-value once Places API covers the same geography).

### Anti-Pattern 2: Global Auto-Approve Threshold for All Discovery Methods

**What people do:** Keep `AUTO_APPROVE_THRESHOLD = 0.8` and apply it uniformly.

**Why it's wrong:** Reddit-mined candidates have lower precision than Places API candidates (unstructured Gemini extraction from social media text). Auto-approving at 0.8 will promote bad venue rows.

**Do this instead:** Apply per-method thresholds. `google_places` = 0.8 (structured, address confirmed). `gemini_google_search` = 0.8 (existing, keep). `reddit_gemini` = 0.9 (higher bar). The `discovery_method` column is already in `discovered_sources` — use it.

### Anti-Pattern 3: Treating `url = null` Venues as Incomplete / Skippable

**What people do:** Add a `WHERE url IS NOT NULL` guard in the Places discovery output, skipping venues without websites.

**Why it's wrong:** Many real Atlantic Canada venues — community halls, seasonal festival spaces, small bars — have no dedicated website. Their Places entry still provides name + address + `google_place_id`. This is valuable as a dedup anchor when Ticketmaster creates a venue with the same name.

**Do this instead:** Insert with `status = 'no_website'`. The `google_place_id` becomes the cross-source dedup key. When Ticketmaster later creates a venue with the same name, `findOrCreateVenue()` can check `google_place_id` for a fast-path match (future enhancement, not required for v2.0).

### Anti-Pattern 4: Creating a New Review Flow for Places/Reddit Sources

**What people do:** Build separate admin pages for "Google Places candidates" and "Reddit candidates" with different review actions.

**Why it's wrong:** The existing `/admin/discovery` UI with pending/approve/reject already handles all cases. The `discovery_method` column already provides attribution. Adding separate flows fragments the review queue and doubles admin UI complexity.

**Do this instead:** Add a `discovery_method` filter chip to the existing review page if needed (minor UI change). All sources use the same `promoteSource()` action.

### Anti-Pattern 5: Storing Full Places API Response as Raw JSON

**What people do:** Add a `places_api_raw jsonb` column to preserve the full API response for future use.

**Why it's wrong:** Most Places API fields (hours, ratings, reviews, photos) change constantly and are not used by this app. Storing them inflates the row size and creates maintenance confusion about what's current.

**Do this instead:** Store only the four durable fields: `google_place_id` (dedup key, permanent), `address` (stable), `lat` (stable), `lng` (stable).

---

## Suggested Build Order

### Phase 1: Schema Migration
**Rationale:** Foundation for everything else. Pure migration, no logic changes, safe to ship independently.
- Add `address`, `google_place_id`, `lat`, `lng` to `discovered_sources`
- Add `google_place_id` to `venues`
- No application changes; migration only

### Phase 2: Places API Discoverer
**Rationale:** Highest value, most structured input. Build and test in isolation before wiring to orchestrator.
- Implement `places-discoverer.ts`
- Verify `GOOGLE_MAPS_API_KEY` has Places API (New) enabled in GCP Console (separate from Geocoding API)
- Unit-test with mocked `fetch` responses
- Confirm field mask and billing implications

### Phase 3: Orchestrator Integration + Score Tuning
**Rationale:** Wire the Places channel into the discovery pipeline. Tune scoring after seeing real output.
- Decide: extend `runDiscoveryJob()` or create separate `/api/cron/places-discover` route (prefer separate due to timeout risk)
- Extend `scoreCandidate()` with per-method thresholds
- Modify `promoteSource()` for pre-populated lat/lng/address optimization
- Update `vercel.json` schedule
- Expand `ATLANTIC_CITIES` to cover all Atlantic Canada (20+ cities/towns)

### Phase 4: Reddit Discoverer
**Rationale:** Lower precision than Places; build after the high-quality path is working and you have a baseline for what good candidates look like.
- Implement `reddit-discoverer.ts`
- Create `/api/cron/reddit-discover` route
- Apply 0.9 auto-approve threshold for Reddit-sourced candidates
- Add to `vercel.json`

### Phase 5: Admin UI — `no_website` Filter (Optional)
**Rationale:** Only needed if `no_website` candidates create confusion in the review queue. The existing UI handles them; this is polish.
- Add `no_website` filter chip to `/admin/discovery`
- Show Google Maps link (using `google_place_id`) in discovery review card

---

## Sources

- Direct codebase analysis of `src/lib/scraper/`, `src/lib/db/schema.ts`, `src/app/api/cron/` (HIGH confidence — read directly)
- Google Maps Places API (New) Text Search endpoint, field mask format, `X-Goog-FieldMask` header pattern: training data knowledge (MEDIUM confidence — verify current billing and field availability at https://developers.google.com/maps/documentation/places/web-service/text-search)
- Reddit public JSON API (`/r/{sub}/new.json`): training data knowledge (MEDIUM confidence — API has been stable; verify `User-Agent` requirement at current Reddit API policy)
- Vercel Hobby plan 60s limit: confirmed in existing codebase via `maxDuration = 60` in all cron route files (HIGH confidence)
- `GOOGLE_MAPS_API_KEY` env var: confirmed in `src/lib/scraper/geocoder.ts` (HIGH confidence)
- `discovery_method` column in `discovered_sources`: confirmed in `src/lib/db/schema.ts` (HIGH confidence)
- `AUTO_APPROVE_THRESHOLD` env var with 0.8 default: confirmed in `src/lib/scraper/discovery-orchestrator.ts` (HIGH confidence)

---
*Architecture research for: East Coast Local — v2.0 Mass Venue Discovery*
*Researched: 2026-03-15*
