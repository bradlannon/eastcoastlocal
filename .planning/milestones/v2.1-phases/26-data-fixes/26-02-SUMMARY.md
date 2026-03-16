---
phase: 26-data-fixes
plan: 02
subsystem: api, ui
tags: [drizzle, nextjs, react, postgres, events]

# Dependency graph
requires:
  - phase: 26-data-fixes
    provides: event_sources table with source_type enum (scrape/ticketmaster/manual)
provides:
  - Events API enriched with source_types array per event via supplementary query
  - EventCard attribution badge driven by source_type enum, not URL pattern matching
  - EventWithVenue type extended with optional source_types field
affects: [frontend-event-display, event-api-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns: [supplementary-query-pattern for aggregating related rows without JOIN row duplication]

key-files:
  created: []
  modified:
    - src/app/api/events/route.ts
    - src/components/events/EventCard.tsx
    - src/types/index.ts

key-decisions:
  - "Used supplementary query (2 separate queries + map merge) instead of LEFT JOIN to avoid row duplication from Drizzle's select-all pattern"
  - "Removed anchor link from Ticketmaster attribution badge — badge visibility decoupled from source_url availability"
  - "source_types field is optional on EventWithVenue for backward compatibility with any code not going through the enriched API path"

patterns-established:
  - "Supplementary query pattern: fetch main rows, collect IDs, fetch related rows with inArray, merge via Map — avoids JOIN row duplication"

requirements-completed: [DATA-02]

# Metrics
duration: 10min
completed: 2026-03-16
---

# Phase 26 Plan 02: EventCard Attribution Fix Summary

**EventCard Ticketmaster badge now driven by event_sources.source_type enum via supplementary API query, eliminating brittle source_url string matching**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-16T18:00:00Z
- **Completed:** 2026-03-16T18:10:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Events API now fetches source_types per event using a supplementary query + Map merge pattern
- EventWithVenue type extended with `source_types?: string[]` for backward compatibility
- EventCard attribution badge shows "via Ticketmaster" based on `source_types.includes('ticketmaster')` instead of `source_url?.includes('ticketmaster.com')`
- Attribution badge simplified to plain text span (no longer an anchor linked to source_url)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add event_sources join to events API and update types** - `fb249a5` (feat)
2. **Task 2: Update EventCard to use source_types for attribution** - `7bed7a3` (feat)

## Files Created/Modified
- `src/app/api/events/route.ts` - Added inArray import, event_sources import, supplementary source_types query, sourceMap aggregation, enriched response
- `src/types/index.ts` - Added `source_types?: string[]` to EventWithVenue type
- `src/components/events/EventCard.tsx` - Replaced source_url URL pattern match with source_types enum check; attribution now plain text badge

## Decisions Made
- Used supplementary query (2 DB round-trips) rather than LEFT JOIN because Drizzle's `.select()` would duplicate event rows when joined with multiple source rows — the Map merge pattern is cleaner and avoids that issue
- Removed the anchor link from the Ticketmaster badge since the badge is no longer coupled to source_url. The source_url field still exists on events for other purposes but does not drive UI display.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in test files (`google_place_id` missing from venue fixtures) were present before this change and are unrelated to this plan. No new errors introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DATA-02 requirement satisfied: attribution is now driven by the structured source_type enum
- The supplementary query pattern is reusable for other cases where related rows need to be merged without JOIN duplication
- DATA-03 (phone column never populated) remains open for another plan

---
*Phase: 26-data-fixes*
*Completed: 2026-03-16*
