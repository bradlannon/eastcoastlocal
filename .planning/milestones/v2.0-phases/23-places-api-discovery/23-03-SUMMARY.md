---
phase: 23-places-api-discovery
plan: 03
subsystem: infra
tags: [cron, vercel, places-api, google-places, discovery, scheduling]

# Dependency graph
requires:
  - phase: 23-02
    provides: runPlacesDiscovery, PLACES_CITIES, DiscoveryRunResult from places-discoverer.ts

provides:
  - "4 per-province cron endpoints: discover-places-ns, discover-places-nb, discover-places-pei, discover-places-nl"
  - "vercel.json cron schedule for all 4 provinces (Mon-Thu, 9am UTC)"
  - "GEMINI_AUTO_APPROVE threshold at 0.9 in discovery-orchestrator.ts"

affects: [phase-24-reddit-discovery, phase-25-ticketmaster-dedup, admin-discovery-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-province cron isolation: each province runs independently to avoid 60s timeout"
    - "Staggered weekday schedules: Mon-Thu at 9am UTC for 4-province coverage"
    - "Per-method auto-approve thresholds: google_places=0.8, gemini_google_search=0.9"

key-files:
  created:
    - src/app/api/cron/discover-places-ns/route.ts
    - src/app/api/cron/discover-places-nb/route.ts
    - src/app/api/cron/discover-places-pei/route.ts
    - src/app/api/cron/discover-places-nl/route.ts
  modified:
    - vercel.json
    - src/lib/scraper/discovery-orchestrator.ts
    - src/lib/scraper/discovery-orchestrator.test.ts

key-decisions:
  - "Per-province cron isolation chosen to avoid 60s function timeout for full Atlantic Canada scan"
  - "Weekday stagger (Mon-Thu 9am UTC) spreads Places API quota usage across the week"
  - "GEMINI_AUTO_APPROVE env var renamed from AUTO_APPROVE_THRESHOLD for clarity between methods"

patterns-established:
  - "Province cron pattern: import runPlacesDiscovery + PLACES_CITIES[PROVINCE], return spread result + timestamp"

requirements-completed: [GEO-02, GEO-03, SCORE-02]

# Metrics
duration: 15min
completed: 2026-03-15
---

# Phase 23 Plan 03: Province Cron Endpoints and Threshold Update Summary

**4 per-province Places discovery cron endpoints wired to production with staggered Mon-Thu schedules and GEMINI_AUTO_APPROVE threshold raised to 0.9**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-15T02:00:00Z
- **Completed:** 2026-03-15T02:15:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created 4 province cron route files (NS, NB, PEI, NL) each calling `runPlacesDiscovery` with their respective `PLACES_CITIES` subset
- Updated vercel.json with 4 new staggered cron entries (Mon-Thu at 9am UTC) alongside the 2 existing cron jobs
- Renamed `AUTO_APPROVE_THRESHOLD` to `GEMINI_AUTO_APPROVE` and updated default from 0.8 to 0.9 in discovery-orchestrator.ts
- All 15 discovery-orchestrator tests pass with updated threshold and env var name

## Task Commits

Each task was committed atomically:

1. **Task 1: Create 4 province cron endpoints and update vercel.json** - `a4270d5` (feat)
2. **Task 2: Update Gemini auto-approve threshold to 0.9 and fix tests** - `77208d0` (feat)

## Files Created/Modified

- `src/app/api/cron/discover-places-ns/route.ts` - Nova Scotia cron endpoint calling PLACES_CITIES.NS
- `src/app/api/cron/discover-places-nb/route.ts` - New Brunswick cron endpoint calling PLACES_CITIES.NB
- `src/app/api/cron/discover-places-pei/route.ts` - PEI cron endpoint calling PLACES_CITIES.PEI
- `src/app/api/cron/discover-places-nl/route.ts` - Newfoundland cron endpoint calling PLACES_CITIES.NL
- `vercel.json` - Added 4 new cron entries Mon-Thu at 9am UTC; existing scrape/discover unchanged
- `src/lib/scraper/discovery-orchestrator.ts` - Renamed AUTO_APPROVE_THRESHOLD -> GEMINI_AUTO_APPROVE, default 0.9
- `src/lib/scraper/discovery-orchestrator.test.ts` - Updated env var name and test descriptions to reflect 0.9

## Decisions Made

- Per-province cron isolation: each province runs as its own endpoint to avoid 60s Vercel function timeout when covering all Atlantic cities in one run
- Staggered weekday schedule: Mon=NS, Tue=NB, Wed=PEI, Thu=NL distributes Places API calls across the week
- GEMINI_AUTO_APPROVE is now the env var name (vs. PLACES_AUTO_APPROVE = 0.8) — clearly distinguishes between Gemini-based and Places API-based auto-approval thresholds

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors found during `tsc --noEmit` check: test mock objects in 4 unrelated test files missing `google_place_id` field (added in Phase 22 schema changes). These errors predate this plan and are unrelated to any changes made here. Logged to `deferred-items.md` in phase directory. New route files have zero TypeScript errors.

Pre-existing ticketmaster.test.ts failures (2 tests, incomplete `.limit()` mock) are already in STATE.md tech debt — unrelated to this plan.

## User Setup Required

None — no external service configuration required for this plan. The cron endpoints will be active once deployed to Vercel. Ensure `CRON_SECRET` and `GOOGLE_MAPS_API_KEY` env vars are set in Vercel dashboard (Phase 23-01 prerequisite).

## Next Phase Readiness

- Phase 23 complete: Places discovery pipeline fully wired from schema (22) through engine (23-02) to cron production endpoints (23-03)
- Phase 24 (Reddit discovery) can proceed: no blockers
- Pre-existing TS errors in test mocks should be fixed before Phase 25 to keep `tsc --noEmit` clean — see `deferred-items.md`

---
*Phase: 23-places-api-discovery*
*Completed: 2026-03-15*

## Self-Check: PASSED

- src/app/api/cron/discover-places-ns/route.ts — FOUND
- src/app/api/cron/discover-places-nb/route.ts — FOUND
- src/app/api/cron/discover-places-pei/route.ts — FOUND
- src/app/api/cron/discover-places-nl/route.ts — FOUND
- vercel.json — FOUND
- Commit a4270d5 — FOUND
- Commit 77208d0 — FOUND
