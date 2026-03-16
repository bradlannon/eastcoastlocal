---
phase: 23-places-api-discovery
plan: 01
subsystem: api
tags: [google-places, atlantic-canada, venue-discovery, scoring, typescript]

# Dependency graph
requires:
  - phase: 22-schema-foundation
    provides: discovered_sources table with lat/lng/address/google_place_id/place_types columns, promoteSource with Places field carry-through
provides:
  - PlacesSearchResponse and PlaceResult TypeScript interfaces for Places API (New) responses
  - VENUE_PLACE_TYPES, CORE_VENUE_TYPES, SECONDARY_VENUE_TYPES Sets for filtering
  - PLACES_AUTO_APPROVE=0.8 and GEMINI_AUTO_APPROVE=0.9 threshold constants
  - isVenueRelevant() venue type filter function
  - scorePlacesCandidate() tier-based scoring (0.85 core, 0.70 secondary)
  - PLACES_CITIES covering 41 Atlantic Canada communities across NS/NB/PEI/NL
  - promoteSource() updated to handle no_website status stub promotion (venue-only, no scrape_source)
affects: [23-places-api-discovery plan-02, 23-places-api-discovery plan-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Tier-based scoring: core venue types score 0.85 (auto-approve), secondary 0.70 (admin review)
    - Conditional scrape_source insert: omit for no_website stubs, insert for pending full promotions
    - Status guard pattern: allow multiple promotable statuses (pending, no_website), throw for all others

key-files:
  created:
    - src/lib/scraper/places-discoverer.ts
    - src/lib/scraper/places-discoverer.test.ts
  modified:
    - src/lib/scraper/promote-source.ts
    - src/lib/scraper/promote-source.test.ts

key-decisions:
  - "VENUE_PLACE_TYPES restricted to 7 types: bar, night_club, concert_hall, performing_arts_theater, comedy_club, community_center, stadium"
  - "Tier-based scoring: core types=0.85 (above 0.8 auto-approve), secondary=0.70 (admin review queue)"
  - "PLACES_AUTO_APPROVE=0.8 and GEMINI_AUTO_APPROVE=0.9 stored as named constants alongside types"
  - "no_website promotion path: creates venue row only, skips scrape_sources insert"
  - "41 Atlantic Canada communities hardcoded in PLACES_CITIES organized by province (NS=15, NB=12, PEI=4, NL=10)"

patterns-established:
  - "Tier scoring pattern: check CORE first, then SECONDARY, return 0 for neither — precedence matters when both sets overlap"
  - "Promotable status guard: explicit allowlist (pending | no_website), throw not-promotable for all others"
  - "Stub promotion log: 'full' vs 'stub' label based on status type for operational observability"

requirements-completed: [PLACES-02, PLACES-06, GEO-01, SCORE-01, SCORE-03]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 23 Plan 01: Places API Discovery Foundation Summary

**Places API TypeScript contracts, 41-community Atlantic Canada city list, tier-based scoring (0.85/0.70), and no_website stub promotion path for venue-only discovered sources**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T01:12:23Z
- **Completed:** 2026-03-16T01:15:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `places-discoverer.ts` with full TypeScript interfaces, constants, and pure functions for the Places discovery pipeline
- Built `PLACES_CITIES` covering 41 Atlantic Canada communities (2k+ population) across all 4 provinces, organized for per-province cron chunking
- Updated `promoteSource()` to accept `no_website` status, creating venue stubs without a `scrape_sources` entry — unblocks Places venues without websites

## Task Commits

Each task was committed atomically:

1. **Task 1: Create places-discoverer types, city list, scoring, and filtering** - `d0a0745` (feat)
2. **Task 2: Update promoteSource for no_website status** - `8f20d66` (feat)

**Plan metadata:** (docs commit pending)

_Note: Both tasks used TDD (RED→GREEN) pattern_

## Files Created/Modified

- `src/lib/scraper/places-discoverer.ts` - TypeScript interfaces, type Sets, threshold constants, isVenueRelevant(), scorePlacesCandidate(), PLACES_CITIES
- `src/lib/scraper/places-discoverer.test.ts` - 28 tests covering all behaviors
- `src/lib/scraper/promote-source.ts` - Status guard relaxed for no_website, conditional scrape_sources insert, updated log message
- `src/lib/scraper/promote-source.test.ts` - 4 new tests (Tests 5b, 12, 13, 14) for no_website path and backward compat; 15 total tests

## Decisions Made

- Status guard error message changed from "not pending" to "not promotable" — the new guard covers both `approved` and `rejected`, so "not pending" would be misleading
- Test 5 updated to match new error message pattern `/not promotable/i`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing: 2 `ticketmaster.test.ts` tests failing due to incomplete `.limit()` mock — noted in STATE.md tech debt, out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All contracts and pure functions are in place for Plan 02 (core discoverer logic: API calls, pagination, dedup, staging)
- Plan 03 (cron endpoint wiring) can reference PLACES_CITIES by province key
- promoteSource is ready to handle no_website stubs from Places pipeline
- Note: Places API (New) must be enabled on the GCP key before Plan 02 integration testing

---
*Phase: 23-places-api-discovery*
*Completed: 2026-03-15*
