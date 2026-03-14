---
phase: 02-data-pipeline
plan: 02
subsystem: api
tags: [eventbrite, bandsintown, scraping, atlantic-canada, fetch, jest, tdd]

# Dependency graph
requires:
  - phase: 02-data-pipeline/02-01
    provides: upsertEvent and ExtractedEvent interface from normalizer.ts and extracted-event.ts
provides:
  - Eventbrite API client (scrapeEventbrite) fetching org-scoped events with Bearer auth
  - Bandsintown API client (scrapeBandsintown) fetching artist events filtered to Atlantic Canada
  - Both clients produce ExtractedEvent-compatible output with confidence=1.0 and call upsertEvent
affects: [02-data-pipeline, scraper-orchestrator, cron-job, ingestion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "API source URL scheme: eventbrite:org:{id} and bandsintown:artist:{name}"
    - "Atlantic Canada region filter via Set lookup (full names + short codes NB/NS/PE/NL)"
    - "TDD: RED commit (stubs + failing tests) then GREEN commit (implementation)"
    - "confidence=1.0 for structured API data — no LLM extraction needed"

key-files:
  created:
    - src/lib/scraper/eventbrite.ts
    - src/lib/scraper/bandsintown.ts
    - src/lib/scraper/eventbrite.test.ts
    - src/lib/scraper/bandsintown.test.ts
    - src/lib/scraper/normalizer.ts (stub — Plan 01 will overwrite with full implementation)
  modified: []

key-decisions:
  - "API source URLs use colon-separated scheme (eventbrite:org:ID, bandsintown:artist:NAME) stored in scrape_sources.url"
  - "Atlantic Canada filter uses Set with both full province names and short codes for robustness"
  - "normalizer.ts created as stub to unblock parallel Plan 02 — Plan 01 overwrites with full implementation"

patterns-established:
  - "Scraper function signature: (source: ScrapeSource) => Promise<void>"
  - "Past event check: new Date(event.datetime) < now before calling upsertEvent"
  - "confidence=1.0 for structured API sources (no LLM ambiguity)"

requirements-completed: [SCRP-10]

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 2 Plan 02: Eventbrite and Bandsintown API Clients Summary

**Eventbrite org-scoped and Bandsintown artist event API clients with Atlantic Canada filtering, both feeding upsertEvent pipeline with confidence=1.0**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-14T02:30:02Z
- **Completed:** 2026-03-14T02:33:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 6

## Accomplishments
- Eventbrite client fetches org-scoped events via `/v3/organizations/{id}/events/` with Bearer token, skips past events, maps to ExtractedEvent
- Bandsintown client fetches artist events, filters to Atlantic Canada using full province names and short codes (NB/NS/PE/NL), skips past events
- Both clients set confidence=1.0 (structured API data, no LLM extraction) and feed through upsertEvent
- 11 unit tests covering field mapping, past event skipping, Atlantic Canada filtering, HTTP error handling, and auth headers

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for Eventbrite and Bandsintown clients** - `d10db47` (test)
2. **Task 1 (GREEN): Implement Eventbrite and Bandsintown API clients** - `e94c5e9` (feat)

_Note: TDD task has two commits (test → feat)_

## Files Created/Modified
- `src/lib/scraper/eventbrite.ts` - Eventbrite API client, exports scrapeEventbrite(source)
- `src/lib/scraper/bandsintown.ts` - Bandsintown API client, exports scrapeBandsintown(source)
- `src/lib/scraper/eventbrite.test.ts` - 5 tests: fetch URL/auth, field mapping, past event skip, HTTP errors, null handling
- `src/lib/scraper/bandsintown.test.ts` - 6 tests: fetch URL/app_id, Atlantic Canada filter, past event skip, field mapping, offer fallback, HTTP errors
- `src/lib/scraper/normalizer.ts` - Stub placeholder (Plan 01 creates the real implementation in parallel)
- `src/lib/schemas/extracted-event.ts` - Already existed from prior Plan 01 execution (ab41a3a)

## Decisions Made
- API source URL scheme uses colon-separated format (`eventbrite:org:12345678`, `bandsintown:artist:The+Trews`) — these are stored in `scrape_sources.url` and parsed at runtime
- Atlantic Canada Set includes both full names ("New Brunswick") and 2-letter codes ("NB") to handle inconsistent Bandsintown region field values
- normalizer.ts stub created so this plan compiles independently while Plan 01 runs in parallel; Plan 01 will replace it with the real implementation

## Deviations from Plan

None - plan executed exactly as written. normalizer.ts stub was anticipated by the plan's interface contract section.

## Issues Encountered
- Plan's verification command used `--testPathPattern` (deprecated in Jest 30) — used `--testPathPatterns` (plural) instead. Not a code issue; tests ran fine.

## User Setup Required
This plan requires external API credentials before production use:

- **EVENTBRITE_TOKEN**: Eventbrite account → Settings → Developer Links → API Keys (https://www.eventbrite.com/platform/api-keys)
- **BANDSINTOWN_APP_ID**: Apply at https://help.artists.bandsintown.com — requires written consent, not self-serve

Add both to `.env.local` (dev) and Vercel environment variables (prod).

## Next Phase Readiness
- Eventbrite and Bandsintown clients are complete and tested
- Both integrate with the upsertEvent pipeline (Plan 01 provides the real normalizer)
- Scraper orchestrator can call either client based on `scrape_sources.source_type`
- Atlantic Canada venues without their own websites can now be covered via Eventbrite org IDs or Bandsintown artist names

---
*Phase: 02-data-pipeline*
*Completed: 2026-03-13*
