---
phase: 19-ux-polish-source-attribution
verified: 2026-03-15T00:00:00Z
status: human_needed
score: 9/9 must-haves verified
human_verification:
  - test: "Map-pin icon visibility on event cards"
    expected: "Cards with venue coordinates show a small gray map-pin icon (12px) on the right side of the performer name row; icon turns orange on card hover; cards without coordinates show no icon"
    why_human: "CSS group-hover transitions and conditional rendering require browser inspection to confirm visual behavior"
  - test: "CategoryChipsRow display and live filtering in timelapse mode"
    expected: "Switching to timelapse mode shows category chips row above TimelineBar; event count badge visible on left; clicking a chip filters heatmap and sidebar live without pausing playback; 'All' chip resets filter"
    why_human: "Real-time heatmap filtering behavior and playback non-interruption cannot be verified programmatically"
  - test: "Mobile viewport layout"
    expected: "At 375px width, both the category chip row and TimelineBar are visible and not overflowing the screen"
    why_human: "Responsive layout behavior requires browser/device inspection"
---

# Phase 19: UX Polish and Source Attribution Verification Report

**Phase Goal:** Users can navigate directly from event cards to venue locations on the map, category filters are accessible in timelapse mode, and the system records which source each event was discovered from
**Verified:** 2026-03-15
**Status:** human_needed (all automated checks pass; 3 visual/behavioral items need human testing)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Map-pin icon visible on event cards with venue coordinates | VERIFIED | `EventCard.tsx` line 42-54: SVG icon renders inside `{venue.lat !== null && ... && venue.lng !== null && venue.lng !== undefined && (` guard; 12x12px, `viewBox="0 0 24 24"`, correct path `M12 2C8.13 2...` |
| 2  | Category filter chips visible below TimelineBar in timelapse mode | VERIFIED | `MapClient.tsx` line 124-138: `{mapMode === 'timelapse' && (` block renders `<CategoryChipsRow>` above `<TimelineBar>` in `flex flex-col gap-2` column |
| 3  | Clicking a category chip in timelapse filters without pausing playback | VERIFIED | `CategoryChipsRow.tsx` chip onClick calls only `setCategory(cat)` — no pause/stop callback invoked |
| 4  | Event count badge visible alongside category chips | VERIFIED | `CategoryChipsRow.tsx` line 17-19: renders `<span className="...bg-blue-100 text-blue-700...">` with `{eventCount} event{s}` |
| 5  | Each event upsert creates/updates an event_sources row | VERIFIED | `normalizer.ts` lines 58-70: `db.insert(event_sources).values({...}).onConflictDoUpdate({target:[event_sources.event_id, event_sources.source_type], set:{last_seen_at}})` |
| 6  | Ticketmaster events recorded with source_type='ticketmaster' | VERIFIED | `ticketmaster.ts` line 113: `await upsertEvent(venueId, extracted, event.url, null, 'ticketmaster')` |
| 7  | Scrape events recorded with source_type='scrape' and scrape_source_id | VERIFIED | `orchestrator.ts` line 104: `upsertEvent(source.venue_id, event, source.url, source.id, 'scrape')`; `bandsintown.ts` line 81-83: `source.id, 'scrape'`; `eventbrite.ts` line 61-63: `source.id, 'scrape'` |
| 8  | When existing event has no source_url, incoming link fills it non-destructively | VERIFIED | `normalizer.ts` line 46: `source_url: sql\`COALESCE(${events.source_url}, ${sourceUrl})\`` in `onConflictDoUpdate` set clause |
| 9  | When existing event has a source_url, it is never overwritten | VERIFIED | Same COALESCE: existing non-null value is preserved by definition of COALESCE semantics |

**Score:** 9/9 truths verified

---

## Required Artifacts

