---
phase: 18-venue-deduplication
plan: 01
subsystem: scraper
tags: [levenshtein, geospatial, deduplication, pure-functions, tdd]

# Dependency graph
requires:
  - phase: timelapse-utils
    provides: haversineDistance function for geo proximity scoring
provides:
  - Pure-function venue dedup scoring module (venue-dedup.ts)
  - normalizeVenueName, venueNameRatio, scoreVenueCandidate, findBestMatch
  - DedupeDecision type and threshold constants
affects:
  - 18-02: TM pipeline integration consumes scoreVenueCandidate/findBestMatch
  - 18-backfill: CLI backfill script consumes the same scoring API

# Tech tracking
tech-stack:
  added: [fastest-levenshtein@1.0.16]
  patterns:
    - Two-signal merge gate — name proportional distance AND geocoordinate proximity both required
    - Proportional Levenshtein (distance / max_length) normalizes across short and long venue names
    - TM no-geo edge case — incoming null lat/lng always routes to review, never auto-merge

key-files:
  created:
    - src/lib/scraper/venue-dedup.ts
    - src/lib/scraper/venue-dedup.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Test fixtures must use name pairs that actually satisfy the 0.15 ratio threshold — 'Scotiabank Centre Halifax' vs 'Scotiabank Centre' (ratio 0.32) does not; 'Scotiabank Center' (US spelling) vs 'Scotiabank Centre' (ratio 0.118) does"
  - "scoreVenueCandidate treats hasGeo as false when either incoming OR candidate lacks lat/lng — both must have coordinates for geo signal to fire"
  - "Borderline zone 100m–500m with name match routes to review:name_match_geo_uncertain, distinct from geo_distant (> 500m)"

patterns-established:
  - "VenueForDedup interface: { name, lat, lng } — minimal surface for pure scoring without DB types"
  - "DedupeDecision union type distinguishes merge | review(with reason) | keep_separate"
  - "findBestMatch priority: merge > review > keep_separate — returns first merge immediately"

requirements-completed: [DEDUP-01, DEDUP-03]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 18 Plan 01: Venue Dedup Scoring Module Summary

**Pure-function Levenshtein + haversine two-signal scoring library with 26 TDD tests covering full decision matrix including TM no-geo edge case**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-15T15:31:54Z
- **Completed:** 2026-03-15T15:35:06Z
- **Tasks:** 1 (TDD — 2 commits: RED + GREEN)
- **Files modified:** 4

## Accomplishments

- Installed `fastest-levenshtein` and built pure-function scoring module with no DB dependencies
- Implemented full decision matrix: merge, review (4 reasons), keep_separate
- 26 test cases covering all branches including the critical TM no-geo edge case (null lat/lng → review, never auto-merge)

## Task Commits

Each TDD phase committed atomically:

1. **RED — failing tests** - `62d05d2` (test)
2. **GREEN — implementation** - `d34b086` (feat)

## Files Created/Modified

- `src/lib/scraper/venue-dedup.ts` — Scoring module: normalizeVenueName, venueNameRatio, scoreVenueCandidate, findBestMatch, threshold constants, DedupeDecision type
- `src/lib/scraper/venue-dedup.test.ts` — 26 test cases across 4 describe blocks
- `package.json` — fastest-levenshtein dependency added
- `package-lock.json` — lockfile updated

## Decisions Made

- Test fixtures for the merge case must use name pairs that actually satisfy the 0.15 ratio. Initial fixture "Scotiabank Centre Halifax" vs "Scotiabank Centre" computes 0.32, so it correctly produces `keep_separate` — the test was wrong, not the implementation. Fixed to use "Scotiabank Center" (US spelling variant) which gives ratio 0.118.
- `hasGeo` in `scoreVenueCandidate` requires BOTH incoming AND candidate to have coordinates. If either lacks lat/lng, the geo signal is unavailable and the no-geo review path applies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect test fixture for merge case**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** Test used "Scotiabank Centre Halifax" vs "Scotiabank Centre" as the merge pair, but the proportional Levenshtein ratio is 0.32 — above the 0.15 threshold. The implementation was correct; the test fixture was wrong.
- **Fix:** Changed incoming name to "Scotiabank Center" (US spelling), which gives ratio 0.118 against "Scotiabank Centre" — correctly below 0.15
- **Files modified:** src/lib/scraper/venue-dedup.test.ts (3 test cases updated)
- **Verification:** All 26 tests pass
- **Committed in:** d34b086 (GREEN phase commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — test fixture bug)
**Impact on plan:** Correctness fix — the scoring logic was right, the test expectation was wrong. No scope creep.

## Issues Encountered

- Jest CLI flag changed: `--testPathPattern` (old) → `--testPathPatterns` (new in Jest 30). Used `npx jest --testPathPatterns` directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `venue-dedup.ts` is ready for consumption by Plan 02 (TM pipeline integration)
- The `VenueForDedup` interface and `DedupeDecision` type are the integration contract
- `findBestMatch(incoming, candidates[])` is the entry point for the TM ingest pipeline

---
*Phase: 18-venue-deduplication*
*Completed: 2026-03-15*
