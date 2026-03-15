---
phase: 14-fetch-pipeline
plan: 02
subsystem: scraper
tags: [json-ld, schema-org, fetch, rate-limiting, cheerio, orchestrator]

# Dependency graph
requires:
  - phase: 14-fetch-pipeline/14-01
    provides: fetchAndPreprocess returning { text, rawHtml }, extractJsonLdEvents, max_pages DB column
provides:
  - Orchestrator wired with JSON-LD fast path before Gemini (short-circuit when events found)
  - Multi-page fetch via source.max_pages passed to fetchAndPreprocess
  - HTTP_THROTTLE_MS applied between venue_website sources (default 1000ms)
  - AI throttle only fires when Gemini is actually called (not on JSON-LD path)
affects: [scraper-production-run, 15-scrape-quality-metrics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - JSON-LD fast-path short-circuits Gemini — extractJsonLdEvents called first, extractEvents only when result is empty
    - AI throttle scoped to Gemini branch only — not applied on JSON-LD path
    - HTTP throttle (HTTP_THROTTLE_MS) applied per venue_website source after upsert loop

key-files:
  created: []
  modified:
    - src/lib/scraper/orchestrator.ts

key-decisions:
  - "AI throttle (SCRAPE_THROTTLE_MS) moved inside the Gemini else-branch — no delay incurred on JSON-LD fast path"
  - "HTTP_THROTTLE_MS (default 1000ms) applied between ALL venue_website sources regardless of which path was taken"
  - "source.max_pages ?? 1 used as fallback in case DB column is null — defensive despite notNull() schema constraint"

patterns-established:
  - "JSON-LD short-circuit: if (jsonLdEvents.length > 0) { skip Gemini } else { call extractEvents + AI throttle }"
  - "Dual throttle pattern: HTTP_THROTTLE_MS after each venue_website source; AI_THROTTLE_MS only after Gemini calls"

requirements-completed: [SCRP-01, SCRP-02, PLAT-04]

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 14 Plan 02: Fetch Pipeline Summary

**Orchestrator wired with JSON-LD fast path (skips Gemini when schema.org events found), multi-page fetch via source.max_pages, and dual-throttle (HTTP between sources, AI only after Gemini)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T06:36:37Z
- **Completed:** 2026-03-15T06:38:14Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Orchestrator now imports and calls `extractJsonLdEvents(rawHtml)` before any Gemini call — if JSON-LD events are found, `extractEvents` is never called (true short-circuit)
- `fetchAndPreprocess` called with `{ maxPages: source.max_pages ?? 1 }` so per-source pagination is respected
- `HTTP_THROTTLE_MS` (default 1000ms via env var) applied between all venue_website sources as a courtesy inter-source delay
- `AI_THROTTLE_MS` scoped inside the Gemini branch only — JSON-LD path incurs zero AI throttle delay
- All 186 tests pass, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire orchestrator with JSON-LD fast path, multi-page, and HTTP throttle** - `652b380` (feat)

**Plan metadata:** (docs: pending)

## Files Created/Modified
- `src/lib/scraper/orchestrator.ts` - Added extractJsonLdEvents import, ExtractedEvent type import, HTTP_THROTTLE_MS constant, multi-page fetchAndPreprocess call, JSON-LD short-circuit if/else, dual throttle placement

## Decisions Made
- AI throttle moved inside the Gemini else-branch — no rate-limit delay needed when JSON-LD handles extraction since no AI API call was made
- HTTP throttle placed after the upsert loop (applies regardless of which path — JSON-LD or Gemini — was taken), ensuring courtesy spacing between venue_website HTTP fetches

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. `HTTP_THROTTLE_MS` env var is optional (defaults to 1000ms).

## Next Phase Readiness
- Full fetch pipeline is now wired end-to-end: retry + rate limiting + multi-page + JSON-LD fast path + HTTP throttle
- Phase 14 complete — orchestrator ready for production scrape run
- Phase 15 (Scrape Quality Metrics) can proceed

---
*Phase: 14-fetch-pipeline*
*Completed: 2026-03-15*