### Plan 19-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/events/EventCard.tsx` | Map-pin SVG icon as visual affordance for flyTo | VERIFIED | File exists, 113 lines, contains SVG with `viewBox.*24 24` and correct path data; conditional on `venue.lat !== null && venue.lng !== null` |
| `src/components/events/CategoryChipsRow.tsx` | Standalone category chip row for timelapse overlay | VERIFIED | File exists, 57 lines (> 25 min), exports default `CategoryChipsRow`, contains `useQueryState`, `EVENT_CATEGORIES`, `CATEGORY_META` |
| `src/components/map/MapClient.tsx` | CategoryChipsRow rendered in timelapse overlay | VERIFIED | Line 20: `import CategoryChipsRow from '../events/CategoryChipsRow'`; line 126: `<CategoryChipsRow eventCount={eventCount ?? 0} />` inside timelapse block |

### Plan 19-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema.ts` | event_sources table and sourceTypeEnum | VERIFIED | Lines 117-134: `SOURCE_TYPES`, `sourceTypeEnum`, `event_sources` table with `uniqueIndex('event_sources_dedup').on(table.event_id, table.source_type)` |
| `src/lib/scraper/normalizer.ts` | Extended upsertEvent with COALESCE source_url | VERIFIED | Lines 14-71: extended signature with `scrapeSourceId` and `sourceType` optional params; COALESCE on line 46; event_sources insert on lines 58-70 |
| `src/lib/scraper/normalizer.test.ts` | Tests for event_sources insertion and non-destructive source_url | VERIFIED | Lines 192-276: 5 new test cases covering `db.insert called twice`, `source_type/scrape_source_id values`, `COALESCE non-string`, `default args` |
| `drizzle/0006_skinny_sentry.sql` | Migration creating event_sources table | VERIFIED | File exists: `CREATE TYPE "source_type"`, `CREATE TABLE "event_sources"` with FKs, `CREATE UNIQUE INDEX "event_sources_dedup"`, `CREATE INDEX "event_sources_event_id_idx"` |

---

## Key Link Verification

### Plan 19-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `EventCard.tsx` | `handleCardClick` | map-pin icon renders only when `venue.lat` and `venue.lng` are non-null | WIRED | Line 42: guard `venue.lat !== null && venue.lat !== undefined && venue.lng !== null && venue.lng !== undefined` exactly matches handleCardClick guard on line 19 |
| `CategoryChipsRow.tsx` | nuqs URL state | `useQueryState('category')` reads/writes URL param | WIRED | Line 12: `const [category, setCategory] = useQueryState('category')` |
| `MapClient.tsx` | `CategoryChipsRow.tsx` | import and render in timelapse overlay block | WIRED | Line 20: import present; lines 124-126: rendered inside `{mapMode === 'timelapse' && (...)}` block with `eventCount` prop |

**Note:** Plan 19-01 specified pattern `mapMode.*timelapse.*CategoryChipsRow` as a single-line regex. In the actual code these span two lines. The functional connection is fully implemented and correct — this is a pattern-spec nuance only, not a gap.

### Plan 19-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `normalizer.ts` | `schema.ts` | imports `event_sources` for join table insert | WIRED | Line 2: `import { events, event_sources } from '@/lib/db/schema'` |
| `normalizer.ts` | `events.source_url` | COALESCE in onConflictDoUpdate prevents overwriting | WIRED | Line 46: `source_url: sql\`COALESCE(${events.source_url}, ${sourceUrl})\`` |
| `ticketmaster.ts` | `normalizer.ts` | passes `source_type='ticketmaster'` to upsertEvent | WIRED | Line 113: `upsertEvent(venueId, extracted, event.url, null, 'ticketmaster')` |
| `orchestrator.ts` | `normalizer.ts` | passes `scrapeSourceId` and `source_type='scrape'` | WIRED | Line 104: `upsertEvent(source.venue_id, event, source.url, source.id, 'scrape')` — `source.id` is the scrape_source_id |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| UX-01 | 19-01 | User can click "Show on map" on an event card to animate the map to the venue location | SATISFIED | Map-pin SVG icon in `EventCard.tsx` provides visual affordance; `handleCardClick` wires click to `onClickVenue` flyTo callback (pre-existing behavior preserved) |
| UX-02 | 19-01 | Category filter chips are visible and interactive in timelapse mode | SATISFIED | `CategoryChipsRow` rendered in timelapse overlay in `MapClient.tsx`; chips use `useQueryState('category')` for URL-driven filter already consumed by `page.tsx` filter chain |
| ATTR-01 | 19-02 | System tracks which sources each event was discovered from via an event_sources join table | SATISFIED | `event_sources` table in schema + migration; `upsertEvent` inserts/upserts row on every call with `source_type` and optional `scrape_source_id` |
| ATTR-02 | 19-02 | On cross-source conflict, ticket link is updated non-destructively if existing event has none | SATISFIED | `COALESCE(${events.source_url}, ${sourceUrl})` in `onConflictDoUpdate.set` — fills when null, preserves when set |

