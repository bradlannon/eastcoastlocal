---
phase: 04-timelapse-core
verified: 2026-03-14T00:00:00Z
status: human_needed
score: 13/14 must-haves verified
gaps:
human_verification:
  - test: "Mode Toggle switches layers (MODE-01, HEAT-01)"
    expected: "Clicking the top-right toggle button makes pin clusters disappear and a blue-to-red heatmap gradient appear; TimelineBar scrubber appears at the bottom of the map"
    why_human: "Leaflet canvas rendering and layer visibility cannot be asserted programmatically without a browser"
  - test: "Scrubber drag updates heatmap smoothly without flicker (TIME-01, HEAT-04)"
    expected: "Dragging the range input across its full range causes heatmap intensity to update smoothly with no blank frames or canvas teardown"
    why_human: "Visual smoothness requires browser inspection; setLatLngs in-place update cannot be observed via static analysis"
  - test: "Date/block label updates while dragging (TIME-03)"
    expected: "Label format 'Sat Mar 14 - Evening' updates in real-time; block cycles through Morning / Afternoon / Evening / Night as scrubber moves"
    why_human: "Real-time label update depends on React rendering loop triggered by range input onChange — requires browser interaction"
  - test: "Sidebar event list stays in sync with 24-hour time window (MODE-02)"
    expected: "As scrubber moves, the sidebar event list changes to show only events within the current +-12h window; event count badge on TimelineBar matches sidebar count"
    why_human: "Sidebar sync is a full integration behavior (state -> useMemo filter -> render); cannot verify actual displayed events without running the app against real data"
  - test: "Play/pause auto-advances scrubber and heatmap (TIME-04)"
    expected: "Clicking play advances the scrubber at ~1 second per step; heatmap animates with each step; clicking pause stops advancement; dragging during playback auto-pauses"
    why_human: "setInterval timing and setLatLngs animation behavior require a running browser session"
  - test: "Map viewport (zoom/pan) is preserved when toggling between modes (MODE-03)"
    expected: "Zoom in on a specific city, toggle to timelapse, toggle back to cluster — zoom level and pan position are unchanged throughout"
    why_human: "Leaflet map state preservation across React conditional renders requires visual/browser verification"
  - test: "Province filter applies in timelapse mode (HEAT-02 integration)"
    expected: "Selecting a province filter in cluster mode, then switching to timelapse mode, causes heatmap to show only events in that province; returning to cluster mode restores the province filter"
    why_human: "Cross-mode filter state persistence requires interactive testing"
  - test: "No ghost heatmap layers or console errors after rapid mode toggling"
    expected: "Toggle modes 5-10 times rapidly; no visible ghost heatmap in cluster mode; DevTools console shows no errors"
    why_human: "Layer lifecycle correctness (removeLayer on unmount) requires browser DevTools inspection"
---

# Phase 4: Timelapse Core Verification Report

