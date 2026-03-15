---
phase: 20-admin-merge-review
plan: 01
subsystem: database
tags: [drizzle, postgresql, nextjs, server-actions, venue-dedup]

# Dependency graph
requires:
  - phase: 18-venue-deduplication
    provides: venueMergeCandidates table, venue_merge_log table, venue dedup scoring
  - phase: 19-ux-polish-source-attribution
    provides: event_sources table with FK RESTRICT constraint
provides:
  - performVenueMerge utility (src/lib/db/merge-venue.ts)
  - Server actions for merge and keep-separate (src/app/admin/merge-review/actions.ts)
  - Ticketmaster dedup guard preventing duplicate candidate rows
affects:
  - 20-02 (merge review UI will call these server actions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - performVenueMerge accepts all merge parameters as a typed opts object
    - server actions use revalidatePath + redirect outside try/catch (Next.js throws redirect internally)
    - canonical venue determined by event count (higher wins; tie breaks to venue_a)

key-files:
  created:
    - src/lib/db/merge-venue.ts
    - src/lib/db/merge-venue.test.ts
    - src/app/admin/merge-review/actions.ts
  modified:
    - src/lib/scraper/ticketmaster.ts

key-decisions:
  - "event_sources rows cleaned up before deleting conflicting events — FK RESTRICT requires this ordering"
  - "canonical determination: higher event count wins; ties break to venue_a (stable, deterministic)"
  - "ticketmaster dedup guard checks both orderings (a,b) and (b,a) to prevent duplicate candidate rows regardless of insertion order"
  - "raw select query used for dedup guard (not db.query) since schema has no Drizzle relations() defined"

patterns-established:
  - "performVenueMerge: delete event_sources before deleting event (FK RESTRICT pattern)"
  - "server actions: redirect() called outside try/catch blocks"

requirements-completed: [DEDUP-04]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 20 Plan 01: Backend Merge Infrastructure Summary

**performVenueMerge utility extracted with 7 unit tests, server actions for merge/keep-separate, and Ticketmaster dedup guard preventing re-insertion of already-resolved candidate pairs**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-15T20:50:39Z
- **Completed:** 2026-03-15T20:55:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extracted `performVenueMerge` from backfill script into shared module with FK-safe event_sources cleanup
- Added 7 unit tests (TDD) covering all merge steps including unique constraint handling and deletion ordering
- Created `mergePair` and `keepSeparate` server actions with canonical determination by event count
- Added dedup guard to Ticketmaster pipeline to prevent duplicate candidate rows for resolved pairs

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract performVenueMerge utility with tests** - `8be5549` (feat/test)
2. **Task 2: Create server actions and ticketmaster dedup guard** - `e1a0063` (feat)

**Plan metadata:** _(final docs commit)_

## Files Created/Modified
- `src/lib/db/merge-venue.ts` - Shared merge utility: event reassignment with FK-safe conflict resolution, audit logging, candidate status update
- `src/lib/db/merge-venue.test.ts` - 7 unit tests for merge utility using mocked Drizzle db
- `src/app/admin/merge-review/actions.ts` - Server actions: mergePair (canonical by event count) and keepSeparate
- `src/lib/scraper/ticketmaster.ts` - Added dedup guard checking both orderings before inserting candidate row

## Decisions Made
- **FK RESTRICT ordering**: `event_sources` rows must be deleted before the event row when handling unique constraint conflicts. The `event_sources.event_id` FK has no ON DELETE CASCADE (Postgres default is RESTRICT), so omitting this step causes a FK violation.
- **Canonical by event count**: higher count wins; tie breaks to venue_a (deterministic, favors the venue with more history).
- **Raw select for dedup guard**: `db.query.venueMergeCandidates` skipped in favor of raw select since the schema has no Drizzle `relations()` defined — raw select is more reliable.
- **Both orderings checked**: dedup guard checks `(inserted.id, bestCandidateId)` AND `(bestCandidateId, inserted.id)` since candidates can be stored in either order.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript cast in test file**
- **Found during:** Task 2 (type check verification)
- **Issue:** `db as { select: jest.Mock; ... }` failed TypeScript — the mock type doesn't overlap with the real Drizzle db type
- **Fix:** Changed to `db as unknown as { ... }` (double cast through unknown)
- **Files modified:** src/lib/db/merge-venue.test.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** `e1a0063` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type error)
**Impact on plan:** Minor fix required for TypeScript compliance. No scope creep.

## Issues Encountered
- Initial test mocks used `mockReturnValue` which returns the same chain object for all `update()` calls, making per-call argument inspection unreliable. Fixed by switching to `mockImplementation(() => makeUpdateChain())` so each call gets a fresh chain.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `performVenueMerge`, `mergePair`, and `keepSeparate` are all ready for Plan 02's UI
- The merge-review directory exists at `src/app/admin/merge-review/` — Plan 02 can add page.tsx and supporting components
- No blockers

## Self-Check: PASSED

- FOUND: src/lib/db/merge-venue.ts
- FOUND: src/lib/db/merge-venue.test.ts
- FOUND: src/app/admin/merge-review/actions.ts
- FOUND: commit 8be5549
- FOUND: commit e1a0063

---
*Phase: 20-admin-merge-review*
*Completed: 2026-03-15*
