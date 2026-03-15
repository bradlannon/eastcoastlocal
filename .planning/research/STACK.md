# Stack Research

**Domain:** Mass venue discovery — Google Maps Places API + Reddit mining + bulk onboarding (v2.0)
**Researched:** 2026-03-15
**Confidence:** HIGH (integration points verified against codebase; external API contracts from training knowledge, flagged where uncertain)

## Summary

The v2.0 milestone adds three new data acquisition surfaces: Google Maps Places API bulk search, Reddit post mining via Gemini, and an expanded city list for geographic coverage. The headline finding is that **no new npm packages are required** for these features. The existing integration patterns — direct REST API calls via `fetch()`, Gemini via `@ai-sdk/google`, and Drizzle for persistence — handle all three surfaces cleanly.

The one optional addition is `p-limit` for controlled concurrency when running hundreds of Places API searches in parallel. It is not strictly required (sequential execution with `await delay()` already works), but it meaningfully reduces total cron execution time for a 50+ city sweep.

---

## What Changes vs What Stays the Same

### No Change Needed

| Existing Capability | Why It Covers v2.0 Needs |
|--------------------|--------------------------|
| `@ai-sdk/google` + `generateText` + `Output.object` | Handles Reddit text mining the same way it handles Gemini discovery today — pass post text, get structured venue candidates back |
| Direct `fetch()` to Google Maps REST APIs | Places API (new) v1 uses the same fetch-based pattern as the existing geocoder |
| `discovered_sources` table + `promoteSource()` | Staging pipeline already exists; Places-discovered venues flow through the same approval path |
| `scoreCandidate()` in `discovery-orchestrator.ts` | Scoring and auto-approve logic already written; extend threshold, not replace |
| `fastest-levenshtein` + `venue-dedup.ts` | Venue dedup already prevents duplicate rows when Places API finds venues already in DB |

### New or Expanded

| Item | What It Is | Size |
|------|------------|------|
| Places API `searchText` calls | New REST call pattern (not geocoding) | ~20 lines in a new `places-discovery.ts` |
| Reddit public JSON API calls | New REST call pattern to `reddit.com/*.json` | ~15 lines in a new `reddit-discovery.ts` |
| Expanded `ATLANTIC_CITIES` config | Config constant, not a package | +30 towns added to existing array |
| `p-limit` (optional) | Concurrency limiter for parallel Places sweeps | 3 kB, zero dependencies |

---

## New Library: One Optional Package

### `p-limit` for controlled concurrency

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| p-limit | ^6.1.0 | Limit concurrent async calls to a configurable max | The Places API NearbySearch and Text Search endpoints have per-second and per-day quota limits. Running 50+ city queries in a plain `Promise.all()` risks hitting the per-second quota and rate errors. `p-limit` caps in-flight promises to e.g. 5 at once with no external state. Zero dependencies, 3 kB, ESM-native, Node 18+ compatible. |

**Why not `p-queue`?** p-queue (^8.0.0) adds priority queuing and interval-based rate limiting. Useful if the app needs to throttle to exactly N req/s. For this use case — a nightly cron where approximate concurrency of 5 is sufficient — the simpler API of `p-limit` avoids configuration overhead.

**Why `p-limit` over the existing `await delay()` pattern?** The current sequential delay works for 6 cities. At 50+ cities, a 2s delay × 50 cities = 100s minimum, which blows the Vercel 60s function timeout. Parallel execution with concurrency=5 completes in ~20s (10 batches × 2s delay).

**Is it required?** No. The discovery job can remain sequential if the city list stays small or if Places calls are split across multiple cron invocations. Make the call when the city list size is finalized.

---

## Google Maps Places API Integration

### API Choice: Places API (new) v1 via direct fetch

The project already calls Google Maps REST APIs directly (see `geocoder.ts`). The Places API (new) released in 2023 uses the same pattern: a direct POST to `https://places.googleapis.com/v1/places:searchText` with a JSON body and `X-Goog-Api-Key` header (or `key` query param — both work).

