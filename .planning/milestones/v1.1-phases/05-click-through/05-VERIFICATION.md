---
phase: 05-click-through
verified: 2026-03-14T00:00:00Z
status: human_needed
score: 9/9 automated must-haves verified
re_verification: false
human_verification:
  - test: "Click heatmap hotspot opens popup with venue events"
    expected: "Clicking a colored heat area in timelapse mode shows a popup listing events at nearby venue(s)"
    why_human: "Visual interaction with Leaflet map cannot be verified programmatically"
  - test: "Popup shows only events within the current 24-hour time window"
    expected: "Events in popup match events visible in the sidebar list for the current scrubber position"
    why_human: "Requires visual cross-reference between popup content and sidebar during runtime"
  - test: "Clicking a hotspot while playing auto-pauses playback"
    expected: "Scrubber stops advancing immediately after a click that opens a popup"
    why_human: "Requires observing playback state change in response to a user interaction"
  - test: "Multiple nearby venues group correctly in popup"
    expected: "When two venues are within 2000m of the click, popup shows both with uppercase venue name headers separating them"
    why_human: "Requires test data with co-located venues and visual inspection"
  - test: "Popup closes when switching to cluster mode"
    expected: "Any open popup disappears without leaving a stale overlay after pressing the mode toggle"
    why_human: "Requires live mode-switch interaction to verify unmount cleanup"
  - test: "Popup closes on scrub"
    expected: "Dragging the scrubber while a popup is open causes the popup to close"
    why_human: "Requires live scrubbing interaction"
  - test: "Clicking empty area (no nearby venues) shows no popup"
    expected: "Clicking ocean or park area with no events within 2000m does nothing"
    why_human: "Requires live map interaction with real data"
---

# Phase 5: Click-Through Verification Report

**Phase Goal:** Users can click a heatmap hotspot and reach the specific events at that location
**Verified:** 2026-03-14
**Status:** human_needed — all automated checks pass; 7 items require visual runtime verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | findNearbyVenues returns venues within geographic radius threshold | VERIFIED | Function exists in timelapse-utils.ts lines 163-182, test covers same-location case (distance ~0m, returns venue) |
| 2 | findNearbyVenues returns empty array when click is far from all venues | VERIFIED | Test: Halifax venue, click at Moncton (~180km) returns [] |
| 3 | findNearbyVenues returns multiple venues when several are within radius | VERIFIED | Test: two venues within 2000m of click, both returned |
| 4 | findNearbyVenues skips venues with null lat/lng | VERIFIED | Test covers null lat and null lng separately |
| 5 | User can click a heatmap hotspot and see a popup with events at that location | VERIFIED (wiring) / ? (runtime) | HeatmapClickLayer wired into MapClient timelapse block; popup rendered via react-leaflet Popup; runtime requires human |
| 6 | Popup shows only events within the current 24-hour time window | VERIFIED (logic) / ? (runtime) | useMemo in HeatmapClickLayer calls filterByTimeWindow(allEvents, center.getTime(), 24) before building venueGroups |
| 7 | Clicking a hotspot while playing auto-pauses playback | VERIFIED (logic) / ? (runtime) | onPause() called before setClickState; onScrubStart (which calls setIsPlaying(false)) passed as onPause |
| 8 | When multiple venues are within click radius, popup groups events by venue | VERIFIED (logic) / ? (runtime) | HeatmapPopup renders multi-venue path: div container with per-venue headers + VenuePopup per group |
| 9 | Popup closes when switching to cluster mode | VERIFIED (logic) / ? (runtime) | useEffect cleanup on unmount calls setClickState(null); HeatmapClickLayer only renders in timelapse block |

**Score:** 9/9 truths have verified implementation logic; 7 require human confirmation of runtime behavior

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Lines | Status | Details |
|----------|----------|-------|--------|---------|
| `src/lib/timelapse-utils.ts` | findNearbyVenues pure function export | 183 | VERIFIED | Exports CLICK_RADIUS_METERS (line 120), VenueGroup interface (lines 123-126), haversineDistance (lines 134-155), findNearbyVenues (lines 163-182) |
| `src/lib/timelapse-utils.test.ts` | Unit tests for findNearbyVenues | 455+ | VERIFIED | 13 new tests in describe blocks: CLICK_RADIUS_METERS, haversineDistance, findNearbyVenues; all 48 tests pass |

### Plan 02 Artifacts

| Artifact | Expected | Lines | Status | Details |
|----------|----------|-------|--------|---------|
| `src/components/map/HeatmapPopup.tsx` | Multi-venue popup content component | 25 (min 15) | VERIFIED | Exports default function; handles single-venue and multi-venue paths |
| `src/components/map/HeatmapClickLayer.tsx` | Map-level click handler + spatial proximity + Popup rendering | 91 (min 40) | VERIFIED | useMap, map.on('click'), findNearbyVenues, Popup, HeatmapPopup all present |
| `src/components/map/MapClient.tsx` | HeatmapClickLayer wired into timelapse mode block | — | VERIFIED | Line 102: HeatmapClickLayer inside `{mapMode === 'timelapse' && <>` block |
| `src/components/map/MapClientWrapper.tsx` | referenceDate prop threaded | — | VERIFIED | Line 40: `referenceDate?: Date` in MapClientWrapperProps |
| `src/app/page.tsx` | referenceDate.current passed to MapClientWrapper | — | VERIFIED | Line 202: `referenceDate={referenceDate.current}` |

---

## Key Link Verification

### Plan 01

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `timelapse-utils.test.ts` | `timelapse-utils.ts` | `import { findNearbyVenues }` | VERIFIED | Line 13: `findNearbyVenues,` in import block |

