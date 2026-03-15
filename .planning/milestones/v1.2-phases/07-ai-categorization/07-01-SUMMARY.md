---
phase: 07-ai-categorization
plan: 01
subsystem: api
tags: [zod, gemini, ai-sdk, drizzle, extraction, categorization, event-pipeline]

# Dependency graph
requires:
  - phase: 06-category-schema
    provides: EVENT_CATEGORIES const array, event_category column on events table with pgEnum

provides:
  - ExtractedEventSchema with event_category field using z.enum(EVENT_CATEGORIES).default('other')
  - Broadened extractor prompt accepting all event types with Gemini category assignment instructions
  - normalizer.ts writing event_category to both .values() and .onConflictDoUpdate() DB write blocks
  - bandsintown.ts hardcoded event_category: 'live_music'
  - eventbrite.ts hardcoded event_category: 'other'

affects: [08-category-filter-ui, 09-event-discovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "z.enum(EVENT_CATEGORIES).default('other') — import EVENT_CATEGORIES from db/schema for single source of truth"
    - "Gemini category assignment via inline enum list in prompt with category guidance per value"
    - "Third-party scrapers hardcode event_category as const literal matching their platform's event type"

key-files:
  created:
    - src/lib/schemas/extracted-event.test.ts
  modified:
    - src/lib/schemas/extracted-event.ts
    - src/lib/scraper/extractor.ts
    - src/lib/scraper/extractor.test.ts
    - src/lib/scraper/normalizer.ts
    - src/lib/scraper/normalizer.test.ts
    - src/lib/scraper/bandsintown.ts
    - src/lib/scraper/eventbrite.ts

key-decisions:
  - "event_category uses z.enum(EVENT_CATEGORIES).default('other') — NOT .optional() or .nullable() — so Zod default applies even when Gemini omits the field"
  - "Extractor test for Zod default simulates post-SDK output (SDK applies Zod defaults before returning experimental_output)"
  - "Bandsintown hardcoded to 'live_music' (music platform); Eventbrite hardcoded to 'other' (mixed types)"
  - "Filter logic in extractor unchanged — event_category is metadata, not a quality filter"

patterns-established:
  - "TDD: RED commit (failing tests) → GREEN commit (implementation) per task with tdd=true"
  - "Pre-existing test failures documented in deferred-items.md, not fixed (out of scope)"

requirements-completed: [CAT-01]

# Metrics
duration: 4min
completed: 2026-03-14
---

# Phase 7 Plan 01: AI Categorization — Extraction Pipeline Summary

**Gemini extraction pipeline broadened from live-music-only to all event types with z.enum(EVENT_CATEGORIES).default('other') category assignment, wired through normalizer and third-party scrapers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-14T21:29:43Z
- **Completed:** 2026-03-14T21:33:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- ExtractedEventSchema now has `event_category: z.enum(EVENT_CATEGORIES).default('other')` — Zod rejects invalid values at parse time; missing field defaults to 'other'
- Extractor prompt replaced: "live music events only" → all event types with 8-value category guidance for Gemini
- normalizer.ts writes event_category in both `.values()` and `.onConflictDoUpdate()` — re-scrapes can upgrade categories
- bandsintown.ts hardcoded to 'live_music'; eventbrite.ts hardcoded to 'other'

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for event_category enum** - `2000da9` (test)
2. **Task 1 (GREEN): Add event_category to ExtractedEventSchema** - `d0ee692` (feat)
3. **Task 2: Broaden extractor + wire category through pipeline** - `c61c298` (feat)

_Note: Task 1 used TDD — RED commit followed by GREEN commit_

## Files Created/Modified
- `src/lib/schemas/extracted-event.ts` - Added `event_category: z.enum(EVENT_CATEGORIES).default('other')` and `import EVENT_CATEGORIES from db/schema`
- `src/lib/schemas/extracted-event.test.ts` - New: 4 tests covering enum validation, invalid rejection, default behavior, all 8 values
- `src/lib/scraper/extractor.ts` - Prompt broadened: all event types accepted, category assignment instructions, performer field generalized
- `src/lib/scraper/extractor.test.ts` - Extended: event_category in mock objects, 2 new tests for category pass-through and default
- `src/lib/scraper/normalizer.ts` - Added `event_category: extracted.event_category ?? 'other'` to both DB write blocks
- `src/lib/scraper/normalizer.test.ts` - Extended: event_category in ExtractedEvent fixtures, 1 new test for DB write
- `src/lib/scraper/bandsintown.ts` - Added `event_category: 'live_music' as const`
- `src/lib/scraper/eventbrite.ts` - Added `event_category: 'other' as const`

## Decisions Made
- Used `z.enum(EVENT_CATEGORIES).default('other')` rather than optional/nullable — ensures field always has a value even when Gemini omits it (Zod `.default()` fills missing values after AI SDK parsing)
- Extractor test for the "Gemini omits category" case uses the post-SDK simulated output (SDK applies Zod defaults before exposing experimental_output to application code) — schema-level default behavior is covered by the dedicated extracted-event.test.ts
- Bandsintown always 'live_music' (it's a music platform); Eventbrite defaults to 'other' (mixed types, AI categorization will handle future events)
- Did not add event_category to filter logic — it is metadata, not a quality signal

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing failure in `src/lib/db/seed.test.ts` ("The Ship Pub & Kitchen" not found) — confirmed pre-existing by stash-testing at commit d0ee692. Documented in `deferred-items.md`. Not caused by Phase 7 changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CAT-01 complete: all newly scraped events will have AI-assigned event_category values from the 8-value taxonomy
- Phase 7 Plan 02 (if exists) or Phase 8 category filter UI can now query `events.event_category`
- Backfill script (`src/lib/db/backfill-categories.ts`) should be run after deploy to clear null categories on historical events

---
*Phase: 07-ai-categorization*
*Completed: 2026-03-14*
