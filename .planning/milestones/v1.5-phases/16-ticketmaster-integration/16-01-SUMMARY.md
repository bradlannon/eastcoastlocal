---
phase: 16-ticketmaster-integration
plan: "01"
subsystem: scraper
tags: [ticketmaster, api-integration, venue-find-or-create, category-mapping, tdd]
dependency_graph:
  requires:
    - src/lib/scraper/normalizer.ts (upsertEvent)
    - src/lib/db/schema.ts (venues, scrape_sources tables)
    - src/lib/db/client.ts (db)
    - src/lib/schemas/extracted-event.ts (ExtractedEvent type)
  provides:
    - scrapeTicketmaster (TM Discovery API handler)
    - findOrCreateVenue (ILIKE venue matching + insert)
    - mapTmClassification (TM segment/genre → 8-category enum)
    - seed-ticketmaster.ts (4 placeholder venues + 4 scrape_sources rows)
  affects:
    - src/lib/scraper/orchestrator.ts (will add ticketmaster dispatch in next plan)
tech_stack:
  added: []
  patterns:
    - TDD (RED → GREEN): test file written before implementation
    - Synthetic URL pattern (ticketmaster:province:NB) for config encoding
    - ILIKE venue find-or-create (drizzle-orm ilike + eq + and)
    - onConflictDoNothing for idempotent seed script
key_files:
  created:
    - src/lib/scraper/ticketmaster.ts
    - src/lib/scraper/ticketmaster.test.ts
    - scripts/seed-ticketmaster.ts
  modified: []
decisions:
  - "mapTmClassification exports as named export for direct unit testability (not just through scrapeTicketmaster)"
  - "findOrCreateVenue exports as named export for direct unit testability"
  - "Seed script uses Promise.all for parallel venue inserts, then queries back IDs to handle onConflictDoNothing case"
  - "Seed sources array uses plain type (not as const) to satisfy drizzle-orm mutable array requirement"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-15"
  tasks_completed: 2
  files_created: 3
  files_modified: 0
  tests_added: 28
  tests_total: 224
---

# Phase 16 Plan 01: Ticketmaster Integration — Core Handler Summary

**One-liner:** TM Discovery API handler with ILIKE venue find-or-create, segment/genre category mapping, and idempotent province seed script (4 Atlantic Canada provinces).

## What Was Built

### Task 1: TM Handler + Unit Tests (TDD)

**`src/lib/scraper/ticketmaster.ts`** — Full Ticketmaster Discovery API handler following the established eventbrite.ts pattern:

- `scrapeTicketmaster(source)` — Parses stateCode from synthetic URL, builds date-windowed API request (today → today+30d, size=200), iterates events, calls findOrCreateVenue per event, then upsertEvent with event.url as both `ticket_link` and `sourceUrl` (PLAT-03 attribution).
- `findOrCreateVenue(name, city, province, address)` — Queries venues with `ilike(venues.name, name)` + `eq(venues.city, city)`. Returns existing id or inserts new venue row (lat/lng null, geocoded on first scrape run).
- `mapTmClassification(classifications)` — Maps TM segment/genre to 8-category enum: Music→live_music, Sports→sports, Arts & Theatre + comedy→comedy, + theatre→theatre, otherwise→arts; Film→arts; Family→community; Miscellaneous→community; unknown→other.

**`src/lib/scraper/ticketmaster.test.ts`** — 28 unit tests covering all specified behaviors:
- API params validation (countryCode=CA, stateCode, size=200, date window, apikey)
- Error handling (throws on non-OK with status+stateCode in message)
- Event mapping (performer from attraction vs event.name fallback, time from dateTime slice, timeTBA=null, price formatting, 16:9 image selection, null graceful handling)
- Attribution: event.url as both ticket_link AND 3rd arg sourceUrl (PLAT-03)
- Event skipping: no embedded venue
- findOrCreateVenue: match existing (returns id, no insert), create new (inserts with correct fields)
- mapTmClassification: all 8 category paths + empty array → other

### Task 2: Seed Script

**`scripts/seed-ticketmaster.ts`** — Idempotent one-time seed script:
- Creates 4 placeholder venues: Ticketmaster NB/NS/PE/NL (address/city='Various' — obviously identifiable as placeholders)
- Creates 4 scrape_sources rows with synthetic URL pattern (`ticketmaster:province:NB`, etc.), source_type='ticketmaster', enabled=true, scrape_frequency='daily'
- Uses `onConflictDoNothing()` on both inserts — safe to re-run
- Guards with `if (require.main === module)` pattern for importability
- Run with: `npx tsx scripts/seed-ticketmaster.ts` (requires DATABASE_URL)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 057e556 | feat(16-01): TM handler with venue find-or-create, category mapping, and unit tests |
| 2 | 0a28a8c | feat(16-01): seed script for TM placeholder venues and scrape_sources rows |

## Verification Results

- `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage` — 28/28 tests pass
- `npx jest --no-coverage` — 224/224 tests pass (0 regressions)
- `npx tsc --noEmit` — 0 type errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed `as const` from seed sources array**
- **Found during:** Task 2 type check
- **Issue:** `as const` made the array `readonly`, which drizzle-orm's `.values()` overload requires a mutable type — TS error TS2769
- **Fix:** Removed `as const` annotation; type inference still correct without it
- **Files modified:** scripts/seed-ticketmaster.ts
- **Commit:** 0a28a8c (fix included in same commit)

## Self-Check: PASSED

- src/lib/scraper/ticketmaster.ts — FOUND
- src/lib/scraper/ticketmaster.test.ts — FOUND
- scripts/seed-ticketmaster.ts — FOUND
- Commit 057e556 — FOUND
- Commit 0a28a8c — FOUND
