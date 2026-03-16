---
phase: 22-schema-foundation
plan: 02
subsystem: database
tags: [drizzle, postgres, places-api, promote-source, tdd, jest]

# Dependency graph
requires:
  - phase: 22-01
    provides: discovered_sources.lat/lng/address/google_place_id/place_types columns and venues.google_place_id column
provides:
  - promoteSource() with conditional lat/lng/address/google_place_id/place_types carry-through from discovered_sources to venues
  - 4 new tests (8-11) covering Places-sourced promotion path
  - Backward-compatible fallback preserved for legacy sources
affects: [23-places-discoverer, 24-reddit-pipeline, 25-admin-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional spread for optional nullable fields in Drizzle insert (omits undefined keys vs passing null)

key-files:
  created: []
  modified:
    - src/lib/scraper/promote-source.ts
    - src/lib/scraper/promote-source.test.ts

key-decisions:
  - "Use conditional spread (staged.lat != null ? { lat: staged.lat } : {}) so legacy nulls omit keys entirely from Drizzle insert rather than passing explicit null"
  - "prefer staged.address over placeholder; fall back to 'city, province, Canada' string for legacy sources"
  - "Status guard (pending-only) left unchanged; no_website path deferred to Phase 23 per plan spec"

patterns-established:
  - "Conditional spread for nullable optional fields: ...(field != null ? { key: field } : {}) avoids explicit null in Drizzle inserts"

requirements-completed: [SCHEMA-01, SCHEMA-02]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 22 Plan 02: Promote Source Places Data Carry-Through Summary

**promoteSource() extended with conditional lat/lng/address/google_place_id/place_types carry-through using conditional spread, 11 tests passing (4 new Places paths + 7 legacy backward-compat)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T05:46:42Z
- **Completed:** 2026-03-15T05:50:47Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- promoteSource() now prefers staged.address over the placeholder "city, province, Canada" fallback
- lat, lng, google_place_id conditionally spread into venue insert only when non-null
- place_types conditionally maps to venue_type during promotion
- All 11 tests pass; Tests 1-7 (legacy) unchanged, Tests 8-11 (Places paths) new
- Phase 23 deferred note added as comment on status guard line

## Task Commits

Each task was committed atomically:

1. **Task 1: Update promoteSource and tests for structured data carry-through** - `d3b8bbd` (feat)

## Files Created/Modified
- `src/lib/scraper/promote-source.ts` - Replaced static address with staged.address fallback; added conditional spread for lat/lng/google_place_id/place_types into venue insert
- `src/lib/scraper/promote-source.test.ts` - Extended makeMockSource with 7 new optional fields; added Tests 8-11 covering Places-sourced promotion paths

## Decisions Made
- Conditional spread pattern (`...(field != null ? { field } : {})`) chosen over passing explicit null so Drizzle uses DB column defaults rather than overriding with null for legacy sources
- Status guard (pending-only check) intentionally left unchanged per plan; Phase 23 scope comment added

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Jest flag `--testPathPattern` (deprecated) noted in test runner warning; used `--testPathPatterns` instead. Pre-existing, unrelated to this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 23 (places-discoverer) can now use promoteSource() for Places-sourced venues; lat/lng/address/google_place_id/place_types will flow through automatically
- Phase 23 research flag still active: verify Places API (New) is enabled on GCP key before implementing places-discoverer.ts
- Schema foundation (Plans 01 + 02) complete; promotion pipeline ready for Places integration

---
*Phase: 22-schema-foundation*
*Completed: 2026-03-15*
