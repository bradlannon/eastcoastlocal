---
phase: 17-auto-approve-discovery
plan: 01
subsystem: scraper
tags: [drizzle, postgres, discovery, scoring, auto-approve, jest, tdd]

# Dependency graph
requires:
  - phase: 16-ticketmaster-integration
    provides: scrape_sources table and promoteSource() function patterns
  - phase: 14-fetch-pipeline
    provides: discovery-orchestrator.ts with runDiscoveryJob()
provides:
  - scoreCandidate() pure function with heuristic scoring (0.0-1.0)
  - Auto-promote loop in runDiscoveryJob() for candidates scoring >= 0.8
  - discovery_score column on discovered_sources table
  - Migration 0004_yielding_the_hunter.sql applied to production DB
affects: [admin-review-ui, discovery-pipeline, phase-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoring heuristic: base 0.5 + location signals + https bonus - path/domain penalties"
    - "Auto-approve loop runs after city insert loop; score written to DB then promote if threshold met"
    - "Social domain penalty -1.0 ensures Math.max(0,...) always clamps to 0"

key-files:
  created:
    - drizzle/0004_yielding_the_hunter.sql
  modified:
    - src/lib/db/schema.ts
    - src/lib/scraper/discovery-orchestrator.ts
    - src/lib/scraper/discovery-orchestrator.test.ts

key-decisions:
  - "Social domain penalty set to -1.0 (not -0.50 as in plan pseudocode) to guarantee Math.clamp(0) for any city/province/name combination"
  - "AUTO_APPROVE_THRESHOLD reads from env var at module load time (default 0.8) — configurable without code deploy"
  - "discovery_score nullable (null = not yet scored, pre-Phase 17 rows)"

patterns-established:
  - "scoreCandidate() is pure (no DB calls) — enables fast unit testing without mocks"
  - "Scoring loop runs after all city inserts complete — batch scoring pattern"

requirements-completed: [DISC-05]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 17 Plan 01: Auto-Approve Discovery Summary

**Heuristic scoring function scoreCandidate() with auto-promote loop in runDiscoveryJob(), persisting discovery_score to discovered_sources via Drizzle migration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T07:49:38Z
- **Completed:** 2026-03-15T07:52:57Z
- **Tasks:** 1 (TDD: 2 commits - test RED + feat GREEN)
- **Files modified:** 4

## Accomplishments

- scoreCandidate() pure function scores candidates 0.0-1.0 using city, province, source_name, https, path, and social domain signals
- Auto-promote loop in runDiscoveryJob() calls promoteSource() for candidates scoring >= AUTO_APPROVE_THRESHOLD (env-configurable, default 0.8)
- discovery_score column added to discovered_sources with nullable doublePrecision (null = pre-Phase 17 unscored rows)
- 15 unit tests pass (7 existing + 5 scoreCandidate + 3 auto-promote tests)
- Full 234-test suite passes without regression

## Task Commits

Each task was committed atomically (TDD pattern):

1. **RED - Failing tests** - `564a940` (test)
2. **GREEN - Implementation** - `e065541` (feat)

_TDD task: two commits (test RED → feat GREEN)_

## Files Created/Modified

- `src/lib/db/schema.ts` - Added discovery_score doublePrecision column to discovered_sources
- `src/lib/scraper/discovery-orchestrator.ts` - Added scoreCandidate() export and auto-promote loop in runDiscoveryJob()
- `src/lib/scraper/discovery-orchestrator.test.ts` - Added 8 new tests (5 scoreCandidate + 3 auto-promote)
- `drizzle/0004_yielding_the_hunter.sql` - Migration: ALTER TABLE discovered_sources ADD COLUMN discovery_score double precision

## Decisions Made

- Social domain penalty increased from -0.50 (plan pseudocode) to -1.0 to guarantee clamping to 0.0 even when city/province/name/https bonuses all apply (max positive score = 0.95)
- AUTO_APPROVE_THRESHOLD read at module load from env var — allows threshold tuning without code changes
- discovery_score is nullable — pre-Phase 17 rows remain null, distinguishable from scored rows

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Social domain penalty increased from -0.50 to -1.0**
- **Found during:** Task 1 (GREEN phase, test run)
- **Issue:** Plan pseudocode used `score -= 0.50` for social domains, but with all bonuses active (city+province+name+https = +0.45), score = 0.95 - 0.50 = 0.45, not 0.0. Test expected 0.0 (clamped).
- **Fix:** Changed penalty to -1.0 so Math.max(0, ...) always clamps to 0 for social domains regardless of other signal scores
- **Files modified:** src/lib/scraper/discovery-orchestrator.ts
- **Verification:** scoreCandidate test "social domain (facebook.com) clamps to 0.0" passes
- **Committed in:** e065541

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan formula)
**Impact on plan:** Essential fix for correctness — social domains should always score 0. No scope creep.

## Issues Encountered

None beyond the scoring formula fix above.

## User Setup Required

None - no external service configuration required. Migration was applied to production DB via `npm run db:migrate`.

## Next Phase Readiness

- discovery_score column live in DB, ready for admin visibility in Phase 17-02 (if planned) or future UI work
- Auto-approve loop active — first discovery run will populate scores and auto-promote high-confidence candidates
- Threshold calibration recommended after first run (target 10-30% auto-approval rate per STATE.md pending todos)

---
*Phase: 17-auto-approve-discovery*
*Completed: 2026-03-15*