**Phase Goal:** Users can switch to heatmap timelapse mode, scrub through 30 days of events, watch playback animate, and see the sidebar stay in sync with the current time window
**Verified:** 2026-03-14
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | positionToTimestamp maps 0-1 float to a Date within a 30-day range | VERIFIED | `src/lib/timelapse-utils.ts` lines 38-41: linear interpolation over `TOTAL_DAYS * 24 * 60 * 60 * 1000` ms; 4 unit tests covering 0, 0.5, 1, and 0.25 positions |
| 2  | positionToBlockName returns correct 6-hour block name for any position | VERIFIED | Lines 54-57: `Math.round(position * (TOTAL_STEPS - 1)) % BLOCKS_PER_DAY` maps to BLOCK_NAMES array; 8 unit tests cover all 4 names and edge positions |
| 3  | filterByTimeWindow returns only events within +-12h of center | VERIFIED | Lines 68-78: halfMs = windowHours/2 * 3.6M ms; 8 unit tests including boundary, edge cases, and mixed arrays |
| 4  | computeVenueHeatPoints groups events by venue with normalized 0-1 intensity | VERIFIED | Lines 91-113: Map-based grouping, max-normalization, 0.15 floor; 8 unit tests covering empty, null lat/lng, multi-venue, and intensity bounds |
| 5  | Single-event venues get minimum 0.15 intensity | VERIFIED | Line 111: `Math.max(0.15, count / maxCount)`; dedicated test with 100-event venue A vs 1-event venue B confirms floor applied |
| 6  | leaflet.heat is installed and builds without SSR errors | VERIFIED | `package.json` confirms `leaflet.heat@^0.2.0` (dep) and `@types/leaflet.heat@^0.2.5` (devDep); HeatmapLayer only imported inside MapClient which is behind `dynamic(..., { ssr: false })` boundary in MapClientWrapper |
| 7  | HeatmapLayer renders a canvas heatmap via dual-useEffect lifecycle | VERIFIED | `src/components/map/HeatmapLayer.tsx`: first useEffect creates `L.heatLayer` with gradient config and cleans up via `map.removeLayer` on unmount; second useEffect calls `setLatLngs` + conditional `addTo(map)` on [map, points, visible] |
| 8  | HeatmapLayer updates in-place via setLatLngs (no layer re-creation) | VERIFIED | Line 57: `heatRef.current.setLatLngs(latlngs)` — the layer ref persists across updates; no `L.heatLayer()` call in the update effect |
| 9  | ModeToggle is a floating icon button positioned top-right | VERIFIED | `src/components/map/ModeToggle.tsx` line 19: `absolute top-4 right-4 z-[1000] w-10 h-10 bg-white rounded-full shadow-md`; rendered outside MapContainer in `div.relative` wrapper in MapClient |
| 10 | User can drag a scrubber to move through 30-day window | VERIFIED | `src/components/timelapse/TimelineBar.tsx` lines 65-76: native `<input type="range" min="0" max="1" step={1/TOTAL_STEPS}>` wired to `onPositionChange` via onChange; `onScrubStart` called on mouseDown/touchStart |
| 11 | User can play/pause to auto-advance the scrubber | VERIFIED | `src/app/page.tsx` lines 50-62: `setInterval` advancing `timePosition` by `STEP_SIZE` each 1000ms; interval cleared on effect cleanup; stop at position=1 |
| 12 | Current date and block label updates as scrubber moves | VERIFIED | `page.tsx` lines 100-105: `currentLabel` useMemo combining `format(ts, 'EEE MMM d')` + `positionToBlockName(timePosition)`; passed to TimelineBar and rendered as `text-sm font-medium` span |
| 13 | Sidebar event list updates to match current 24-hour time window | VERIFIED (wiring) | `page.tsx` lines 81-97: mode-aware useMemo derives `sidebarEvents` from `filterByTimeWindow` in timelapse mode; `sidebarEvents` passed to `<EventList>`; keyed on `[mapMode, timePosition, allEvents, ...]` — actual sync behavior requires human confirmation |
| 14 | Pin clusters hidden when heatmap mode is active (with override) | VERIFIED | `MapClient.tsx` line 87: `{(mapMode !== 'timelapse' || showPins) && <ClusterLayer .../>}` — clusters unmount in timelapse mode unless user enables pin overlay via showPins toggle |

