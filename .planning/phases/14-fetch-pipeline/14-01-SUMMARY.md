---
phase: 14-fetch-pipeline
plan: 01
subsystem: scraper
tags: [cheerio, drizzle, fetch, retry, rate-limiting, pagination, json-ld, schema-org]

# Dependency graph
requires: []
provides:
  - fetchAndPreprocess returning { text, rawHtml } with retry, per-domain rate limiting, and multi-page pagination
  - extractJsonLdEvents parsing schema.org Event blocks from raw HTML into ExtractedEvent[]
  - max_pages column on scrape_sources table (default 1)
affects: [14-fetch-pipeline/14-02, orchestrator.ts, json-ld fast-path integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Module-level Map<domain, lastRequestTime> for per-domain rate limiting
    - fetchWithRetry with exponential backoff (retries 429/503 only, not 404)
    - rawHtml captured BEFORE cheerio mutation to preserve script tags
    - Hard cap of 3 pages in code via Math.min(maxPages, 3) regardless of caller input
    - JSON-LD as fast-path alternative to Gemini with confidence=1.0

key-files:
  created:
    - src/lib/scraper/json-ld.ts
    - src/lib/scraper/fetcher.test.ts (rewritten)
    - src/lib/scraper/json-ld.test.ts
    - drizzle/0002_gray_joshua_kane.sql
  modified:
    - src/lib/db/schema.ts
    - src/lib/scraper/fetcher.ts
    - src/lib/scraper/orchestrator.ts
    - src/lib/scraper/bandsintown.test.ts
    - src/lib/scraper/eventbrite.test.ts

key-decisions:
  - "rawHtml captured from response.text() before cheerio.load() mutation — ensures JSON-LD script tags are preserved"
  - "fetchWithRetry retries only 429 and 503 (transient); 404 and other 4xx throw immediately"
  - "Per-domain rate limit map is module-level so it persists across all sources within a single scrape run"
  - "Multi-page hard cap enforced in code (Math.min(maxPages, 3)) not just config — Vercel timeout constraint"

patterns-established:
  - "Retry pattern: fetchWithRetry wraps native fetch, retries 429/503 with 1s/2s backoff, throws after 2 retries"
  - "Rate limiting pattern: applyDomainRateLimit checks module-level Map before each request"
  - "rawHtml pattern: capture html = response.text() before cheerio.load() to preserve script tags"
  - "JSON-LD extraction: cheerio selects script[type='application/ld+json'], parses @graph containers, maps to ExtractedEvent[]"

requirements-completed: [SCRP-01, SCRP-02, SCRP-03, PLAT-04]

# Metrics
duration: 6min
completed: 2026-03-15
---

# Phase 14 Plan 01: Fetch Pipeline Summary

**Retry + rate limiting + multi-page pagination added to fetcher.ts, JSON-LD schema.org Event extractor added as fast-path before Gemini, and max_pages DB column migrated**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-15T06:28:01Z
- **Completed:** 2026-03-15T06:34:24Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- fetchAndPreprocess now returns { text, rawHtml } with exponential backoff retry (429/503), per-domain rate limiting (2s+ gap via module-level Map), and multi-page pagination following rel="next" up to hard cap of 3
- New json-ld.ts module extracts schema.org Event blocks from rawHtml into ExtractedEvent[] with confidence=1.0, handles @graph containers, malformed JSON-LD, and all standard field mappings
- max_pages column added to scrape_sources (default 1) with Drizzle migration applied
- All 186 tests pass across the full suite (37 new tests added)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing fetcher tests** - `a3d1c8b` (test)
2. **Task 1 GREEN: Fetcher implementation** - `4d3aaeb` (feat)
3. **Task 2 RED: Failing json-ld tests** - `a723e04` (test)
4. **Task 2 GREEN: JSON-LD implementation** - `e778311` (feat)

**Plan metadata:** (docs: complete plan — pending)

_Note: TDD tasks have separate RED/GREEN commits_

## Files Created/Modified
- `src/lib/scraper/fetcher.ts` - Rewritten with retry, rate limiting, multi-page, rawHtml return
- `src/lib/scraper/json-ld.ts` - New JSON-LD extraction module
- `src/lib/scraper/fetcher.test.ts` - Rewritten with 20 tests (updated return type + new capabilities)
- `src/lib/scraper/json-ld.test.ts` - New with 17 tests
- `src/lib/db/schema.ts` - Added max_pages column to scrape_sources
- `drizzle/0002_gray_joshua_kane.sql` - Migration for max_pages column
- `src/lib/scraper/orchestrator.ts` - Updated to destructure { text } from new return type
- `src/lib/scraper/bandsintown.test.ts` - Added max_pages: 1 to mock ScrapeSource
- `src/lib/scraper/eventbrite.test.ts` - Added max_pages: 1 to mock ScrapeSource

## Decisions Made
- Captured rawHtml from response.text() before cheerio.load() to avoid script tag stripping — essential for JSON-LD extraction
- Only retry 429/503 (transient); 404 throws immediately to avoid wasting time on permanently blocked URLs
- Hard cap of 3 pages in code not config — prevents Vercel timeout regardless of DB value
- JSON-LD module is standalone (no Gemini calls) — orchestrator will wire fast-path in Plan 02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test timeout for exhausted retries test**
- **Found during:** Task 1 (fetcher implementation)
- **Issue:** exhausted retries test had 5s default timeout but retry delays (1s + 2s) + domain rate limit (2s+) = ~5s+ total, causing test timeout
- **Fix:** Added explicit 15000ms timeout to that test case
- **Files modified:** src/lib/scraper/fetcher.test.ts
- **Verification:** Test passes with extended timeout
- **Committed in:** 4d3aaeb (Task 1 GREEN commit)

**2. [Rule 2 - Missing Critical] Updated bandsintown.test.ts and eventbrite.test.ts with max_pages field**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** Adding max_pages as notNull() to schema broke ScrapeSource type in 2 test files — TS2741 type error
- **Fix:** Added max_pages: 1 to mock ScrapeSource objects in both files
- **Files modified:** src/lib/scraper/bandsintown.test.ts, src/lib/scraper/eventbrite.test.ts
- **Verification:** npx tsc --noEmit passes clean
- **Committed in:** 4d3aaeb (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 test timeout, 1 type error from schema change)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- fetchAndPreprocess enhanced and ready for Plan 02 orchestrator wiring
- extractJsonLdEvents ready to be called from orchestrator as fast-path before Gemini
- max_pages column in DB ready for per-source pagination configuration
- orchestrator.ts already updated to destructure { text } but JSON-LD fast-path wiring is Plan 02 scope

---
*Phase: 14-fetch-pipeline*
*Completed: 2026-03-15*
