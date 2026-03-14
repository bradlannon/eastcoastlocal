---
phase: 02-data-pipeline
plan: "03"
subsystem: scraper
tags: [orchestrator, cron, vercel, pipeline, tdd, jest, next-api-routes]

# Dependency graph
requires:
  - phase: 02-data-pipeline/02-01
    provides: fetchAndPreprocess, extractEvents, upsertEvent, geocodeAddress from fetcher/extractor/normalizer/geocoder modules
  - phase: 02-data-pipeline/02-02
    provides: scrapeEventbrite, scrapeBandsintown API clients
provides:
  - runScrapeJob orchestrator that dispatches all enabled scrape_sources sequentially
  - Secured cron API route at /api/cron/scrape (CRON_SECRET Bearer auth)
  - vercel.json daily cron at 6:00 AM UTC targeting /api/cron/scrape
affects: [deployment, vercel-dashboard, live-data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orchestrator pattern: sequential per-source dispatch with per-source try/catch (never abort full run)"
    - "Source type dispatch: venue_website -> fetch/extract/geocode/upsert, eventbrite -> scrapeEventbrite, bandsintown -> scrapeBandsintown"
    - "Cron security: Bearer token check against CRON_SECRET env var, 401 on mismatch"
    - "TDD: RED commit (failing tests for route) then GREEN commit (working implementation)"

key-files:
  created:
    - src/lib/scraper/orchestrator.ts
    - src/app/api/cron/scrape/route.ts
    - src/app/api/cron/scrape/route.test.ts
    - vercel.json
  modified: []

key-decisions:
  - "Orchestrator fetches venue separately (not via relational query) due to Neon HTTP driver constraints with drizzle relations"
  - "Per-source try/catch ensures single source failure never aborts the full scrape run"
  - "maxDuration=60 for Hobby plan compatibility; comment notes Pro allows 300"
  - "Geocoding happens at orchestrator level before event extraction for venue_website sources"

patterns-established:
  - "Cron route pattern: check Authorization header against Bearer ${CRON_SECRET}, return 401/200/500"
  - "Orchestrator updates last_scraped_at + last_scrape_status on both success and failure paths"

requirements-completed: [SCRP-01, SCRP-09]

# Metrics
duration: 6min
completed: 2026-03-14
---

# Phase 2 Plan 03: Orchestrator, Cron Route, and Vercel Schedule Summary

**Sequential scraping orchestrator with per-source error isolation, CRON_SECRET-secured API route, and daily 6 AM UTC Vercel cron schedule wiring all pipeline modules end-to-end**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-14T02:37:25Z
- **Completed:** 2026-03-14T02:43:00Z
- **Tasks:** 2 automated (Task 3 is human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Orchestrator (`runScrapeJob`) queries all enabled scrape_sources and dispatches to correct handler by source_type, with per-source try/catch that never aborts the full run
- Secured cron GET route validates CRON_SECRET Bearer token (401 without valid auth, 200 + timestamp on success, 500 on orchestrator error)
- vercel.json configures daily 6:00 AM UTC cron targeting /api/cron/scrape
- 5 new route unit tests; 57 total tests passing across 9 suites
- Next.js build succeeds with `/api/cron/scrape` registered as dynamic route

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for cron route** - `6510a22` (test)
2. **Task 1 (GREEN): Orchestrator + cron route implementation** - `ec9cee4` (feat)
3. **Task 2: vercel.json + full build verification** - `e59dbaf` (chore)

_Note: TDD task has two commits (test -> feat)_

## Files Created/Modified
- `src/lib/scraper/orchestrator.ts` - Sequential pipeline orchestrator, exports `runScrapeJob()`
- `src/app/api/cron/scrape/route.ts` - Vercel cron entry point, exports `GET` handler + `maxDuration=60`
- `src/app/api/cron/scrape/route.test.ts` - 5 route unit tests covering auth scenarios and error handling
- `vercel.json` - Daily cron schedule `0 6 * * *` targeting `/api/cron/scrape`

## Decisions Made
- Orchestrator queries venues separately rather than using drizzle relational queries, avoiding potential Neon HTTP driver compatibility issues with `with:` clauses
- Per-source error isolation via try/catch ensures one broken source doesn't abort other sources
- `maxDuration=60` set for Hobby plan Vercel limit (comment in code notes Pro allows 300)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External service requires manual configuration before production use:**

- **CRON_SECRET**: Set in Vercel Dashboard -> Project Settings -> Environment Variables
  - Generate with: `openssl rand -hex 32`
  - Required for cron endpoint to be callable by Vercel's cron system

## Next Phase Readiness
- Complete pipeline is wired end-to-end: URL -> HTML -> LLM extraction -> normalization -> geocoding -> upsert dedup
- Task 3 (human-verify checkpoint) requires user to test the cron endpoint locally and deploy to Vercel
- After Vercel deploy with CRON_SECRET set, cron will appear in Vercel Dashboard -> Cron Jobs
- Phase 3 (UI) can begin once data is flowing into the database

## Self-Check: PASSED

- FOUND: src/lib/scraper/orchestrator.ts
- FOUND: src/app/api/cron/scrape/route.ts
- FOUND: src/app/api/cron/scrape/route.test.ts
- FOUND: vercel.json (contains "0 6 * * *" cron schedule)
- FOUND: commit 6510a22 (test RED phase)
- FOUND: commit ec9cee4 (feat GREEN phase)
- FOUND: commit e59dbaf (chore vercel.json)
- Tests: 57 passed, 0 failed
- TypeScript: no errors
- Next.js build: success

---
*Phase: 02-data-pipeline*
*Completed: 2026-03-14*