**Score:** 13/14 automated truths verified (truth 13 partially: wiring confirmed, runtime behavior requires human)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/timelapse-utils.ts` | Pure timelapse utility functions and constants | VERIFIED | 113 lines; exports TOTAL_DAYS, BLOCKS_PER_DAY, TOTAL_STEPS, BLOCK_HOURS, STEP_SIZE, WINDOW_HOURS, BlockName type, HeatPoint interface, positionToTimestamp, positionToBlockName, filterByTimeWindow, computeVenueHeatPoints |
| `src/lib/timelapse-utils.test.ts` | Unit tests — min 80 lines | VERIFIED | 308 lines, 35 test cases across 4 describe blocks |
| `src/components/map/HeatmapLayer.tsx` | Imperative leaflet.heat wrapper — min 40 lines | VERIFIED | 65 lines; 'use client'; imports useMap, L, leaflet.heat, HeatPoint; dual-useEffect lifecycle; returns null |
| `src/components/map/ModeToggle.tsx` | Floating toggle button — min 20 lines | VERIFIED | 60 lines; exports MapMode type and default; mode-aware SVG icons; accessible aria-labels |
| `src/components/timelapse/TimelineBar.tsx` | Scrubber overlay — min 50 lines | VERIFIED | 112 lines; frosted glass styling; play/pause SVG icons; native range input; date label; event count badge; pin visibility toggle (bonus feature beyond plan) |
| `src/app/page.tsx` | HomeContent with mapMode, timePosition, isPlaying state | VERIFIED | Contains mapMode state (line 42), timePosition (43), isPlaying (44), referenceDate useRef (46), play loop useEffect, mode-aware useMemo filter chain, currentLabel useMemo, all handler functions, prop threading |
| `src/components/map/MapClient.tsx` | MapClient with HeatmapLayer/ClusterLayer conditional render | VERIFIED | Imports HeatmapLayer, ModeToggle, TimelineBar; conditional ClusterLayer (with showPins override); conditional HeatmapLayer; ModeToggle always rendered; conditional TimelineBar in absolute bottom div; single MapContainer instance |
| `src/components/map/MapClientWrapper.tsx` | Prop threading for timelapse props | VERIFIED | MapClientWrapperProps extended with 10 timelapse props (mapMode, heatPoints, onModeToggle, isPlaying, timePosition, currentLabel, eventCount, onTimePositionChange, onScrubStart, onPlayPause) plus showPins, onTogglePins; spread via `{...props}` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `timelapse-utils.test.ts` | `timelapse-utils.ts` | direct import | WIRED | Line 1-11: imports all 5 constants + 4 functions |
| `HeatmapLayer.tsx` | `leaflet.heat` | `import 'leaflet.heat'` | WIRED | Line 6: side-effect import confirmed |
| `HeatmapLayer.tsx` | `react-leaflet` | `useMap()` | WIRED | Line 4: imports useMap; line 15: `const map = useMap()` |
| `HeatmapLayer.tsx` | `timelapse-utils.ts` | HeatPoint type import | WIRED | Line 7: `import type { HeatPoint } from '@/lib/timelapse-utils'` |
| `page.tsx` | `timelapse-utils.ts` | import for filter and compute functions | WIRED | Lines 12-17: STEP_SIZE, positionToTimestamp, positionToBlockName, filterByTimeWindow, computeVenueHeatPoints all imported and used in useMemo blocks |
| `page.tsx` | `MapClientWrapper.tsx` | props threading mapMode, heatPoints | WIRED | Lines 188-200: mapMode, heatPoints, onModeToggle, isPlaying, timePosition, currentLabel, eventCount, onTimePositionChange, onScrubStart, onPlayPause, showPins, onTogglePins all passed |
| `MapClient.tsx` | `HeatmapLayer.tsx` | conditional render inside MapContainer | WIRED | Line 94-96: `{mapMode === 'timelapse' && <HeatmapLayer points={heatPoints ?? []} visible={true} />}` |
| `MapClient.tsx` | `TimelineBar.tsx` | conditional render in outer div | WIRED | Lines 112-126: `{mapMode === 'timelapse' && <div ...><TimelineBar .../></div>}` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HEAT-01 | 04-02 | User can see a heatmap overlay showing event density | NEEDS HUMAN | HeatmapLayer component exists, wired, and uses L.heatLayer with gradient — visual confirmation required |
| HEAT-02 | 04-01 | Heatmap intensity reflects event count in current time window | SATISFIED | computeVenueHeatPoints normalizes count to 0-1 intensity; called from useMemo with filterByTimeWindow output; 35 unit tests |
| HEAT-04 | 04-02 | Heatmap updates smoothly (no flicker) | NEEDS HUMAN | setLatLngs in-place update pattern implemented (no layer re-creation); visual smoothness requires browser |
| TIME-01 | 04-03 | User can drag scrubber through 30-day window | NEEDS HUMAN | Native range input wired to onPositionChange; TOTAL_STEPS step resolution implemented — drag interaction requires browser |
| TIME-02 | 04-01 | Each position shows events within 24-hour rolling window | SATISFIED | filterByTimeWindow with WINDOW_HOURS=24 (+-12h); useMemo keyed on timePosition; unit tested |
| TIME-03 | 04-01, 04-03 | User can see current date/time label | SATISFIED (wiring) | currentLabel useMemo computes "EEE MMM d - BlockName" format; rendered in TimelineBar span; needs browser confirmation of real-time update |
| TIME-04 | 04-03 | User can play/pause to auto-advance | NEEDS HUMAN | setInterval play loop implemented with STEP_SIZE advance; pause on stop; cleanup on effect teardown — animation requires browser |
| MODE-01 | 04-02, 04-03 | User can toggle between cluster and heatmap mode | NEEDS HUMAN | ModeToggle button wired to handleModeToggle; conditional layer rendering implemented — visual layer switch requires browser |
| MODE-02 | 04-03 | Sidebar updates with current 24-hour time window | NEEDS HUMAN | sidebarEvents derived from filterByTimeWindow in timelapse useMemo; passed to EventList — sync behavior requires browser with real data |
| MODE-03 | 04-02, 04-03 | Map viewport preserved when switching modes | NEEDS HUMAN | Single MapContainer instance confirmed (never unmounts); Leaflet state preservation requires browser |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/map/HeatmapLayer.tsx` | 56 | `heatRef.current.setOptions({ max: dynamicMax })` before setLatLngs | INFO | Not in plan spec — executor added dynamic max scaling based on point count. This is a scope addition beyond what was planned (plan specified static options on layer creation). Behavior appears intentional and benign: it makes sparse data more visible. Not a stub or blocker. |
| `src/components/timelapse/TimelineBar.tsx` | 10-15 | Extra `showPins` and `onTogglePins` props beyond plan spec | INFO | Executor added a pin visibility toggle button inside TimelineBar beyond the planned interface. This extends functionality (allows overlay of venue pins on heatmap). Props are properly threaded through MapClient and page.tsx. Not a blocker. |

No TODO/FIXME/placeholder comments found. No empty implementations. No stub handlers.

---

## Plan 04-04 Status: Incomplete