**Do NOT add `@googlemaps/google-maps-services-js`** (the official npm SDK). The project's fetch-based pattern is already established, the SDK adds 200+ kB for capabilities not needed here, and it wraps the legacy Places API v2 endpoint rather than the new v1. Stay consistent with the existing geocoder approach.

**Confidence note:** The Places API (new) v1 endpoint URL and field mask header (`X-Goog-FieldMask`) are based on training knowledge (cutoff August 2025). Verify the exact endpoint URL and required headers against the [official Places API documentation](https://developers.google.com/maps/documentation/places/web-service/text-search) before implementation. MEDIUM confidence on exact field names.

### Relevant fields from Places Text Search response

The Text Search response returns `places[]` objects. The fields needed for venue discovery:

| Field | Maps To |
|-------|---------|
| `displayName.text` | `venues.name` / `discovered_sources.source_name` |
| `formattedAddress` | `venues.address` (feed to existing `geocodeAddress()`) |
| `websiteUri` | `discovered_sources.url` (the URL to scrape) |
| `location.latitude` / `location.longitude` | `venues.lat` / `venues.lng` (skip geocoding if provided) |
| `types[]` | Filter to `bar`, `night_club`, `performing_arts_theater`, `event_venue`, `stadium` |
| `rating` | Optional quality signal for auto-approve scoring |

**Key integration point:** Places API returns `location` coordinates directly — skip `geocodeAddress()` for Places-discovered venues. Use the returned coordinates for `venues.lat/lng` without an extra geocoding round-trip.

### Search strategy for Atlantic Canada coverage

Use `textQuery` strings like `"bars with live music Halifax Nova Scotia"` and `"event venues Fredericton New Brunswick"`. The `locationBias.circle` parameter accepts a center lat/lng and radius to focus results geographically. Province center coordinates are already available in `province-bounds.ts`.

For smaller towns, use town-name text queries without a location bias — Places will resolve the geographic context from the query text itself.

---

## Reddit Mining Integration

### API Choice: Reddit public JSON API — no OAuth, no new packages

Reddit provides a public read-only JSON API at `https://www.reddit.com/r/{subreddit}/new.json?limit=100`. No authentication is required for public subreddits. The response is JSON with posts containing `title`, `selftext`, `url`, and `created_utc` fields.

**This is not PRAW (Python Reddit API Wrapper)** — the Node.js equivalents are all heavier than needed. The existing `fetch()` pattern handles this directly.

**Rate limit:** Reddit enforces 60 requests/minute for unauthenticated access. One subreddit = one request. The target subreddits (r/halifax, r/fredericton, r/moncton, r/saintjohn, r/PEI, r/newfoundland, r/stjohnsnl) total 7 requests — well within limits.

**User-Agent requirement:** Reddit blocks requests without a descriptive User-Agent. Set `User-Agent: eastcoastlocal-bot/1.0 (contact: your-email)` on all Reddit fetch calls. No library needed — just a header.

### Gemini processing pattern

The existing `discovery-orchestrator.ts` passes a text prompt to Gemini with `Output.object` to get structured candidates back. Reddit mining uses the same pattern:

1. Fetch subreddit posts via `fetch('https://www.reddit.com/r/halifax/new.json?limit=100')`
2. Extract `title + selftext` from posts mentioning events/venues
3. Pass the combined text to Gemini with the same `CandidateSchema` (url, name, province, city, rawContext)
4. Feed results into the existing `discovered_sources` insert + scoring pipeline

No schema changes needed. `discovery_method` value would be `'reddit_gemini'` to distinguish from `'gemini_google_search'`.

**Confidence on Reddit JSON API:** HIGH — this has been Reddit's stable public API since 2012. The `.json` suffix on any Reddit URL returns the raw data.

---

## Bulk Venue Onboarding (Venues Without Scrapeable Websites)

### Problem

Places API will surface venues that have no website (e.g., a small-town community hall). These venues have value for geographic coverage but can't feed into the scraping pipeline. They need a lightweight onboarding path.

### Stack answer: No new packages

The existing `venues` table already has all needed columns. A "website-less venue" is just a venue row with no corresponding `scrape_sources` row. The admin UI already supports creating venues manually. The bulk path is:

- Places API response includes `websiteUri` — only create a `scrape_sources` row when this field is present
- Without a website, create only the `venues` row (name, address, city, province, lat, lng)
- Mark these in `discovered_sources` with a new `discovery_method` value: `'places_api_no_website'`

This avoids any schema changes. The admin dashboard already shows venue counts; a filter by "no scrape sources" is a simple Drizzle query addition.

---

## Expanded Geographic Coverage

### No package needed — pure configuration

The current `ATLANTIC_CITIES` array in `discovery-orchestrator.ts` has 6 entries. For v2.0, this expands to 30-50 entries covering smaller towns across all four provinces. This is a configuration change, not a new package.

Suggested additions by province (covering towns with population >2,000 or known event venues):

- **NB:** Miramichi, Bathurst, Edmundston, Sackville, Sussex, Woodstock, Campbellton
- **NS:** Truro, New Glasgow, Antigonish, Amherst, Bridgewater, Yarmouth, Windsor, Wolfville, Kentville
- **PEI:** Summerside, Stratford, Montague, Souris, O'Leary
- **NL:** Corner Brook, Gander, Grand Falls-Windsor, Stephenville, Labrador City, Happy Valley-Goose Bay

These are config array entries, not database rows. The Places API and Gemini discovery both accept city strings from this array.

---

## Installation

```bash
# Optional: only needed if running 50+ city concurrent discovery
npm install p-limit
```

No other new packages.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Direct `fetch()` to Places API (new) v1 | `@googlemaps/google-maps-services-js` | If the project needs multiple Google Maps services (Directions, Distance Matrix, Roads) and wants a unified client. Overkill for a single endpoint. |
| Reddit public JSON API | `snoowrap` npm package | If OAuth user sessions are needed (upvoting, commenting, authenticated reads). Not needed for venue discovery read-only access. |
| Reddit public JSON API | Reddit OAuth app credentials | Only needed if hitting the 60 req/min unauthenticated limit. At 7 subreddits/run, not needed. |
| `p-limit` | `p-queue` (^8.0.0) | If exact per-second rate limiting is needed (e.g., "no more than 10 requests per second"). p-queue supports `intervalCap` and `interval` options for this. |
| `p-limit` | Sequential `await delay()` | If the city list stays under ~20 entries and the 60s timeout is not a concern. No package needed. |
| Places API Text Search | Places API Nearby Search | Nearby Search uses a coordinate center + radius, which is good for circular areas. Text Search is better for named cities where the boundary is semantic, not geometric. Use Nearby Search for "find venues within 50km of Truro" patterns. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@googlemaps/google-maps-services-js` | Wraps legacy Places v2 endpoint; 200+ kB; inconsistent with the project's established direct-fetch pattern for Google APIs | Direct `fetch()` to Places API (new) v1 endpoint |
| Playwright / Puppeteer for Reddit scraping | Exceeds Vercel Hobby 50MB function size limit; blocked by the existing constraint | Reddit public JSON API via `fetch()` |
| `snoowrap` (Reddit API wrapper) | OAuth setup required; 500+ kB; read-only subreddit access needs none of this | Reddit public JSON API via `fetch()` |
| `axios` for HTTP calls | Redundant with native `fetch()` (Node 18+ global); adds 50 kB for no benefit | Native `fetch()` already used throughout the codebase |
| Google Custom Search API for Reddit mining | Not Reddit-specific; costs money per query; Gemini with Google Search grounding already handles web discovery | Reddit JSON API + Gemini text analysis |
| Full-text Postgres search for venue dedup | `pg_trgm` extension requires Neon extension provisioning; similarity threshold tuning is harder to test | `fastest-levenshtein` already in the project |

---

## Integration Points

### New file: `src/lib/scraper/places-discovery.ts`

Responsible for: calling Places API Text Search for a given city, returning structured candidates that feed into the existing `discovered_sources` insert pipeline.

Key integration: Returns the same shape as `CandidateSchema` (url, name, province, city, rawContext) so it can share the scoring and insert logic in `discovery-orchestrator.ts`. If `location` is returned by Places API, pass coordinates directly to `venues.lat/lng` — skip the `geocodeAddress()` round-trip.

### New file: `src/lib/scraper/reddit-discovery.ts`

Responsible for: fetching subreddit posts, passing text to Gemini with the existing `CandidateSchema`, returning candidates.

Key integration: Sets `discovery_method: 'reddit_gemini'` on inserted rows. Uses the same `promoteSource()` and `scoreCandidate()` pipeline as `gemini_google_search` discoveries.

### Modified: `src/lib/scraper/discovery-orchestrator.ts`

- Expand `ATLANTIC_CITIES` constant (or move to a config file)
- Add calls to `runPlacesDiscovery(city, province)` and `runRedditDiscovery(subreddit, province)` alongside the existing Gemini search loop
- If using `p-limit`: wrap city iterations in a concurrency-limited `Promise.all()` instead of the sequential for-loop

### Environment variables (new)

The `GOOGLE_MAPS_API_KEY` already exists. Places API uses the same key — no new credential needed. Verify the key has "Places API (new)" enabled in the Google Cloud Console (it is a separate toggle from Geocoding API).

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| p-limit@^6.1.0 | Node.js 18+, TypeScript 5 | ESM-only. Project uses `tsx` for scripts and Next.js (which supports ESM). Confirm `package.json` does not use `"type": "commonjs"` — it does not, so ESM is fine. |
| Places API (new) v1 | `@ai-sdk/google` 3.x, `drizzle-orm` 0.45+ | No npm package conflict — REST API consumed via native `fetch()` |
| Reddit JSON API | Node.js 18+ native fetch | No package; `User-Agent` header is the only configuration requirement |

---

## Stack Patterns by Variant

**If Places API quota becomes a concern (daily limit exceeded):**
- Split discovery across multiple cron jobs: one per province, each triggered on a different day of the week
- Already possible with the existing Vercel cron configuration — no code change, just schedule adjustment

**If Reddit post volume is too high for a single Gemini call:**
- Batch posts into groups of 20-30 before passing to Gemini
- The existing `DISCOVERY_THROTTLE_MS` env var already controls inter-call delays

**If a venue from Places API has no `websiteUri`:**
- Create the `venues` row with lat/lng from Places API response
- Do NOT create a `scrape_sources` row
- Set `discovered_sources.status = 'approved_no_website'` (new status value — plain text column, no migration needed per existing decision)

**If the 60s Vercel timeout is hit during bulk discovery:**
- Move Places discovery into its own separate cron endpoint (e.g., `/api/cron/discover-places`)
- Reddit discovery stays in the existing `/api/cron/discover` endpoint
- Both feed the same `discovered_sources` table — no schema change

---

## Sources

- Codebase analysis (direct file reads) — `geocoder.ts`, `discovery-orchestrator.ts`, `orchestrator.ts`, `ticketmaster.ts`, `schema.ts`, `province-bounds.ts`, `package.json` — confirmed existing patterns, HIGH confidence
- Google Maps Places API (new) v1 — training knowledge (cutoff Aug 2025) — endpoint `https://places.googleapis.com/v1/places:searchText`, field mask via `X-Goog-FieldMask` header, MEDIUM confidence on exact field names (verify against official docs before implementation)
- Reddit public JSON API — `https://www.reddit.com/r/{sub}/new.json` — stable since 2012, HIGH confidence; 60 req/min unauthenticated rate limit from training knowledge, HIGH confidence
- `p-limit` npm package — version 6.1.0, ESM-native, zero-dependency concurrency limiter, HIGH confidence from training knowledge
- Vercel Hobby plan constraints — 60s timeout, 50MB function size — validated against `PROJECT.md` constraints section, HIGH confidence

---
*Stack research for: East Coast Local v2.0 — Mass Venue Discovery*
*Researched: 2026-03-15*
