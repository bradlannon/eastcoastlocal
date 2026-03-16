---
phase: 24-reddit-discovery
plan: 02
subsystem: api
tags: [reddit, cron, vercel, route, tdd]

# Dependency graph
requires:
  - phase: 24-01
    provides: runRedditDiscovery function, ALL_REDDIT_SUBREDDITS constant, RedditDiscoveryRunResult interface

provides:
  - Cron endpoint GET /api/cron/discover-reddit wired to runRedditDiscovery
  - Vercel weekly Friday 9am UTC schedule for Reddit discovery
  - 5 unit tests covering auth, success, error, and subreddit argument

affects: [vercel-cron-schedule, reddit-discovery-automation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cron route mirrors discover-places-ns pattern exactly: Bearer auth, try/catch, spread result + timestamp

key-files:
  created:
    - src/app/api/cron/discover-reddit/route.ts
    - src/app/api/cron/discover-reddit/route.test.ts
  modified:
    - vercel.json

key-decisions:
  - "Friday 9am UTC (0 9 * * 5) schedule for Reddit discovery — distinct day from Places province crons (Mon-Thu)"

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 24 Plan 02: Reddit Cron Endpoint Summary

**Thin Next.js cron route wiring runRedditDiscovery to GET /api/cron/discover-reddit with Bearer auth, plus Friday 9am UTC Vercel schedule**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-16T02:50:54Z
- **Completed:** 2026-03-16T02:52:54Z
- **Tasks:** 2 (Task 1 TDD: 2 commits; Task 2: 1 commit)
- **Files modified:** 3

## Accomplishments

- Created `route.ts` mirroring the discover-places-ns pattern exactly: Bearer CRON_SECRET auth, runRedditDiscovery(ALL_REDDIT_SUBREDDITS) call, JSON response with spread result + timestamp
- Exported `maxDuration = 60` to match Vercel function timeout requirements
- 5 unit tests cover all specified behaviors: 401 missing auth, 401 wrong token, 200 success with all result fields, 500 error propagation, correct argument passing
- Added `/api/cron/discover-reddit` to vercel.json crons with `0 9 * * 5` (Friday 9am UTC)
- vercel.json now has 7 total cron entries, all 6 existing entries preserved

## Task Commits

Each task was committed atomically (Task 1 TDD: test first, then implement):

1. **Task 1: RED — Failing tests** - `882ba95` (test)
2. **Task 1: GREEN — Implementation** - `d5b610a` (feat)
3. **Task 2: vercel.json schedule** - `a4358a6` (chore)

## Files Created/Modified

- `src/app/api/cron/discover-reddit/route.ts` - Cron endpoint (17 lines): auth check, runRedditDiscovery call, JSON response
- `src/app/api/cron/discover-reddit/route.test.ts` - 5 unit tests (89 lines) covering all plan-specified behaviors
- `vercel.json` - Added Reddit discovery cron entry (Friday 9am UTC)

## Decisions Made

- **Friday schedule**: `0 9 * * 5` — distinct from Places province crons (Mon-Thu 9am UTC), natural weekly cadence for Reddit mining

## Deviations from Plan

None - plan executed exactly as written. All 5 specified test cases pass. vercel.json has exactly 7 cron entries.

## Issues Encountered

The full test suite has 2 pre-existing failures in `ticketmaster.test.ts` (incomplete `.limit()` mock — documented in STATE.md tech debt). Not related to this plan.

## Self-Check: PASSED

- `src/app/api/cron/discover-reddit/route.ts` — FOUND
- `src/app/api/cron/discover-reddit/route.test.ts` — FOUND
- `vercel.json` contains `discover-reddit` — VERIFIED
- Task commits 882ba95, d5b610a, a4358a6 — FOUND
- 5 route tests pass, 7 vercel.json cron entries confirmed

---
*Phase: 24-reddit-discovery*
*Completed: 2026-03-15*