Plan 04-04 (`04-04-PLAN.md`) is a human checkpoint plan requiring manual visual verification of the complete timelapse feature in a browser. Its summary (`04-04-SUMMARY.md`) **does not exist**, indicating this checkpoint has not been executed or signed off.

The plan itself defines 8 verification checks:
1. Mode toggle switches layers (MODE-01)
2. Scrubber drag updates heatmap smoothly (TIME-01, HEAT-04)
3. Date label updates correctly (TIME-03)
4. Sidebar sync (MODE-02)
5. Play/pause behavior (TIME-04)
6. Viewport preservation (MODE-03)
7. Province filter in timelapse mode
8. Cleanup check (no ghost layers, no console errors)

All of these are captured in the human verification section above.

---

## Human Verification Required

All 8 items require a running browser. The dev server can be started with `npm run dev` at the project root, then verified at `http://localhost:3000`.

### 1. Mode Toggle (MODE-01, HEAT-01)

**Test:** Click the circular button at the top-right of the map (heatmap concentric-circles icon)
**Expected:** Pin clusters disappear; blue-to-red heatmap gradient appears over event locations; TimelineBar frosted glass bar appears at the bottom of the map
**Why human:** Leaflet canvas layer visibility cannot be asserted without a running browser

### 2. Scrubber Drag Without Flicker (TIME-01, HEAT-04)

**Test:** In timelapse mode, drag the range input scrubber slowly from left to right across its full range
**Expected:** Heatmap intensity shifts smoothly with no blank frames, no canvas teardown or flash — the setLatLngs in-place update should produce seamless transitions
**Why human:** Visual smoothness is a perception-based assessment

### 3. Date Label Format and Real-Time Update (TIME-03)

**Test:** While dragging the scrubber, observe the label to the right of the range input
**Expected:** Label displays format like "Sat Mar 14 - Evening"; block name cycles Morning / Afternoon / Evening / Night every ~30 steps; label updates on every drag tick
**Why human:** Real-time DOM update from controlled range input requires browser interaction

### 4. Sidebar Sync with Time Window (MODE-02)

**Test:** Scrub to a position where some events exist (near the middle of the 30-day window if data is available), then drag to a position with fewer or different events
**Expected:** The sidebar event list visibly changes; the event count badge on the TimelineBar matches the number of events shown in the sidebar
**Why human:** Requires real event data from the API to observe the filter effect

### 5. Play/Pause Auto-Advance (TIME-04)

**Test:** Click the play button (triangle icon); observe the scrubber; click pause (bars icon); then drag the scrubber while playing
**Expected:** Play causes scrubber to advance one step per second; heatmap updates with each step; pause stops advancement; dragging during playback pauses automatically
**Why human:** setInterval behavior and auto-pause-on-drag are interaction sequences

### 6. Viewport Preservation on Toggle (MODE-03)

**Test:** Zoom into a specific city (e.g., Halifax) to zoom level 12+. Toggle to timelapse mode. Toggle back to cluster mode.
**Expected:** Zoom level and map center position are identical before and after both toggles — no reset to initial view
**Why human:** Leaflet map state persistence across conditional React renders requires visual inspection

### 7. Province Filter in Timelapse Mode

**Test:** Select a province filter (e.g., NB) while in cluster mode. Switch to timelapse mode.
**Expected:** Heatmap shows only events in the selected province; switching back to cluster mode retains the province filter
**Why human:** Cross-mode filter state requires real data and browser rendering to verify

### 8. Cleanup and No Console Errors

**Test:** Toggle between cluster and timelapse modes 5-10 times rapidly. Open browser DevTools console.
**Expected:** No ghost heatmap visible in cluster mode; no console errors or warnings; no apparent performance degradation
**Why human:** Layer cleanup lifecycle correctness (removeLayer on unmount) requires DevTools inspection

---

## Summary

All automated verification checks pass. The phase goal is implemented completely and correctly in the codebase:

- Plan 01 utility functions: 35 unit tests, all exports present and substantive
- Plan 02 components: leaflet.heat installed, HeatmapLayer with proper dual-useEffect lifecycle, ModeToggle with accessible floating button
- Plan 03 integration: full prop chain from page.tsx through MapClientWrapper to MapClient; mode-aware useMemo filter chain; conditional layer rendering; play loop with proper cleanup; EventFilters hidden in timelapse mode

Two scope additions were made beyond the plan spec (dynamic heatmap max scaling in HeatmapLayer; showPins pin overlay toggle in TimelineBar). Both are properly wired and non-breaking.

Plan 04-04's human checkpoint summary is missing, indicating the 8 manual browser verifications in that plan have not been formally completed. These are captured above as the human verification required items.

**Automated infrastructure is complete. Phase 4 goal achievement can be confirmed after manual browser verification of the 8 items above.**

---

_Verified: 2026-03-14_
_Verifier: Claude (gsd-verifier)_
