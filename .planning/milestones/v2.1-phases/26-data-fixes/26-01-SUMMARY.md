---
phase: 26-data-fixes
plan: 01
subsystem: database
tags: [drizzle, postgres, venue-dedup, schema, migration]

# Dependency graph
requires:
  - phase: 25-mass-venue-discovery
    provides: performVenueMerge function in src/lib/db/merge-venue.ts
provides:
  - FK-safe venue dedup backfill script using performVenueMerge
  - Schema without phone column on venues and discovered_sources
  - Migration 0010_purple_pandemic.sql dropping both phone columns
affects: [venue-dedup-backfill, schema types, any fixture using venue type]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backfill scripts delegate to shared merge functions rather than inlining FK-sensitive operations"
    - "venueMergeCandidates rows inserted with status=merged before calling performVenueMerge to satisfy candidateId requirement"

key-files:
  created:
    - drizzle/0010_purple_pandemic.sql
  modified:
    - scripts/venue-dedup-backfill.ts
    - src/lib/db/schema.ts
    - src/lib/timelapse-utils.test.ts
    - src/lib/db/schema.test.ts
    - src/lib/filter-utils.test.ts
    - src/app/api/events/route.test.ts
    - src/lib/scraper/promote-source.test.ts
    - src/lib/scraper/orchestrator.test.ts

key-decisions:
  - "Insert venueMergeCandidates row (status=merged, reviewed_at=now) before calling performVenueMerge to obtain a valid candidateId"
  - "Migration generated via drizzle-kit generate (named 0010_purple_pandemic.sql) rather than hand-crafted"
  - "google_place_id: null added to all test venue fixtures (was always required by schema type, previously masked by phone presence)"

patterns-established:
  - "Pattern: backfill scripts must delegate FK-sensitive operations to performVenueMerge, not inline them"

requirements-completed: [DATA-01, DATA-03]

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 26 Plan 01: Data Fixes — Backfill Safety and Phone Column Removal Summary

**FK-safe venue dedup backfill via performVenueMerge delegation, plus phone column dropped from venues and discovered_sources with drizzle migration**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-16T~18:00Z
- **Completed:** 2026-03-16T~18:08Z
- **Tasks:** 2
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- venue-dedup-backfill.ts --execute mode now delegates all merge operations to performVenueMerge, which correctly deletes event_sources FK rows before deleting conflicting events
- phone column removed from both venues and discovered_sources schema definitions
- drizzle migration 0010_purple_pandemic.sql generated with two ALTER TABLE DROP COLUMN statements
- All six test files cleaned of phone references; TypeScript compiles with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor venue-dedup-backfill.ts to use performVenueMerge** - `23ebdfd` (feat)
2. **Task 2: Drop phone column from schema and all references** - `e356166` (feat)

## Files Created/Modified
- `scripts/venue-dedup-backfill.ts` - Replaced inline merge loop with performVenueMerge; removed events/scrape_sources/sql imports
- `src/lib/db/schema.ts` - Removed phone column from venues and discovered_sources tables
- `drizzle/0010_purple_pandemic.sql` - DROP COLUMN migration for both phone columns
- `drizzle/meta/_journal.json` - Updated with new migration entry
- `drizzle/meta/0010_snapshot.json` - Generated schema snapshot
- `src/lib/timelapse-utils.test.ts` - Removed phone: null from two venue fixtures; added google_place_id: null
- `src/lib/db/schema.test.ts` - Removed 'phone' from venues and discovered_sources column arrays
- `src/lib/filter-utils.test.ts` - Removed phone: null from venue fixture; added google_place_id: null
- `src/app/api/events/route.test.ts` - Removed phone: null from mockVenue; added google_place_id: null
- `src/lib/scraper/promote-source.test.ts` - Removed phone type field and phone: null from makeMockSource
- `src/lib/scraper/orchestrator.test.ts` - Removed phone: null from mockVenue; added google_place_id: null

## Decisions Made
- Insert a `venueMergeCandidates` row with `status: 'merged'` and `reviewed_at: new Date()` before calling `performVenueMerge`, since `performVenueMerge` requires a valid `candidateId` to update the candidates table. The `reason` field is set to `'backfill_auto_merge'` to distinguish these from organic review candidates.
- Used `drizzle-kit generate` rather than a hand-crafted migration to ensure the snapshot files are also correctly updated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing google_place_id: null to test venue fixtures**
- **Found during:** Task 2 (Drop phone column from schema and all references)
- **Issue:** After removing phone, TypeScript reported `google_place_id` missing in 5 test fixture objects. The field was always required by the schema type but previously the type error was hidden by `phone` being present (TypeScript errors on the first missing required property per object literal).
- **Fix:** Added `google_place_id: null` to venue fixtures in timelapse-utils.test.ts (x2), filter-utils.test.ts, route.test.ts, and orchestrator.test.ts.
- **Files modified:** 5 test files (same files already being modified for phone removal)
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `e356166` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug: missing required field in test fixtures)
**Impact on plan:** Auto-fix necessary for TypeScript correctness. No scope creep — same files already targeted by Task 2.

## Issues Encountered
None beyond the google_place_id auto-fix documented above.

## User Setup Required
The migration `drizzle/0010_purple_pandemic.sql` must be applied to the production database before deploying this change. Run `npx drizzle-kit migrate` or apply via your migration workflow.

## Next Phase Readiness
- DATA-01 and DATA-03 requirements satisfied
- venue-dedup-backfill.ts is now safe to run with --execute against production
- Schema is clean; no dead columns remain
- Phase 26 Plan 02 (DATA-02: EventCard attribution fix) can proceed

---
*Phase: 26-data-fixes*
*Completed: 2026-03-16*
