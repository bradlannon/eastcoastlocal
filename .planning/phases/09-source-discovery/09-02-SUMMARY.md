---
phase: 09-source-discovery
plan: 02
subsystem: database
tags: [drizzle-orm, postgresql, cli, scraper, tdd]

# Dependency graph
requires:
  - phase: 09-source-discovery
    provides: discovered_sources table schema with status, url, domain, source_name, city, province fields
  - phase: 06-schema-update
    provides: venues and scrape_sources table schemas
provides:
  - CLI script to promote a discovered_source from pending to approved
  - Venue row creation from staged data (lat/lng null for geocoding on first scrape)
  - scrape_sources row insertion with source_type=venue_website, enabled=true
  - discovered_sources status update to 'approved' with timestamps
affects: [10-scraping, orchestrator, venue-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD (RED-GREEN) for DB mutation scripts — mock drizzle insert/update chains per operation
    - CLI entry point using require.main === module with process.argv parsing and process.exit()
    - lat/lng omitted on venue creation (null by default) — geocoded on first orchestrator run

key-files:
  created:
    - src/lib/scraper/promote-source.ts
    - src/lib/scraper/promote-source.test.ts
  modified: []

key-decisions:
  - "Venue address constructed as 'city, province, Canada' using staged data — no geocoding at promotion time"
  - "source_name falls back to domain when null — ensures venue always has a non-empty name"
  - "reviewed_at and added_to_sources_at both set to the same Date() — single atomic timestamp"

patterns-established:
  - "Drizzle insert mock pattern: mock insert().values().returning() chain separately for each table insert"
  - "CLI scripts use require.main === module guard so they are importable in tests without side effects"

requirements-completed: [DISC-03]

# Metrics
duration: 10min
completed: 2026-03-15
---

# Phase 09 Plan 02: Promote Source Summary

**CLI promotion script using Drizzle ORM that moves a reviewed discovered_source into the active scrape pipeline by creating a venue row and scrape_sources entry**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-15T00:10:39Z
- **Completed:** 2026-03-15T00:20:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- TDD implementation: 7 failing tests written first, all pass after implementation
- promoteSource(discoveredId) validates status is 'pending' before mutating DB
- Creates venue with name (source_name ?? domain), address (city, province, Canada), lat/lng null
- Inserts scrape_source with source_type='venue_website', enabled=true, scrape_frequency='daily'
- Updates discovered_sources to status='approved' with reviewed_at and added_to_sources_at timestamps
- CLI entry point with process.argv parsing, validation, and clean exit codes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create promotion function with tests** - `c425663` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks — tests written first (RED), then implementation (GREEN), committed together._

## Files Created/Modified

- `src/lib/scraper/promote-source.ts` - Exported promoteSource function + CLI entry point
- `src/lib/scraper/promote-source.test.ts` - 7 unit tests with mocked Drizzle DB chains

## Decisions Made

- Venue address constructed as "city, province, Canada" from staged data — no geocoding at promotion time (geocoding happens on first orchestrator scrape run, consistent with orchestrator pattern)
- source_name falls back to domain when null — ensures venue name is always non-empty
- reviewed_at and added_to_sources_at set to same Date() value — single point-in-time promotion stamp

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures in full suite (seed.test.ts — "The Ship Pub & Kitchen" not found, documented in STATE.md; discovery-orchestrator.test.ts — timeout failures from 09-01 work) were confirmed as pre-existing before this plan's changes by temporarily stashing work and running the suite. Both failure sets are out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Discovery-to-scraping pipeline is now complete: discover candidates (09-01) -> review in DB -> promote to active scraping (09-02)
- To use: `tsx src/lib/scraper/promote-source.ts <discovered_source_id>`
- Phase 10 (scraping) can now pick up newly promoted venues from scrape_sources

---
*Phase: 09-source-discovery*
*Completed: 2026-03-15*
