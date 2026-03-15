---
phase: 18-venue-deduplication
plan: 02
subsystem: scraper
tags: [levenshtein, geospatial, deduplication, drizzle, tdd, cli]

# Dependency graph
requires:
  - phase: 18-venue-deduplication
    plan: 01
    provides: scoreVenueCandidate, venueNameRatio, findBestMatch, DedupeDecision type
affects:
  - 20-admin-merge-review: venue_merge_candidates table populated by this plan; review UI reads it
  - 18-backfill: backfill script is created here (same phase, same plan)

provides:
  - venue_merge_log table (audit trail for completed merges)
  - venue_merge_candidates table (borderline cases for Phase 20 admin review)
  - Enhanced findOrCreateVenue with fuzzy matching after ILIKE miss
  - Backfill CLI script for one-time dedup of existing venues (dry-run + --execute)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fuzzy venue matching in TM ingest: ILIKE fast path → city scan → scoreVenueCandidate per-candidate → merge/review/insert
    - TM no-geo inline merge: incoming lat/lng always null in TM pipeline so merge is unreachable; all name matches go to review
    - Backfill pairwise comparison: iterate all city groups, score every pair, accumulate merge/review/keep_separate lists
    - Per-event try/catch for unique constraint on reassignment: drop orphaned duplicate event rather than failing bulk update

key-files:
  created:
    - scripts/venue-dedup-backfill.ts
  modified:
    - src/lib/db/schema.ts
    - src/lib/scraper/ticketmaster.ts
    - src/lib/scraper/ticketmaster.test.ts

key-decisions:
  - "TM inline merge path is unreachable by design: incoming lat/lng is always null for TM venues at creation time so scoreVenueCandidate always returns review (name_match_no_geo), never merge"
  - "findOrCreateVenue uses scoreVenueCandidate per-candidate (not findBestMatch) to track which candidate produced the match and insert the correct venue_a_id/venue_b_id"
  - "db.select mock must be added to beforeEach default setup (not just initial mock) to prevent TypeError in scrapeTicketmaster tests that don't set up select"
  - "Dry-run real data result: 42 venues, 0 auto-merge candidates, 15 review candidates — validates thresholds are not too aggressive"

patterns-established:
  - "City venue scan pattern: db.select().from(venues).where(ilike(venues.city, city)) for case-insensitive city grouping"
  - "Merge log insert: log name/city of duplicate (not ID) since duplicate row may be deleted later"
  - "Backfill pairwise loop: flaggedAsDuplicate Set prevents double-processing when A→B merge removes A"

requirements-completed: [DEDUP-02, DEDUP-03]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 18 Plan 02: TM Pipeline Integration & Backfill CLI Summary

**Fuzzy venue dedup wired into TM ingest (scoreVenueCandidate per-city scan), two audit tables pushed to Neon, and dry-run backfill CLI validated against 42 real venues (0 auto-merges, 15 review candidates)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-15T15:38:24Z
- **Completed:** 2026-03-15T15:42:42Z
- **Tasks:** 3 (Task 2 was TDD — 2 commits: RED + GREEN)
- **Files modified:** 4

## Accomplishments

- Added `venue_merge_log` and `venue_merge_candidates` tables to schema and pushed to Neon
- Enhanced `findOrCreateVenue` to run fuzzy city-scoped matching after ILIKE miss, logging review candidates to `venue_merge_candidates`
- Created `scripts/venue-dedup-backfill.ts` — dry-run + execute modes with full audit trail
- 59 tests passing (33 ticketmaster + 26 venue-dedup); 5 new test cases added for fuzzy paths

## Task Commits

Each task committed atomically:

1. **Task 1: Add merge tracking tables** — `84c35a0` (feat)
2. **Task 2 RED: Failing tests for fuzzy matching** — `df2ec30` (test)
3. **Task 2 GREEN: Wire fuzzy matching into findOrCreateVenue** — `cc6d604` (feat)
4. **Task 3: Backfill CLI script** — `04d6ae3` (feat)

## Files Created/Modified

- `src/lib/db/schema.ts` — Added `venueMergeLog` and `venueMergeCandidates` table definitions
- `src/lib/scraper/ticketmaster.ts` — Enhanced `findOrCreateVenue` with fuzzy city scan + review/merge logging
- `src/lib/scraper/ticketmaster.test.ts` — Added 5 new test cases + `select` mock to beforeEach default setup
- `scripts/venue-dedup-backfill.ts` — One-time CLI backfill with dry-run + execute modes

## Decisions Made

- TM inline merge is unreachable by design: TM venues have no lat/lng at creation time, so `scoreVenueCandidate` always sees `hasGeo=false` for the incoming venue, routing to `review:name_match_no_geo`. This is intentional — merges without geo confirmation would be too aggressive.
- Used `scoreVenueCandidate` per-candidate in `findOrCreateVenue` rather than `findBestMatch`, because we need the `candidate.id` to populate `venue_b_id` in the review log. `findBestMatch` returns a decision without ID.
- Added `db.select` to the initial mock shape and to `beforeEach` defaults to prevent `TypeError: db.select is not a function` across all scrapeTicketmaster tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added select mock to initial db mock shape and beforeEach defaults**
- **Found during:** Task 2 GREEN (first test run)
- **Issue:** Existing mock only mocked `query.venues.findFirst` and `insert`. Adding `db.select()` call to production code caused `TypeError: client_1.db.select is not a function` across all 12 scrapeTicketmaster tests.
- **Fix:** Added `select: jest.fn()` to `jest.mock('@/lib/db/client')` initial shape, and added a default `select` mock in `beforeEach` returning empty array (no city candidates).
- **Files modified:** `src/lib/scraper/ticketmaster.test.ts`
- **Verification:** All 33 ticketmaster tests pass
- **Committed in:** `cc6d604` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing mock setup for new query method)
**Impact on plan:** Necessary fix for test correctness. No scope creep.

## Issues Encountered

- The plan's PLAN.md interface shows `findBestMatch` returning `canonicalId`/`candidateId` fields, but the actual `venue-dedup.ts` implementation (from Plan 01) returns a simple `DedupeDecision` with no IDs. Resolved by iterating `scoreVenueCandidate` per-candidate in `findOrCreateVenue` to retain the candidate ID for the audit log.

## User Setup Required

None — no external service configuration required beyond the Neon database already in use.

## Next Phase Readiness

- `venue_merge_candidates` table is populated and ready for Phase 20 admin review UI
- Dry-run backfill showed 15 real review candidates in production DB (geo-close bars in same city, one name-match-no-geo pair for Centre 200)
- Ticketmaster placeholder venues ("Ticketmaster NB" etc.) flagged as review candidates — expected, since they have identical name pattern but no geo

---
*Phase: 18-venue-deduplication*
*Completed: 2026-03-15*
