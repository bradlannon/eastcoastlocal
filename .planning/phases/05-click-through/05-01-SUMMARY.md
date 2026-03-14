---
phase: 05-click-through
plan: 01
subsystem: testing
tags: [typescript, jest, tdd, spatial, haversine, timelapse]

requires: []
provides:
  - "findNearbyVenues pure function with haversine distance calculation"
  - "CLICK_RADIUS_METERS = 2000 constant"
  - "VenueGroup interface: { venue: Venue; events: EventWithVenue[] }"
  - "haversineDistance utility (no Leaflet dependency)"
affects:
  - 05-click-through

tech-stack:
  added: []
  patterns:
    - "Haversine formula for geographic distance calculation in pure TS"
    - "VenueGroup as the canonical grouping type for click-through logic"

key-files:
  created: []
  modified:
    - src/lib/timelapse-utils.ts
    - src/lib/timelapse-utils.test.ts

key-decisions:
  - "haversineDistance exported separately to enable isolated unit testing of the formula"
  - "findNearbyVenues takes Map<number, VenueGroup> keyed by venueId — matches how the click layer will build groups at render time"
  - "CLICK_RADIUS_METERS = 2000 exported as a named constant so HeatmapClickLayer and tests share the same value"

patterns-established:
  - "Pure spatial math functions in timelapse-utils.ts — no Leaflet/DOM dependency, fully testable in Node"

requirements-completed: [HEAT-03]

duration: 2min
completed: 2026-03-14
---

# Phase 5 Plan 01: findNearbyVenues Spatial Proximity Function Summary

**Pure Haversine-based `findNearbyVenues` function exported from `timelapse-utils.ts`, with `VenueGroup` type and `CLICK_RADIUS_METERS` constant, fully covered by 13 new unit tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-14T18:14:18Z
- **Completed:** 2026-03-14T18:16:02Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `haversineDistance(lat1, lng1, lat2, lng2): number` — pure math, no Leaflet dependency, safe in Node test environment
- Implemented `findNearbyVenues(clickLat, clickLng, venueGroups, radiusMeters?)` returning `VenueGroup[]` filtered to within radius
- Exported `CLICK_RADIUS_METERS = 2000` and `VenueGroup` interface as shared contract for click-through layer
- All 48 timelapse-utils tests pass (35 existing + 13 new)

## Task Commits

Each task was committed atomically:

1. **RED — Failing tests for findNearbyVenues** - `a914cf9` (test)
2. **GREEN — Implement findNearbyVenues** - `2bb63c8` (feat)

_Note: TDD plan — two commits (test → feat)_

## Files Created/Modified

- `src/lib/timelapse-utils.ts` - Added `CLICK_RADIUS_METERS`, `VenueGroup` interface, `haversineDistance`, `findNearbyVenues`; added `Venue` to type import
- `src/lib/timelapse-utils.test.ts` - Added `makeVenueGroup` helper and 13 new tests across 3 describe blocks

## Decisions Made

- Exported `haversineDistance` as a named function rather than keeping it private — allows tests to verify the formula directly and future callers to reuse it
- `findNearbyVenues` accepts `Map<number, VenueGroup>` (keyed by venueId) to match the shape HeatmapClickLayer will build from its venue grouping logic
- Default radius uses `CLICK_RADIUS_METERS` constant so the value is defined in exactly one place

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing unrelated test failure in `src/lib/seed.test.ts` (looking for "The Ship Pub & Kitchen" venue that no longer exists in seed data). Not caused by this plan, not fixed — logged as deferred.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `findNearbyVenues` and `VenueGroup` are ready for consumption by `HeatmapClickLayer` (05-02)
- No blockers from this plan

---
*Phase: 05-click-through*
*Completed: 2026-03-14*
