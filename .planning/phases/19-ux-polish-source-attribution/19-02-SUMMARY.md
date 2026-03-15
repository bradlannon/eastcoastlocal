---
phase: 19-ux-polish-source-attribution
plan: "02"
subsystem: scraper-pipeline
tags: [schema, drizzle, event-attribution, normalizer, source-tracking]
dependency_graph:
  requires: []
  provides: [event_sources-table, source-type-enum, upsertEvent-source-tracking, COALESCE-source-url]
  affects: [normalizer, ticketmaster, orchestrator, bandsintown, eventbrite]
tech_stack:
  added: [sourceTypeEnum pgEnum, event_sources pgTable, Drizzle migration 0006]
  patterns: [COALESCE in onConflictDoUpdate, join-table-upsert-after-event-insert, backward-compatible-optional-params]
key_files:
  created:
    - drizzle/0006_skinny_sentry.sql
  modified:
    - src/lib/db/schema.ts
    - src/lib/scraper/normalizer.ts
    - src/lib/scraper/normalizer.test.ts
    - src/lib/scraper/ticketmaster.ts
    - src/lib/scraper/ticketmaster.test.ts
    - src/lib/scraper/orchestrator.ts
    - src/lib/scraper/bandsintown.ts
    - src/lib/scraper/bandsintown.test.ts
    - src/lib/scraper/eventbrite.ts
    - src/lib/scraper/eventbrite.test.ts
decisions:
  - "Used uniqueIndex on (event_id, source_type) not (event_id, scrape_source_id) to avoid PostgreSQL NULL != NULL uniqueness gap for TM events"
  - "Drizzle migration journal was out of sync with DB — manually inserted 0005 into drizzle.__drizzle_migrations and applied 0006 SQL directly due to drizzle-kit migrate missing the event_sources table in its run"
  - "COALESCE applied universally in conflict update — once source_url is set by any source it is never overwritten, simplest and safe"
metrics:
  duration_seconds: 569
  completed_date: "2026-03-15"
  tasks_completed: 2
  files_modified: 10
  files_created: 1
---

# Phase 19 Plan 02: Event Sources Schema and Source Attribution Summary

event_sources join table with source_type enum + COALESCE non-destructive source_url, wired into all four scraper callers

## What Was Built

### Task 1: Add event_sources schema, extend upsertEvent

- Added `SOURCE_TYPES` const, `sourceTypeEnum` pgEnum, and `event_sources` pgTable to `schema.ts`
- Unique index on `(event_id, source_type)` instead of `(event_id, scrape_source_id)` — prevents duplicate rows for TM events since PostgreSQL NULL != NULL in unique indexes
- Extended `upsertEvent` signature with two optional params: `scrapeSourceId: number | null = null` and `sourceType: 'scrape' | 'ticketmaster' | 'manual' = 'scrape'` — backward-compatible defaults
- Added `.returning({ id: events.id })` to events insert to get event_id for join table row
- Changed `source_url: sourceUrl` in `onConflictDoUpdate` to `sql\`COALESCE(${events.source_url}, ${sourceUrl})\`` — ATTR-02 fulfilled
- Inserts/upserts `event_sources` row on every `upsertEvent` call using `onConflictDoUpdate` on `(event_id, source_type)`
- Generated Drizzle migration `0006_skinny_sentry.sql` and applied it to create the table
- Updated `normalizer.test.ts` mock chain to handle `.returning()` and added 5 new tests covering event_sources behavior

### Task 2: Wire source tracking into all upsertEvent callers

- `ticketmaster.ts`: `upsertEvent(venueId, extracted, event.url, null, 'ticketmaster')`
- `orchestrator.ts`: `upsertEvent(source.venue_id, event, source.url, source.id, 'scrape')`
- `bandsintown.ts`: added `source.id, 'scrape'` args
- `eventbrite.ts`: added `source.id, 'scrape'` args
- Updated test assertions in ticketmaster, bandsintown, and eventbrite test files to include new args

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Drizzle migration journal out of sync with database**
- **Found during:** Task 1, running `npm run db:migrate`
- **Issue:** `venue_merge_candidates` and `venue_merge_log` tables were already in the DB (created during Phase 18 work) but not tracked in `drizzle.__drizzle_migrations`. Drizzle-kit tried to re-apply migration 0005 and failed with "relation already exists".
- **Fix:** Manually inserted migration hash for 0005 into `drizzle.__drizzle_migrations` to mark it as applied, then directly executed the 0006 SQL (CREATE TYPE, CREATE TABLE, FKs, indexes) since drizzle-kit's `migrate` command was silently treating 0006 as already applied
- **Files modified:** None (DB-only fix)
- **Impact:** event_sources table successfully created; all subsequent migration runs will work correctly

**2. [Rule 1 - Bug] bandsintown.test.ts and eventbrite.test.ts needed test updates**
- **Found during:** Task 2 full test suite run
- **Issue:** Existing tests in bandsintown.test.ts and eventbrite.test.ts had exact-arg `toHaveBeenCalledWith` assertions with 3 args; Jest's `toHaveBeenCalledWith` requires exact arg count matching
- **Fix:** Added `source.id, 'scrape'` to all relevant assertions in both test files
- **Files modified:** `src/lib/scraper/bandsintown.test.ts`, `src/lib/scraper/eventbrite.test.ts`
- **Commit:** 60688b7

## Decisions Made

1. **uniqueIndex column choice**: Used `(event_id, source_type)` — one attribution record per event per source type. Research confirmed PostgreSQL NULL != NULL in unique indexes would allow TM event duplicates with `(event_id, scrape_source_id)`.

2. **COALESCE semantics**: Applied universally — once any source sets source_url, no subsequent conflict update overwrites it. Simplest implementation, consistent with user decision "non-destructive, never overwrites."

3. **No backfill**: Per research recommendation and plan note — event_sources starts tracking from the next scrape run after deployment. Forward-tracking is sufficient for ATTR-01 scope.

4. **Migration sync approach**: When drizzle-kit migration tracking diverged from DB state, manually synced the `drizzle.__drizzle_migrations` table and applied 0006 SQL directly rather than attempting to alter existing migration files.

## Verification Results

- TypeScript: `npx tsc --noEmit` — clean, no errors
- Full test suite: 269/269 tests passing across 20 test suites
- event_sources table confirmed in DB with correct columns, FKs, and indexes
- COALESCE confirmed in normalizer.ts `onConflictDoUpdate` set clause

## Self-Check: PASSED

All key files confirmed:
- FOUND: src/lib/db/schema.ts (contains event_sources)
- FOUND: src/lib/scraper/normalizer.ts (contains COALESCE)
- FOUND: drizzle/0006_skinny_sentry.sql
- FOUND: src/lib/scraper/normalizer.test.ts
- FOUND: commit 9c49708 (Task 1)
- FOUND: commit 60688b7 (Task 2)
