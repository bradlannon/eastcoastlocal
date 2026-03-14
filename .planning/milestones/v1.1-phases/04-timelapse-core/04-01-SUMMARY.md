---
phase: 04-timelapse-core
plan: "01"
subsystem: testing
tags: [timelapse, heatmap, date-fns, typescript, jest, tdd]

# Dependency graph
requires: []
provides:
  - Pure timelapse utility functions (positionToTimestamp, positionToBlockName, filterByTimeWindow, computeVenueHeatPoints)
  - Constants (TOTAL_DAYS=30, BLOCKS_PER_DAY=4, TOTAL_STEPS=120, STEP_SIZE=1/120, WINDOW_HOURS=24)
  - Exported types (HeatPoint interface, BlockName type)
  - 35 passing unit tests covering all functions and edge cases
affects:
  - 04-02 (HeatmapLayer uses HeatPoint type and computeVenueHeatPoints)
  - 04-03 (TimelineBar uses positionToBlockName and positionToTimestamp for label display)
  - 04-04 (HomeContent wiring uses all utility functions and constants)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD red-green cycle with Jest + ts-jest
    - Pure utility functions with zero external dependencies (no Leaflet, no React)
    - Normalized float time position (0-1) mapped to 30-day date range via linear interpolation
    - Venue heat point grouping by venue ID with max-normalized 0-1 intensity and 0.15 minimum floor

key-files:
  created:
    - src/lib/timelapse-utils.ts
    - src/lib/timelapse-utils.test.ts
  modified: []

key-decisions:
  - "positionToBlockName uses Math.round(position * (TOTAL_STEPS-1)) to map position to step index — position 119/120 maps to step 118 (Evening), position 1 maps to step 119 (Night)"
  - "computeVenueHeatPoints uses Math.max(1, maxCount) in denominator to avoid division by zero on empty input"
  - "0.15 intensity floor ensures single-event venues produce a visible warm spot on the heatmap"

patterns-established:
  - "Pure utility module pattern: zero external deps, fully testable without Leaflet or React"
  - "EventWithVenue test helper: makeEvent(id, venueId, overrides) factory following filter-utils.test.ts pattern"

requirements-completed: [HEAT-02, TIME-02, TIME-03]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 4 Plan 01: Timelapse Utility Functions Summary

**Pure timelapse math functions with 35 unit tests: position-to-timestamp mapping, 6-hour block naming, +-12h time window filtering, and venue event-count normalization with 0.15 intensity floor**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T16:22:25Z
- **Completed:** 2026-03-14T16:25:01Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented all five exported constants with correct values (TOTAL_DAYS, BLOCKS_PER_DAY, TOTAL_STEPS, STEP_SIZE, WINDOW_HOURS)
- positionToTimestamp correctly maps 0-1 float to a Date within a 30-day range via linear interpolation
- positionToBlockName returns the correct 6-hour block name (Morning/Afternoon/Evening/Night) for any scrubber position using modular step arithmetic
- filterByTimeWindow filters EventWithVenue[] to only events within +-windowHours/2 of a center timestamp
- computeVenueHeatPoints groups events by venue ID, normalizes count to 0-1 intensity, applies 0.15 minimum floor for visibility
- 35 unit tests covering all functions, edge cases (null lat/lng, empty arrays, boundary conditions, 0-window, single-event venues)

## Task Commits

Each task was committed atomically (TDD flow):

1. **RED - Failing tests** - `3822495` (test)
2. **GREEN - Implementation** - `cf2c13e` (feat)

## Files Created/Modified

- `src/lib/timelapse-utils.ts` - All timelapse utility functions and exported types/constants
- `src/lib/timelapse-utils.test.ts` - 35 unit tests covering all behaviors specified in plan

## Decisions Made

- `positionToBlockName` test for position `119/120` corrected: `Math.round((119/120) * 119) = 118`, so `118 % 4 = 2` -> "Evening" (not "Night"). The plan comment was incorrect about which step that position maps to — the implementation in the research doc is correct.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected test assertion for positionToBlockName at position 119/120**

- **Found during:** GREEN phase (tests run)
- **Issue:** Test comment claimed position `119/120` maps to step 119 (Night), but `Math.round((119/120) * 119) = Math.round(118.008) = 118`, and `118 % 4 = 2` = "Evening"
- **Fix:** Updated the test assertion and comment to reflect the correct behavior. The implementation from the research doc is correct.
- **Files modified:** `src/lib/timelapse-utils.test.ts`
- **Verification:** All 35 tests pass after correction
- **Committed in:** `cf2c13e` (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - incorrect test expectation)
**Impact on plan:** Auto-fix was necessary for test correctness. Implementation exactly matches the research doc (Pattern 3). No scope creep.

## Issues Encountered

- Pre-existing failure in `src/lib/db/seed.test.ts` ("The Ship Pub & Kitchen" not found in seed data) — confirmed pre-existing before this plan, logged to deferred items, out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All utility functions are implemented and tested — Plans 02, 03, and 04 can consume them immediately
- `HeatPoint` interface and `BlockName` type exported for type-safe downstream usage
- Blocker remains: SSR build verification for `leaflet.heat` (Phase 4 Plan 02 gating concern — must run `next build` after wiring HeatmapLayer)

---
*Phase: 04-timelapse-core*
*Completed: 2026-03-14*
