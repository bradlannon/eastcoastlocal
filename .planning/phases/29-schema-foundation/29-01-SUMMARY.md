---
phase: 29-schema-foundation
plan: 01
subsystem: database
tags: [drizzle, postgres, schema, migrations, zod, typescript]

# Dependency graph
requires: []
provides:
  - recurring_series table with (venue_id, normalized_performer) unique index
  - events.archived_at nullable TIMESTAMPTZ column
  - events.series_id nullable integer FK to recurring_series.id
  - RecurringSeries and NewRecurringSeries TypeScript types via InferSelectModel
  - ExtractedEventSchema with optional recurrence_pattern string field
  - Drizzle migration 0011_clumsy_stingray.sql applied to Neon Postgres
affects: [30-archival, 31-series-detection, 32-series-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Nullable FK columns use arrow callback pattern (.references(() => table.id)) to avoid forward-reference issues
    - New DB tables inserted before their FK dependents in schema.ts (recurring_series before events)
    - TIMESTAMPTZ columns declared with { withTimezone: true } option on Drizzle timestamp()
    - Optional Zod fields use .optional() (not .nullable()) for fields that may be absent from AI output

key-files:
  created:
    - drizzle/0011_clumsy_stingray.sql
    - drizzle/meta/0011_snapshot.json
  modified:
    - src/lib/db/schema.ts
    - src/lib/db/schema.test.ts
    - src/lib/schemas/extracted-event.ts
    - src/lib/schemas/extracted-event.test.ts
    - src/types/index.ts

key-decisions:
  - "archived_at uses TIMESTAMPTZ (timestamp with time zone) per ARCH-01 — avoids explicit Atlantic offset in application code"
  - "series_id FK is nullable with no cascade — orphaned events (series deleted) retain data"
  - "recurring_series placed before events in schema.ts to resolve forward-reference in events.series_id FK"
  - "recurrence_pattern uses .optional() not .nullable() — field absent from AI output is valid, undefined is the expected default"

patterns-established:
  - "Pattern 1: New nullable FK columns on events use arrow callback reference pattern"
  - "Pattern 2: Tables that are FK targets of events must be defined earlier in schema.ts"

requirements-completed: [ARCH-01, SER-01]

# Metrics
duration: 4min
completed: 2026-03-16
---

# Phase 29 Plan 01: Schema Foundation Summary

**recurring_series table with unique (venue_id, normalized_performer) index, events.archived_at (TIMESTAMPTZ nullable) and series_id (FK nullable) columns, ExtractedEventSchema recurrence_pattern optional field, and Drizzle migration 0011 applied to Neon Postgres**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-16T20:31:28Z
- **Completed:** 2026-03-16T20:35:41Z
- **Tasks:** 2
- **Files modified:** 7 (including migration files)

## Accomplishments
- Added recurring_series table with venue_id FK and unique composite index on (venue_id, normalized_performer)
- Added events.archived_at as nullable TIMESTAMPTZ — zero impact on existing rows, ARCH-01 compliant
- Added events.series_id as nullable integer FK to recurring_series.id — zero impact on existing rows
- Extended ExtractedEventSchema with optional recurrence_pattern string for AI extraction hints
- Exported RecurringSeries and NewRecurringSeries types — Event type gained archived_at and series_id automatically via InferSelectModel
- Generated and applied migration 0011_clumsy_stingray.sql to Neon Postgres successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for schema additions and Zod extension** - `10a114e` (test)
2. **Task 2: Implement schema changes, generate migration, extend Zod schema, export types** - `ec1e202` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks have two commits (test → feat)_

## Files Created/Modified
- `src/lib/db/schema.ts` - recurring_series table definition; archived_at and series_id on events table
- `src/lib/db/schema.test.ts` - Tests for new columns and recurring_series table
- `src/lib/schemas/extracted-event.ts` - recurrence_pattern optional field added to inner schema
- `src/lib/schemas/extracted-event.test.ts` - Tests for recurrence_pattern present and absent
- `src/types/index.ts` - RecurringSeries and NewRecurringSeries type exports
- `drizzle/0011_clumsy_stingray.sql` - Migration adding recurring_series table and two events columns
- `drizzle/meta/0011_snapshot.json` - Updated Drizzle schema snapshot

## Decisions Made
- `archived_at` uses `{ withTimezone: true }` to produce TIMESTAMPTZ — avoids explicit Atlantic offset in application code when comparing against current time
- `series_id` FK has no cascade — if a recurring_series row is deleted, events retain their series_id value (safe for archival-first build order)
- `recurring_series` table placed before `events` in schema.ts to resolve Drizzle forward-reference issue in series_id FK callback
- `recurrence_pattern` uses `.optional()` (not `.nullable()`) — Gemini output will simply omit the field when not applicable, undefined is the correct absent-field value

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- 4 pre-existing test failures in API route and orchestrator tests (unrelated to this plan's changes — confirmed by stashing changes and running tests against original code). Logged to deferred-items per deviation scope rules.

## User Setup Required
None - no external service configuration required. Migration was applied automatically via `npm run db:migrate`.

## Next Phase Readiness
- Schema foundation complete — recurring_series table, archived_at, and series_id columns are live in Neon Postgres
- Phase 30 (Archival) can proceed: events table has archived_at TIMESTAMPTZ ready for the archival cron to set
- Phase 31 (Series Detection) can proceed: recurring_series table and series_id FK are ready for the detection logic
- Blocker from STATE.md partially resolved: event_date is stored as plain TIMESTAMP (not TIMESTAMPTZ) — archival cron in Phase 30 should apply explicit Atlantic offset when comparing dates

---
*Phase: 29-schema-foundation*
*Completed: 2026-03-16*
