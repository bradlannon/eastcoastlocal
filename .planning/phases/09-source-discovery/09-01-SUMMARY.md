---
phase: 09-source-discovery
plan: 01
subsystem: api
tags: [gemini, google-search-grounding, drizzle-orm, zod, vercel-cron, discovery]

# Dependency graph
requires:
  - phase: 06-schema-migration
    provides: discovered_sources table with status/domain/discovery_method columns
  - phase: 07-ai-categorization
    provides: generateText + Output.object pattern from extractor.ts
provides:
  - runDiscoveryJob() in discovery-orchestrator.ts — weekly Gemini-powered venue discovery pipeline
  - GET /api/cron/discover — authenticated cron endpoint for weekly source discovery
  - Weekly Vercel cron schedule (Monday 08:00 UTC) in vercel.json
affects: [promote-source, admin-ui, manual-review-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "google.tools.googleSearch({}) with tool key 'google_search' for Gemini grounding (NOT useSearchGrounding)"
    - "Per-city Gemini queries for small-geography discovery accuracy"
    - "Domain-based deduplication using Set<hostname> against both scrape_sources and discovered_sources"
    - "DISCOVERY_THROTTLE_MS env var read inside function body (not module scope) to allow test override"

key-files:
  created:
    - src/lib/scraper/discovery-orchestrator.ts
    - src/lib/scraper/discovery-orchestrator.test.ts
    - src/app/api/cron/discover/route.ts
    - src/app/api/cron/discover/route.test.ts
  modified:
    - vercel.json

key-decisions:
  - "DISCOVERY_THROTTLE_MS read inside runDiscoveryJob() body (not module scope) so tests can set process.env.DISCOVERY_THROTTLE_MS='0' without module reload"
  - "google.tools.googleSearch({}) with tool key 'google_search' — confirmed working API for @ai-sdk/google 3.0.43; useSearchGrounding does not exist"
  - "Deduplication uses hostname comparison (not full URL) to treat same-domain paths as same venue"
  - "Aggregator filter uses hostname.includes(agg) to catch subdomains like www.eventbrite.com"

patterns-established:
  - "Cron route pattern: maxDuration=60, Bearer CRON_SECRET auth, try/catch with JSON responses"
  - "Discovery throttle: delay() between city calls, env var read lazily inside function"

requirements-completed: [DISC-01, DISC-02]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 09 Plan 01: Source Discovery Summary

**Weekly Gemini + Google Search grounding pipeline that finds Atlantic Canada venue websites per city, deduplicates by domain, filters aggregators, and stages candidates in discovered_sources with status='pending'**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T00:10:31Z
- **Completed:** 2026-03-15T00:13:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Discovery orchestrator queries Gemini with google.tools.googleSearch({}) for 6 Atlantic Canada cities (Halifax/NS, Moncton/NB, Fredericton/NB, Saint John/NB, Charlottetown/PEI, St. John's/NL)
- Domain-based deduplication against both scrape_sources and discovered_sources prevents re-discovery; intra-run deduplication also prevents same-domain duplicates within one job run
- Aggregator filtering (eventbrite.com, bandsintown.com, facebook.com, ticketmaster.com) and malformed URL skipping keep staging table clean
- Authenticated cron route at /api/cron/discover (Bearer CRON_SECRET) with weekly Vercel schedule (Monday 08:00 UTC)
- 11 unit tests across both files, all passing; full suite green (pre-existing seed.test.ts failure unrelated)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create discovery orchestrator with tests** - `c704c3d` (feat)
2. **Task 2: Create discovery cron route with tests and vercel.json entry** - `634e0fd` (feat)

## Files Created/Modified

- `src/lib/scraper/discovery-orchestrator.ts` - runDiscoveryJob() — 6-city Gemini grounding loop with dedup and insert
- `src/lib/scraper/discovery-orchestrator.test.ts` - 7 unit tests covering dedup, aggregator filter, insert values, malformed URLs, call count
- `src/app/api/cron/discover/route.ts` - GET handler mirroring scrape cron pattern; Bearer auth + error handling
- `src/app/api/cron/discover/route.test.ts` - 4 unit tests: 401 no token, 401 wrong token, 200 success, 500 error
- `vercel.json` - Added weekly discover cron entry (0 8 * * 1) alongside existing daily scrape cron

## Decisions Made

- `DISCOVERY_THROTTLE_MS` is read inside `runDiscoveryJob()` body rather than at module scope so test setup can set `process.env.DISCOVERY_THROTTLE_MS='0'` in `beforeAll()` without requiring module reload. This is a deviation from `orchestrator.ts` which reads `AI_THROTTLE_MS` at module scope — necessary here to avoid 5-second-per-city test timeouts.
- Aggregator filter uses `hostname.includes(agg)` rather than strict equality to catch subdomains (e.g., `www.eventbrite.com`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DISCOVERY_THROTTLE_MS read inside function body instead of module scope**
- **Found during:** Task 1 (GREEN phase — tests timing out)
- **Issue:** With throttle read at module scope (default 2000ms) and 5 inter-city delays per test, each test took ~10s and exceeded Jest's 5s timeout
- **Fix:** Moved `parseInt(process.env.DISCOVERY_THROTTLE_MS ?? '2000', 10)` inside `runDiscoveryJob()` body so `beforeAll(() => { process.env.DISCOVERY_THROTTLE_MS = '0' })` in tests takes effect without module reload
- **Files modified:** src/lib/scraper/discovery-orchestrator.ts
- **Verification:** All 7 tests pass in ~1s
- **Committed in:** c704c3d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Required for tests to complete within Jest timeout. No scope creep; production behavior unchanged (env var still defaults to 2000ms).

## Issues Encountered

None beyond the throttle/test-timeout issue documented above.

## User Setup Required

None - no external service configuration required beyond the existing `CRON_SECRET` and `GOOGLE_GENERATIVE_AI_API_KEY` environment variables already in use.

## Next Phase Readiness

- Discovery pipeline is complete and tested. Ready to deploy and verify Gemini grounding quality for Atlantic Canada (flagged as unverified in research).
- DISC-01 and DISC-02 requirements complete. DISC-03 (promote-source script) is documented in research but not in this plan's scope.
- Recommend manual test with Halifax before trusting staging pipeline: `DISCOVERY_THROTTLE_MS=0 tsx src/lib/scraper/discovery-orchestrator.ts` (after adding a dotenv/config import for local runs).

---
*Phase: 09-source-discovery*
*Completed: 2026-03-15*
