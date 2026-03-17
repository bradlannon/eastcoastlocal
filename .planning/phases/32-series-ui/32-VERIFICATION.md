---
phase: 32-series-ui
verified: 2026-03-16T00:00:00Z
status: passed
score: 4/4 must-haves verified
gaps: []
human_verification:
  - test: "Recurring badge renders in the browser for an event with a non-null series_id"
    expected: "A teal 'Recurring' badge appears in the date row alongside the category badge"
    why_human: "Visual rendering cannot be confirmed by grep — requires a browser or screenshot"
  - test: "Event list with multiple occurrences of the same series shows exactly one card with '+N more upcoming'"
    expected: "Only the earliest occurrence card is visible; it carries the '+N more upcoming' label"
    why_human: "Collapse behavior depends on real DB data with populated series_id values; needs live data or seeded fixture in the browser"
---

# Phase 32: Series UI Verification Report

**Phase Goal:** Users see a visual trust signal on recurring events and the event list collapses weekly series so the same performer does not occupy multiple rows
**Verified:** 2026-03-16
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | EventCard displays a teal "Recurring" badge when event has a non-null series_id | VERIFIED | `EventCard.tsx` line 85-89: conditional renders `<span className="...bg-teal-50 text-teal-700...">Recurring</span>` when `ev.series_id !== null && ev.series_id !== undefined` |
| 2 | Event list shows only the next upcoming occurrence for each series, not every future date | VERIFIED | `EventList.tsx` line 25: `const collapsed = collapseSeriesEvents(sorted);` — `collapseSeriesEvents` emits only the first-seen representative per series_id |
| 3 | Collapsed series card shows "+N more upcoming" count when series has multiple occurrences | VERIFIED | `EventCard.tsx` lines 102-106: renders `+{occurrenceCount - 1} more upcoming` when `occurrenceCount !== undefined && occurrenceCount > 1`; `occurrenceCount` is threaded from `EventList.tsx` line 43 |
| 4 | Non-series events render exactly as before (no visual or behavioral change) | VERIFIED | `collapseSeriesEvents` passes `series_id == null` events through with `occurrenceCount: 1`; `EventCard` badge condition guards on `series_id !== null`; `occurrenceCount > 1` guard prevents any new display for non-series cards |

**Score:** 4/4 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/series-utils.ts` | `collapseSeriesEvents` pure function + `CollapsedEvent` interface | VERIFIED | 55 lines; exports both `collapseSeriesEvents` and `CollapsedEvent`; two-pass algorithm; pure function (no side effects, no DB calls) |
| `src/lib/series-utils.test.ts` | 6-case unit test suite | VERIFIED | 135 lines; 6 `it()` blocks covering: empty array, non-series pass-through, single series collapse, multiple independent series, mixed order, lone series event; all 6 pass |
| `src/components/events/EventCard.tsx` | Recurring badge + occurrenceCount display | VERIFIED | 121 lines; `occurrenceCount?: number` prop added to interface; teal badge at lines 84-89; "+N more upcoming" at lines 101-106 |
| `src/components/events/EventList.tsx` | Series collapsing before render | VERIFIED | 53 lines; `collapseSeriesEvents` imported and applied at line 25; `collapsed.map` at line 39 passes `occurrenceCount` to each `EventCard` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/series-utils.ts` | `src/components/events/EventList.tsx` | `import collapseSeriesEvents` | WIRED | `EventList.tsx` line 3: `import { collapseSeriesEvents } from '@/lib/series-utils';`; called at line 25 |
| `src/components/events/EventList.tsx` | `src/components/events/EventCard.tsx` | `occurrenceCount` prop | WIRED | `EventList.tsx` line 43: `occurrenceCount={occurrenceCount}` passed to `EventCard`; consumed in `EventCard.tsx` lines 10, 15, 102 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| UI-01 | 32-01-PLAN.md | EventCard shows "Recurring" badge when event belongs to a series | SATISFIED | `EventCard.tsx` lines 84-89: teal badge conditioned on `ev.series_id !== null && ev.series_id !== undefined` |
| UI-02 | 32-01-PLAN.md | Event list collapses recurring series to next occurrence with occurrence count | SATISFIED | `EventList.tsx` line 25 applies `collapseSeriesEvents`; `occurrenceCount` threaded through to `EventCard` |

No orphaned requirements — both UI-01 and UI-02 are claimed in `32-01-PLAN.md` and verified as implemented.

---

## Anti-Patterns Found

No anti-patterns detected in Phase 32 files.

Scan of `series-utils.ts`, `EventCard.tsx`, `EventList.tsx`:
- No TODO/FIXME/HACK/PLACEHOLDER comments
- No empty return stubs (`return null`, `return {}`, `return []`)
- No placeholder-only handlers

---

## Test Suite Status

**Phase 32 tests:** 6/6 pass (`src/lib/series-utils.test.ts`)

**Full suite:** 407/410 pass — 3 failures are pre-existing and unrelated to Phase 32:
- `src/app/api/cron/discover/route.test.ts` — pre-existing mock mismatch
- `src/app/api/cron/discover-reddit/route.test.ts` — pre-existing mock mismatch
- `src/lib/scraper/discovery-orchestrator.test.ts` — pre-existing return-value assertion mismatch

SUMMARY confirms: "3 pre-existing test failures ... confirmed pre-existing by running tests against stashed changes."

**TypeScript:** `npx tsc --noEmit` reports 4 errors in pre-existing test files (`events/route.test.ts`, `filter-utils.test.ts`, `timelapse-utils.test.ts`) caused by mock objects missing `archived_at` and `series_id` fields added in Phase 29/31. None of these files were modified by Phase 32 commits (`dfb9c35`, `550a286`, `6da6aac`).

---

## Task Commits Verified

| Commit | Message | Status |
|--------|---------|--------|
| `dfb9c35` | test(32-01): add failing tests for collapseSeriesEvents | EXISTS |
| `550a286` | feat(32-01): implement collapseSeriesEvents utility | EXISTS |
| `6da6aac` | feat(32-01): wire Recurring badge and series collapse into EventCard and EventList | EXISTS |

---

## Human Verification Required

### 1. Recurring Badge Visual Rendering

**Test:** Load the app with at least one event that has a non-null `series_id` in the database. View the event sidebar.
**Expected:** A teal "Recurring" badge appears in the date row alongside the category badge.
**Why human:** Visual rendering and color accuracy cannot be confirmed by grep — requires a browser or screenshot.

### 2. Series Collapsing in Live UI

**Test:** Ensure multiple events share the same `series_id` in the database. Open the app and view the event list sidebar.
**Expected:** Only one card is shown for the series (the earliest upcoming date), and it carries "+N more upcoming" below the Ticketmaster attribution block.
**Why human:** Collapse behavior depends on live or seeded DB data with populated `series_id` values; cannot be verified statically.

---

## Gaps Summary

No gaps. All automated checks pass:

- All 4 artifacts exist and are substantive (not stubs)
- Both key links (series-utils → EventList, EventList → EventCard via occurrenceCount) are wired
- Both requirement IDs (UI-01, UI-02) are implemented and mapped
- 6/6 series-utils tests pass; full suite regressions are pre-existing
- No anti-patterns in Phase 32 files

Two items flagged for human verification (visual badge rendering and live collapse behavior) are polish confirmation, not blockers — the implementation code is complete and correct.

---

_Verified: 2026-03-16_
_Verifier: Claude (gsd-verifier)_
