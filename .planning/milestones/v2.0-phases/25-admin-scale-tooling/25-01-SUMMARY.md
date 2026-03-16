---
phase: 25-admin-scale-tooling
plan: 01
subsystem: database
tags: [drizzle, postgres, cron, discovery, instrumentation]

# Dependency graph
requires:
  - phase: 24-reddit-discovery
    provides: Reddit discovery module (reddit-discoverer.ts) and RedditDiscoveryRunResult type
  - phase: 23-places-api-discovery
    provides: Places discovery module (places-discoverer.ts) and DiscoveryRunResult type
  - phase: 22-schema-foundation
    provides: Drizzle schema patterns, discovered_sources table
provides:
  - discovery_runs Postgres table with migration 0008
  - DiscoveryJobResult interface exported from discovery-orchestrator.ts
  - All 6 cron routes (Places x4, Gemini, Reddit) instrumented to persist run metrics
affects:
  - 25-02 (admin dashboard — reads discovery_runs for health display)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cron instrumentation pattern: capture startedAt before call, insert success row after, nested try/catch for error-path insert to avoid masking original error"
    - "Error-path db.insert wrapped in its own try/catch that logs but does not rethrow"

key-files:
  created:
    - drizzle/0008_stiff_pretty_boy.sql
    - drizzle/meta/0008_snapshot.json
  modified:
    - src/lib/db/schema.ts
    - src/lib/scraper/discovery-orchestrator.ts
    - src/app/api/cron/discover/route.ts
    - src/app/api/cron/discover-reddit/route.ts
    - src/app/api/cron/discover-places-ns/route.ts
    - src/app/api/cron/discover-places-nb/route.ts
    - src/app/api/cron/discover-places-pei/route.ts
    - src/app/api/cron/discover-places-nl/route.ts

key-decisions:
  - "discovery_runs has no indexes beyond PK — table is small (~350 rows/year) and only queried ORDER BY completed_at DESC LIMIT 10"
  - "skipped_dedup maps to enriched field from DiscoveryRunResult for Places routes; 0 for Gemini and Reddit (no dedup count available)"
  - "Error-path insert uses nested try/catch to ensure DB logging failure does not mask original cron error"

patterns-established:
  - "Cron route structure: startedAt = new Date() before job call; insert success row after; nested try/catch for error-path insert"

requirements-completed: [ADMIN-02]

# Metrics
duration: 15min
completed: 2026-03-16
---

# Phase 25 Plan 01: Discovery Run Instrumentation Summary

**discovery_runs Postgres table (migration 0008) plus all 6 cron routes instrumented to persist per-run metrics with error-path logging**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-16T11:40:00Z
- **Completed:** 2026-03-16T11:56:06Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `discovery_runs` table to Drizzle schema with 11 columns covering method, province, timing, and metrics
- Generated and applied migration 0008 to production database
- Exported `DiscoveryJobResult` interface from discovery-orchestrator.ts; changed return type from `void` to `DiscoveryJobResult`
- Instrumented all 6 cron routes with `db.insert(discovery_runs)` on both success and error paths
- Build passes cleanly with no type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add discovery_runs table and generate migration** - `95bb0d8` (feat)
2. **Task 2: Update runDiscoveryJob + instrument all 6 cron routes** - `be97b70` (feat)

## Files Created/Modified

- `src/lib/db/schema.ts` - Added `discovery_runs` table definition
- `drizzle/0008_stiff_pretty_boy.sql` - Migration SQL for discovery_runs table
- `drizzle/meta/0008_snapshot.json` - Drizzle metadata snapshot
- `drizzle/meta/_journal.json` - Updated migration journal
- `src/lib/scraper/discovery-orchestrator.ts` - Added DiscoveryJobResult interface; changed runDiscoveryJob to return it
- `src/app/api/cron/discover/route.ts` - Instrumented with gemini_google_search discovery_runs insert
- `src/app/api/cron/discover-reddit/route.ts` - Instrumented with reddit_gemini discovery_runs insert
- `src/app/api/cron/discover-places-ns/route.ts` - Instrumented with google_places NS discovery_runs insert
- `src/app/api/cron/discover-places-nb/route.ts` - Instrumented with google_places NB discovery_runs insert
- `src/app/api/cron/discover-places-pei/route.ts` - Instrumented with google_places PEI discovery_runs insert
- `src/app/api/cron/discover-places-nl/route.ts` - Instrumented with google_places NL discovery_runs insert

## Decisions Made

- No indexes beyond PK on discovery_runs — table is small (~350 rows/year) and only queried ORDER BY completed_at DESC LIMIT 10
- `skipped_dedup` maps to `enriched` field from DiscoveryRunResult for Places routes; set to 0 for Gemini and Reddit (no dedup count tracked there)
- Error-path `db.insert` wrapped in nested try/catch to prevent DB logging failure from masking the original cron error

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `discovery_runs` table is live in the database with migration applied
- All 6 cron routes will now persist run metrics on each execution
- Phase 25-02 (admin dashboard) can query `discovery_runs` for recent run health display

---
*Phase: 25-admin-scale-tooling*
*Completed: 2026-03-16*
