---
phase: 15-scrape-quality-metrics
plan: 01
subsystem: database, scraper, ui
tags: [drizzle, postgres, next.js, jest, tdd, admin-dashboard]

# Dependency graph
requires:
  - phase: 14-fetch-pipeline
    provides: orchestrator.ts with success/failure db.update calls that this extends
provides:
  - 5 new metric columns on scrape_sources (last_event_count, avg_confidence, consecutive_failures, total_scrapes, total_events_extracted)
  - Orchestrator writes metrics on every scrape path (success, failure, early-exit)
  - Admin dashboard Events, Confidence, Failures columns with amber badge at >= 3 failures
affects: [16-ticketmaster-integration, 17-auto-approve-discovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sql`col + 1` pattern for atomic increments without read-modify-write"
    - "Initialize metric vars as null before source_type branches; set in venue_website branch; always null for eventbrite/bandsintown"
    - "TDD: process.env throttle vars set at module top before jest.mock() to avoid constants captured at import time"

key-files:
  created:
    - src/lib/scraper/orchestrator.test.ts
    - drizzle/0003_yielding_mandarin.sql
  modified:
    - src/lib/db/schema.ts
    - src/lib/scraper/orchestrator.ts
    - src/app/admin/page.tsx
    - src/lib/scraper/bandsintown.test.ts
    - src/lib/scraper/eventbrite.test.ts

key-decisions:
  - "Metric vars initialized to null before source_type if/else so eventbrite/bandsintown always write null for last_event_count and avg_confidence"
  - "consecutive_failures reset to 0 (integer literal) on success, incremented via sql expression on failure to avoid read-modify-write race"
  - "Failure path does not set last_event_count or avg_confidence — preserves last known values from previous successful run"

patterns-established:
  - "sql`col + 1` for atomic DB increments: import sql from drizzle-orm alongside eq"
  - "Process env throttle vars must be set before module import in Jest — module-level constants capture env at load time, not at test runtime"

requirements-completed: [SCRP-04]

# Metrics
duration: 25min
completed: 2026-03-15
---

# Phase 15 Plan 01: Scrape Quality Metrics Summary

**5 metric columns added to scrape_sources with atomic SQL increments in the orchestrator, and 3 new admin dashboard columns with an amber failure badge at >= 3 consecutive failures**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-15T07:00:00Z
- **Completed:** 2026-03-15T07:25:00Z
- **Tasks:** 3 (2 automated + 1 human-verify checkpoint approved)
- **Files modified:** 7

## Accomplishments
- Added 5 metric columns to scrape_sources via migration 0003_yielding_mandarin.sql
- Orchestrator now writes last_event_count, avg_confidence, consecutive_failures (reset to 0), total_scrapes (+1 sql), total_events_extracted (+count sql) on success
- On failure: consecutive_failures and total_scrapes increment atomically; last_event_count/avg_confidence unchanged
- Early-exit failure path (venue not found) also writes failure metrics
- Admin dashboard Source Health table extended with Events, Confidence, Failures columns
- Sources with 3+ consecutive failures display amber "N failures" badge
- Sorting updated: failure → >=3 failures → pending → success
- 10 new orchestrator unit tests; 196 total tests passing (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED (failing tests)** - `ba82ec8` (test)
2. **Task 1: Schema + orchestrator GREEN** - `a69dbba` (feat)
3. **Task 2: Admin dashboard** - `a58e5da` (feat)

**Plan metadata:** `d302063` (docs: complete scrape quality metrics plan)

_Note: TDD task 1 has RED commit then GREEN commit_

## Files Created/Modified
- `src/lib/db/schema.ts` - 5 new metric columns on scrape_sources
- `src/lib/scraper/orchestrator.ts` - metric writes on success and failure paths
- `src/lib/scraper/orchestrator.test.ts` - 10 unit tests for metric write behavior (new file)
- `src/app/admin/page.tsx` - 3 metric columns + failuresBadge + updated ORDER BY
- `drizzle/0003_yielding_mandarin.sql` - 5 ADD COLUMN statements (no enum drops)
- `src/lib/scraper/bandsintown.test.ts` - added new metric fields to mock fixture
- `src/lib/scraper/eventbrite.test.ts` - added new metric fields to mock fixture

## Decisions Made
- Metric vars initialized as `null` before source_type branches so eventbrite/bandsintown always write null for event-specific metrics (correct — those handlers return void, no event count known)
- `consecutive_failures: 0` on success (integer literal) to guarantee reset; increment via `sql\`consecutive_failures + 1\`` on failure for atomic operation
- Failure path deliberately omits `last_event_count` and `avg_confidence` from the `.set()` call to preserve last known values

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ExtractedEvent mock fixture using wrong field name**
- **Found during:** Task 1 (GREEN phase, TypeScript check)
- **Issue:** Test mock used `date` but `ExtractedEvent` type (from Zod schema) uses `event_date`
- **Fix:** Updated mock events to use `event_date` and all required fields
- **Files modified:** src/lib/scraper/orchestrator.test.ts
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** a69dbba (Task 1 feat commit)

**2. [Rule 1 - Bug] Fixed test timeout caused by throttle constants captured at module load**
- **Found during:** Task 1 (GREEN phase, test execution)
- **Issue:** `AI_THROTTLE_MS` and `HTTP_THROTTLE_MS` are module-level constants initialized from `process.env` at import time; `beforeAll` setting env vars too late (constants already captured as 4000ms and 1000ms causing 5s timeout)
- **Fix:** Set `process.env.SCRAPE_THROTTLE_MS = '0'` and `HTTP_THROTTLE_MS = '0'` at module top before `jest.mock()` calls
- **Files modified:** src/lib/scraper/orchestrator.test.ts
- **Verification:** All 10 orchestrator tests pass in < 2s
- **Committed in:** a69dbba (Task 1 feat commit)

**3. [Rule 1 - Bug] Updated bandsintown.test.ts and eventbrite.test.ts mock fixtures**
- **Found during:** Task 1 (GREEN phase, TypeScript check)
- **Issue:** Mock `ScrapeSource` objects missing the 5 new metric columns required by `InferSelectModel<typeof scrape_sources>`
- **Fix:** Added `last_event_count`, `avg_confidence`, `consecutive_failures`, `total_scrapes`, `total_events_extracted` to mock fixtures in both files
- **Files modified:** src/lib/scraper/bandsintown.test.ts, src/lib/scraper/eventbrite.test.ts
- **Verification:** `npx tsc --noEmit` clean, all 196 tests pass
- **Committed in:** a69dbba (Task 1 feat commit)

---

**Total deviations:** 3 auto-fixed (3 x Rule 1 bugs discovered during GREEN phase TypeScript check)
**Impact on plan:** All fixes required for TypeScript correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 complete — SCRP-04 satisfied, admin dashboard verified by user
- Ready for phase 16 (Ticketmaster Integration)
- All existing sources will show "—" for Events/Confidence (null — never scraped with new metrics) and "0" for Failures until first scrape run

## Self-Check: PASSED

All required files exist:
- FOUND: src/lib/db/schema.ts
- FOUND: src/lib/scraper/orchestrator.ts
- FOUND: src/lib/scraper/orchestrator.test.ts
- FOUND: src/app/admin/page.tsx
- FOUND: drizzle/0003_yielding_mandarin.sql
- FOUND: .planning/phases/15-scrape-quality-metrics/15-01-SUMMARY.md

All commits verified:
- FOUND: ba82ec8 (test RED)
- FOUND: a69dbba (feat GREEN + TypeScript fixes)
- FOUND: a58e5da (feat admin dashboard)
- FOUND: d302063 (docs metadata)

Key content verified:
- schema.ts contains `last_event_count` (1 match)
- orchestrator.ts contains `consecutive_failures` (3 matches)
- admin/page.tsx contains `failuresBadge` (2 matches)

---
*Phase: 15-scrape-quality-metrics*
*Completed: 2026-03-15*