All 4 requirement IDs from both plan frontmatters are accounted for. No orphaned requirements found in `REQUIREMENTS.md` for phase 19.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None detected | — | — | — | — |

Scanned all 7 key files for TODOs, FIXME, placeholder patterns, empty implementations, and console.log-only handlers. None found.

---

## Test and Build Results

| Check | Result |
|-------|--------|
| TypeScript (`npx tsc --noEmit`) | Clean — no errors |
| Full test suite (`npx jest --no-coverage`) | 269/269 tests passing across 20 test suites |
| Commits verified | All 5 commits (`4e91ef9`, `0011e64`, `06ab9e1`, `9c49708`, `60688b7`) exist in git history |
| Drizzle migration | `drizzle/0006_skinny_sentry.sql` exists with correct DDL |

---

## Human Verification Required

### 1. Map-Pin Icon Visual Behavior

**Test:** Run `npm run dev`, open http://localhost:3000 in cluster mode, find an event card in the sidebar.
**Expected:** Cards where the venue has lat/lng coordinates show a small gray map-pin icon (12px) to the right of the performer name. Hovering over the card turns the icon from gray to orange (`#E85D26`). Cards without coordinates show no icon.
**Why human:** CSS `group-hover` transitions and conditional SVG rendering require a live browser to visually confirm the hover state change and that the guard condition correctly distinguishes cards with/without coordinates.

### 2. Timelapse Category Chips — Live Filtering Without Pausing

**Test:** Switch to timelapse mode using the mode toggle. Start playback.
**Expected:** A row of category chips (e.g., All, Live Music, Comedy, ...) appears above the TimelineBar at the bottom of the map. An event count badge is visible on the left. While the timeline is playing, click a category chip — the heatmap intensity and sidebar event list should update to match the selected category immediately. Playback continues without pausing. Clicking "All" resets the filter.
**Why human:** Real-time heatmap re-render during playback and the absence of a pause side-effect require observing live animation behavior that cannot be simulated by static code inspection.

### 3. Mobile Viewport Layout

**Test:** Open browser DevTools, set viewport to 375px width, switch to timelapse mode.
**Expected:** Both the category chip row and the TimelineBar are visible at the bottom of the screen without horizontal overflow or content clipping. Chip row should scroll horizontally if chips overflow.
**Why human:** Responsive CSS layout behavior (`overflow-x-auto`, `flex flex-col gap-2`, bottom overlay positioning) requires a rendered viewport to confirm no overflow or z-index conflicts.

---

## Summary

Phase 19 achieved its goal in full based on automated verification. All 9 observable truths are verified, all 7 required artifacts exist and are substantive, all 7 key links are wired, all 4 requirement IDs (UX-01, UX-02, ATTR-01, ATTR-02) are satisfied, and no anti-patterns were detected.

The 3 human verification items are visual/behavioral in nature — hover transitions, live animation behavior during timelapse playback, and mobile layout rendering. These cannot be confirmed by static code inspection but the underlying implementation is correct.

The system is ready for phase 20.

---

_Verified: 2026-03-15_
_Verifier: Claude (gsd-verifier)_
