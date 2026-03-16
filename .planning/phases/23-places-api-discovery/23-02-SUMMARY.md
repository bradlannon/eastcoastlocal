---
phase: 23-places-api-discovery
plan: 02
subsystem: api
tags: [google-places, venue-discovery, pagination, dedup, staging, typescript, tdd]

# Dependency graph
requires:
  - phase: 23-places-api-discovery
    plan: 01
    provides: PlaceResult/PlacesSearchResponse interfaces, VENUE_PLACE_TYPES, isVenueRelevant(), scorePlacesCandidate(), PLACES_AUTO_APPROVE constant
  - phase: 22-schema-foundation
    provides: discovered_sources table with google_place_id/lat/lng/address/place_types columns, promoteSource() with Places field carry-through
provides:
  - fetchPlacesPage(): internal POST helper to Places API with correct headers and field mask
  - delay(): setTimeout wrapper for throttle between requests
  - searchCity(): paginated Places API search with nextPageToken loop and isVenueRelevant() filtering
  - enrichVenue(): backfills google_place_id/address/lat/lng on existing venue rows
  - processPlaceResult(): two-step dedup (google_place_id fast-path + fuzzy name+geo), stages candidates with all required fields
  - runPlacesDiscovery(): main orchestrator — loads province venues once, per-city search+dedup+stage, auto-approves pending records >= 0.8
  - DiscoveryRunResult interface for cron endpoint response shape
affects: [23-places-api-discovery plan-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-step dedup pattern: google_place_id exact match first (O(1)), then fuzzy name+geo loop (O(n)) — fast-path avoids unnecessary scoring
    - onConflictDoNothing for idempotent staging: re-runs produce same result, no duplicate rows
    - Province venues loaded once upfront before city loop: avoids N×cities DB round-trips
    - Per-city error isolation: try/catch inside city loop so one API failure doesn't abort the run
    - Auto-approve loop after all staging: decoupled from per-result processing

key-files:
  created: []
  modified:
    - src/lib/scraper/places-discoverer.ts
    - src/lib/scraper/places-discoverer.test.ts

key-decisions:
  - "Synthetic URL for no_website venues is places:{google_place_id} (e.g. places:ChIJfoo123) — unique, stable, readable"
  - "domain field for no_website venues is google-places (not empty/null) — required by discovered_sources.domain NOT NULL constraint"
  - "processPlaceResult returns ProcessResult string literal ('enriched'|'staged_pending'|'staged_no_website'|'staged_review'|'skipped') — explicit for counting in runPlacesDiscovery"
  - "staged_review counts toward stagedPending in runPlacesDiscovery result — both go to admin review queue"
  - "Province venues loaded using db.select().from(venues).where(inArray(venues.province, distinctProvinces)) — single query covers all provinces in run"

patterns-established:
  - "Two-step dedup pattern: exact google_place_id first (check discovered_sources then venues), then fuzzy loop — stops at first match"
  - "Idempotent staging with onConflictDoNothing: url UNIQUE constraint prevents double-staging"
  - "Province venues preload pattern: batch load before loop, filter in-process — avoids per-result DB queries"

requirements-completed: [PLACES-01, PLACES-03, PLACES-04, PLACES-05, PLACES-06, PLACES-07, SCORE-03]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 23 Plan 02: Places API Discovery Core Summary

**Places API HTTP search with pagination, two-step dedup (google_place_id fast-path + fuzzy name+geo), venue enrichment, candidate staging (pending/no_website/staged_review), and runPlacesDiscovery orchestrator with auto-approve — 47 total unit tests passing**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T01:17:38Z
- **Completed:** 2026-03-16T01:21:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Implemented `searchCity()` with paginated Places API calls (nextPageToken loop), correct X-Goog-FieldMask (including nextPageToken field), and per-city logging
- Built `processPlaceResult()` with two-step deduplication: google_place_id fast-path skips already-staged/enriches existing venues, fuzzy name+geo via `scoreVenueCandidate()` handles near-matches
- Built `runPlacesDiscovery()` orchestrator that loads province venues once, processes all cities with per-city error isolation, and auto-approves pending records scoring >= 0.8 via `promoteSource()`

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement searchCity with pagination and type filtering** - `ca448a1` (feat)
2. **Task 2: Implement dedup, staging, enrichment, and runPlacesDiscovery** - `d709f66` (feat)

**Plan metadata:** (docs commit pending)

_Note: Both tasks used TDD (RED→GREEN) pattern_

## Files Created/Modified

- `src/lib/scraper/places-discoverer.ts` - Added fetchPlacesPage, delay, searchCity, VenueRow interface, enrichVenue, processPlaceResult, stageCandidate, DiscoveryRunResult interface, runPlacesDiscovery
- `src/lib/scraper/places-discoverer.test.ts` - Added 19 new tests for searchCity (6), processPlaceResult (8), enrichVenue (1), runPlacesDiscovery (4); 47 total tests

## Decisions Made

- Synthetic URL for no_website venues: `places:{google_place_id}` — unique, stable key that can be matched for Ticketmaster dedup anchoring later
- Domain for no_website venues: `google-places` — not empty/null (schema constraint), consistent sentinel value for filtering
- `staged_review` contributes to `stagedPending` counter in DiscoveryRunResult — both go to admin review queue, not materially different for counting
- `processPlaceResult` returns string literal type for explicit, readable outcome tracking rather than boolean/enum

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing: 2 `ticketmaster.test.ts` tests failing due to incomplete `.limit()` mock — noted in STATE.md tech debt, out of scope for this plan.

## User Setup Required

None - no external service configuration required. Note: Places API (New) must be enabled on the GCP key before live testing (noted in STATE.md research flags).

## Next Phase Readiness

- `runPlacesDiscovery(cities)` is ready for cron endpoint wiring (Plan 03)
- Plan 03 can call `runPlacesDiscovery(PLACES_CITIES['NS'])` etc. per province
- `DiscoveryRunResult` provides response shape for cron endpoint JSON
- All exports: `searchCity`, `processPlaceResult`, `enrichVenue`, `runPlacesDiscovery`, `DiscoveryRunResult`

---
*Phase: 23-places-api-discovery*
*Completed: 2026-03-15*