### Plan 02

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `HeatmapClickLayer.tsx` | `timelapse-utils.ts` | `import { findNearbyVenues, filterByTimeWindow, positionToTimestamp, VenueGroup }` | VERIFIED | Lines 7-11: all four imported |
| `HeatmapClickLayer.tsx` | `HeatmapPopup.tsx` | renders HeatmapPopup inside Popup | VERIFIED | Line 13: import; line 88: `<HeatmapPopup venues={clickState.venues} />` |
| `MapClient.tsx` | `HeatmapClickLayer.tsx` | JSX child in timelapse block | VERIFIED | Line 24: import; lines 102-107: JSX usage with all props |
| `page.tsx` | `MapClientWrapper.tsx` | referenceDate prop | VERIFIED | Line 202: `referenceDate={referenceDate.current}` |

**Note:** Plan 02 specified `import { ..., computeVenueHeatPoints, CLICK_RADIUS_METERS }` in the key_link pattern but the actual implementation omits those two — the venueGroups Map is built inline in useMemo without needing computeVenueHeatPoints separately, and CLICK_RADIUS_METERS is used as default inside findNearbyVenues. This is a correct deviation: the code works correctly without those imports.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HEAT-03 | 05-01, 05-02 | User can click a heatmap hotspot to see the specific events at that location | SATISFIED (automated) / NEEDS HUMAN (runtime) | findNearbyVenues + HeatmapClickLayer + HeatmapPopup complete the full click-through chain; wiring verified; runtime behavior requires human confirmation |

No orphaned requirements: HEAT-03 is the only Phase 5 requirement per REQUIREMENTS.md and it is claimed by both plans.

---

## Anti-Patterns Found

None.

Scanned files: HeatmapPopup.tsx, HeatmapClickLayer.tsx, timelapse-utils.ts, MapClient.tsx, MapClientWrapper.tsx, page.tsx.

The `return null` at HeatmapClickLayer.tsx line 81 is intentional guard logic (no popup = render nothing), not a stub.

---

## Test Results

```
timelapse-utils test suite: 48/48 PASS
  - 35 pre-existing tests: all pass
  - 13 new findNearbyVenues tests: all pass
    - CLICK_RADIUS_METERS equals 2000
    - haversineDistance: same coords ~0, Halifax-Moncton ~180km, antipodal ~20015km
    - findNearbyVenues: within radius, outside radius, multi-venue, null lat, null lng, empty map, custom radius (1000m exclude, 2000m include)
```

TypeScript: One pre-existing error in `src/lib/seed.test.ts` (venue name type mismatch for "The Ship Pub & Kitchen") — documented in 05-01-SUMMARY.md as pre-existing, not caused by this phase. No errors in phase files.

---

## Human Verification Required

These behaviors cannot be verified programmatically. All require running `npm run dev` and opening http://localhost:3000.

### 1. Click hotspot opens popup

**Test:** Switch to timelapse mode, scrub to a position where hotspots are visible, click a colored heat area.
**Expected:** A popup appears showing event name(s) at that venue.
**Why human:** Leaflet map click interaction requires a browser.

### 2. Popup time-window accuracy

**Test:** Note events in the sidebar at a given scrubber position, then click the nearest hotspot.
**Expected:** Popup events match the sidebar events for that venue.
**Why human:** Requires visual cross-reference between two UI panels at runtime.

### 3. Auto-pause on click

**Test:** Press play to start auto-advancing the scrubber, then click a visible hotspot.
**Expected:** Playback pauses immediately (scrubber stops moving) and popup appears.
**Why human:** Requires observing scrubber animation state in response to a click.

### 4. Multi-venue popup grouping

**Test:** Find an area on the map where two venues are close together (within ~2km), click between them.
**Expected:** Popup shows both venues, each with an uppercase name header and their respective events listed below.
**Why human:** Requires real data with geographically co-located venues.

### 5. Popup closes on mode switch

**Test:** Open a popup by clicking a hotspot, then press the mode toggle to switch to cluster mode.
**Expected:** Popup disappears cleanly with no stale overlay.
**Why human:** Requires live mode-switch to trigger HeatmapClickLayer unmount cleanup.

### 6. Popup closes on scrub

**Test:** Open a popup, then drag the timeline scrubber.
**Expected:** Popup closes as soon as timePosition changes.
**Why human:** Requires live scrubbing interaction to trigger the timePosition useEffect.

### 7. No popup on empty-area click

**Test:** In timelapse mode, click over ocean or a location with no events within 2km.
**Expected:** No popup appears; map behaves normally (pan/zoom).
**Why human:** Requires real data to confirm no venues fall within 2000m of the click.

---

## Summary

Phase 5 automated verification passes completely. The full click-through chain is built and wired:

- `findNearbyVenues` (pure Haversine spatial function) is implemented, exported, and covered by 13 unit tests — all pass.
- `HeatmapClickLayer` correctly time-windows events, builds venue groups via useMemo, registers map click handler, calls onPause before setting popup state, and clears popup on timePosition change and unmount.
- `HeatmapPopup` renders single-venue directly via VenuePopup and multi-venue in a scrollable grouped container with venue name headers.
- The referenceDate prop chain is complete: page.tsx → MapClientWrapper → MapClient → HeatmapClickLayer.
- HeatmapClickLayer is rendered inside the `mapMode === 'timelapse'` block in MapClient, ensuring it is absent in cluster mode (popup cleanup on mode switch handled by unmount effect).

Seven runtime behaviors require human confirmation in a browser with live data.

---

_Verified: 2026-03-14_
_Verifier: Claude (gsd-verifier)_
