---
phase: 30-archival
plan: 01
subsystem: api
tags: [drizzle-orm, cron, archival, timezone, vercel, tdd]

# Dependency graph
requires:
  - phase: 29-schema-foundation
    provides: archived_at TIMESTAMPTZ column on events table
provides:
  - getStartOfTodayInTimezone utility for Atlantic timezone threshold computation
  - archivePastEvents function with two-bucket (Halifax + NL) province grouping
  - GET /api/cron/archive endpoint with CRON_SECRET Bearer auth
  - vercel.json archive cron at 0 7 * * *
  - /api/events filtered by archived_at IS NULL instead of event_date >= now()
  - upsert guard confirmed — archived_at absent from ON CONFLICT SET with ARCH-04 comment
affects:
  - 31-series-detection (archived events excluded from occurrence counts)
  - 32-ui (archived events no longer appear on public map)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-fetch venue IDs by province before UPDATE to avoid Drizzle subquery issues"
    - "Two-bucket archival: Halifax provinces (NS, NB, PEI) use America/Halifax, NL uses America/St_Johns"
    - "Intl API pattern for timezone-aware midnight computation: toLocaleString diff approach"
    - "jest.useFakeTimers() + jest.setSystemTime() for deterministic timezone tests"
    - "fromCallCount closure pattern for mocking multi-call db.select().from() chains"

key-files:
  created:
    - src/lib/archiver.ts
    - src/lib/archiver.test.ts
    - src/app/api/cron/archive/route.ts
    - src/app/api/cron/archive/route.test.ts
  modified:
    - src/app/api/events/route.ts
    - src/app/api/events/route.test.ts
    - src/lib/scraper/normalizer.ts
    - src/lib/scraper/normalizer.test.ts
    - vercel.json

key-decisions:
  - "No maxDuration on archive cron — fast SQL UPDATE doesn't need the 60s extension used by scrape cron"
  - "Pre-fetch venue IDs by province (two SELECT queries) rather than subquery — avoids Drizzle subquery pitfall"
  - "archived_at omission from ON CONFLICT SET is the upsert guard — re-scraping cannot unarchive events (ARCH-04)"
  - "jest.useFakeTimers + setSystemTime over Date mock spy — avoids breaking Date constructor for non-now arguments"

patterns-established:
  - "Multi-call db.select mock pattern: use fromCallCount closure to return different chains per call"
  - "Atlantic timezone test pattern: setSystemTime to known UTC, assert UTC hours/minutes of result"

requirements-completed: [ARCH-02, ARCH-03, ARCH-04]

# Metrics
duration: 12min
completed: 2026-03-16
---

# Phase 30 Plan 01: Archival Pipeline Summary

**Daily archive cron using Atlantic timezone thresholds (Halifax + St. Johns buckets), /api/events switched from date-based to archived_at IS NULL filter, upsert guard confirmed preventing re-scrape resurrection**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-16T21:18:08Z
- **Completed:** 2026-03-16T21:30:44Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Archive cron at /api/cron/archive with CRON_SECRET auth, logs counts by province bucket
- getStartOfTodayInTimezone handles both America/Halifax (UTC-3 ADT) and America/St_Johns (UTC-2:30 NDT)
- Public /api/events now filters `WHERE archived_at IS NULL` instead of `WHERE event_date >= now()`
- vercel.json updated with `0 7 * * *` schedule for archive cron
- 31 tests pass across all 4 affected test files

## Task Commits

1. **Task 1: Archive utility and cron endpoint** - `85a1e42` (feat)
2. **Task 2: Public API filter and upsert guard** - `252777c` (feat)

## Files Created/Modified

- `src/lib/archiver.ts` - getStartOfTodayInTimezone + archivePastEvents (two-bucket province UPDATE)
- `src/lib/archiver.test.ts` - 6 tests: timezone offsets + archivePastEvents mock behavior
- `src/app/api/cron/archive/route.ts` - GET endpoint with CRON_SECRET auth, calls archivePastEvents
- `src/app/api/cron/archive/route.test.ts` - 4 tests: 401/200/500 cases
- `src/app/api/events/route.ts` - WHERE clause changed from gte(event_date) to isNull(archived_at)
- `src/app/api/events/route.test.ts` - Fixed broken mock for secondary event_sources query; updated filter test name
- `src/lib/scraper/normalizer.ts` - Added ARCH-04 comment confirming archived_at omission
- `src/lib/scraper/normalizer.test.ts` - Added test asserting archived_at absent from ON CONFLICT SET
- `vercel.json` - Added /api/cron/archive at schedule 0 7 * * *

## Decisions Made

- No `maxDuration` on archive cron — the operation is two fast SQL UPDATEs, no need for the 60s timeout extension used by the scrape cron
- Pre-fetch venue IDs by province into arrays rather than using Drizzle subqueries — avoids known Drizzle subquery issues (research pitfall 3)
- Used `jest.useFakeTimers()` + `jest.setSystemTime()` instead of `jest.spyOn(global, 'Date').mockImplementationOnce()` — the spy approach breaks `new Date(value)` constructor calls downstream

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed broken mock in events route test**
- **Found during:** Task 2 (Public API filter update)
- **Issue:** Existing `route.test.ts` mock used `mockFrom.mockReturnValue({ innerJoin })` for ALL `from()` calls, but the route makes a second `db.select().from(event_sources).where()` call that needs `{ where }` directly — causing 2 pre-existing test failures
- **Fix:** Replaced `mockReturnValueOnce` chaining (broken after `clearAllMocks`) with a `fromCallCount` closure implementation that returns the correct chain per call number
- **Files modified:** src/app/api/events/route.test.ts
- **Verification:** All 4 events route tests pass
- **Committed in:** 252777c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - pre-existing bug)
**Impact on plan:** Fix was necessary — 2 tests were silently broken before this plan. No scope creep.

## Issues Encountered

- `jest.spyOn(global, 'Date').mockImplementationOnce()` approach in archiver tests caused `startOfDayInTz.setHours is not a function` because the spy intercepted subsequent `new Date(value)` calls too. Resolved by switching to `jest.useFakeTimers()` + `jest.setSystemTime()`.

## User Setup Required

None — no external service configuration required. CRON_SECRET is already in use by other crons.

## Next Phase Readiness

- Archive pipeline is live-ready: cron endpoint created, vercel.json scheduled, public API updated
- Phase 31 (series detection) can now exclude archived events from occurrence counts — the `WHERE archived_at IS NULL` filter is consistent across queries
- Pre-existing test failures in discovery cron and discovery orchestrator (3 tests) are out of scope — logged as known pre-existing issues

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.

---
*Phase: 30-archival*
*Completed: 2026-03-16*
