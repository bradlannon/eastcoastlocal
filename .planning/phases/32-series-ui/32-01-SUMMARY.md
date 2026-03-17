---
phase: 32-series-ui
plan: 01
subsystem: ui
tags: [react, typescript, series, recurring-events, badges, event-list]

# Dependency graph
requires:
  - phase: 31-series-detection
    provides: series_id column on events table and recurring_series data populated by detect-series cron

provides:
  - collapseSeriesEvents pure utility function (series-utils.ts)
  - Teal "Recurring" badge on EventCard for events with non-null series_id
  - Series collapsing in EventList showing one card per series (next occurrence) with count

affects:
  - 32-series-ui (subsequent plans in same phase)
  - Any component consuming EventCard or EventList

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function utility in src/lib/ following filter-utils.ts pattern (no side effects, no DB)"
    - "TDD: test file written and committed before implementation file"
    - "Series collapsing: two-pass algorithm — count map then ordered emit"

key-files:
  created:
    - src/lib/series-utils.ts
    - src/lib/series-utils.test.ts
  modified:
    - src/components/events/EventCard.tsx
    - src/components/events/EventList.tsx

key-decisions:
  - "collapseSeriesEvents uses two-pass algorithm: first pass builds count map, second pass emits first-seen per series_id — preserves sort order"
  - "occurrenceCount=1 for non-series events and lone series events — EventCard only renders count display when occurrenceCount > 1"
  - "Teal color scheme for Recurring badge distinguishes from existing orange (category) and gray (price) badges"

patterns-established:
  - "Series UI pattern: badge via series_id check, count via occurrenceCount prop threaded from EventList through to EventCard"

requirements-completed:
  - UI-01
  - UI-02

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 32 Plan 01: Series UI Summary

**Teal "Recurring" badge on EventCard and series collapsing in EventList via collapseSeriesEvents pure utility — 6-case TDD test suite, zero regressions**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-17T01:07:04Z
- **Completed:** 2026-03-17T01:11:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `src/lib/series-utils.ts` with `collapseSeriesEvents` pure function collapsing recurring series events to their earliest occurrence while preserving sort order
- Added 6-case TDD test suite covering: empty array, non-series pass-through, single series collapse, multiple independent series, mixed order, lone series event
- Updated `EventCard` with teal "Recurring" badge for events with `series_id !== null` and `+N more upcoming` count display
- Updated `EventList` to apply `collapseSeriesEvents` before render, passing `occurrenceCount` to each `EventCard`

## Task Commits

Each task was committed atomically:

1. **Task 1: RED** - `dfb9c35` (test: add failing tests for collapseSeriesEvents)
2. **Task 1: GREEN** - `550a286` (feat: implement collapseSeriesEvents utility)
3. **Task 2** - `6da6aac` (feat: wire Recurring badge and series collapse into EventCard and EventList)

_Note: TDD task has two commits (test → feat)_

## Files Created/Modified
- `src/lib/series-utils.ts` - Pure function `collapseSeriesEvents` + `CollapsedEvent` interface
- `src/lib/series-utils.test.ts` - 6-case unit tests for collapse logic
- `src/components/events/EventCard.tsx` - Added `occurrenceCount` prop, teal Recurring badge, "+N more upcoming" text
- `src/components/events/EventList.tsx` - Import and apply collapseSeriesEvents before rendering cards

## Decisions Made
- Two-pass algorithm: count map first pass, ordered emit second pass — preserves input sort order without re-sorting
- `occurrenceCount` prop is optional on `EventCard` so existing callers require no changes
- Teal color scheme (`bg-teal-50 text-teal-700 border-teal-200`) distinguishes Recurring from existing orange category and gray price badges

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

3 pre-existing test failures in `discover/route.test.ts`, `discover-reddit/route.test.ts`, and `discovery-orchestrator.test.ts` — confirmed pre-existing by running tests against stashed changes. Not caused by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Series UI indicators are live: Recurring badge and occurrence counts display whenever `series_id` is populated
- Ready for any follow-up 32-series-ui plans (e.g., expand/collapse interaction, series detail page)
- No blockers

---
*Phase: 32-series-ui*
*Completed: 2026-03-16*

## Self-Check: PASSED

All files exist and all task commits verified on disk.
