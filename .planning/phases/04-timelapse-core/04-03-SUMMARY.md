---
phase: 04-timelapse-core
plan: "03"
subsystem: timelapse-integration
tags: [timelapse, heatmap, scrubber, state-management, integration]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [complete-timelapse-loop]
  affects: [page.tsx, MapClient, MapClientWrapper, TimelineBar]
tech_stack:
  added: [date-fns format]
  patterns: [mode-aware-useMemo, useRef-interval-pattern, conditional-layer-rendering]
key_files:
  created:
    - src/components/timelapse/TimelineBar.tsx
  modified:
    - src/app/page.tsx
    - src/components/map/MapClient.tsx
    - src/components/map/MapClientWrapper.tsx
decisions:
  - TimelineBar uses native range input with step=1/TOTAL_STEPS for precise scrubbing
  - ClusterLayer unmounts in timelapse mode (React conditional, not CSS hide) per research recommendation
  - MapContainer never unmounts across mode toggle (MODE-03 preserved)
  - EventFilters hidden (not just disabled) in timelapse mode — TimelineBar replaces date filter UI
  - sidebarEvents and heatPoints derived from same useMemo to prevent dual filter runs
metrics:
  duration: 3 minutes
  completed: 2026-03-14
  tasks_completed: 2
  files_changed: 4
---

# Phase 04 Plan 03: Timelapse Integration Summary

Complete end-to-end timelapse loop wiring TimelineBar scrubber + HeatmapLayer + ModeToggle into the app via mode-aware filter chain in HomeContent.

## What Was Built

### Task 1: TimelineBar scrubber component

Created `src/components/timelapse/TimelineBar.tsx` — a frosted glass overlay bar (`backdrop-blur-md bg-white/70 rounded-xl shadow-lg`) with:
- Play/Pause button with inline SVG icons (pause bars / play triangle), wired to `onPlayPause` prop
- Native `<input type="range">` with `step={1/TOTAL_STEPS}` (120 steps), `onMouseDown`/`onTouchStart` calling `onScrubStart` to auto-pause playback on drag
- Date/block label (`text-sm font-medium text-gray-700`) and event count badge (`role="status"`, `bg-blue-100 text-blue-700 rounded-full`)
- Full accessibility: `aria-label="Timeline scrubber"` on range, `aria-label="Play"/"Pause"` on button

### Task 2: Integration wiring across HomeContent, MapClient, MapClientWrapper

**HomeContent (page.tsx):**
- Added `mapMode`, `timePosition`, `isPlaying` state; `referenceDate` useRef
- Play loop: `setInterval` in `useEffect([isPlaying])` advancing `timePosition` by `STEP_SIZE` each second, stopping at 1.0, cleaned up on effect teardown
- Mode-aware `useMemo` filter chain: in timelapse mode uses `filterByTimeWindow` + `computeVenueHeatPoints`; in cluster mode uses existing `filterByDateRange` chain
- `currentLabel` useMemo: `positionToTimestamp` + `date-fns format` + `positionToBlockName`
- `handleModeToggle` stops playback when leaving timelapse; `handleScrubStart` pauses on drag
- EventFilters conditionally hidden in timelapse mode; EventList uses `sidebarEvents`
- All timelapse props threaded to MapClientWrapper

**MapClientWrapper (MapClientWrapper.tsx):**
- Extended `MapClientWrapperProps` with 10 new optional timelapse props (mapMode, heatPoints, onModeToggle, isPlaying, timePosition, currentLabel, eventCount, onTimePositionChange, onScrubStart, onPlayPause)
- Props threaded via existing `{...props}` spread pattern — no logic changes needed

**MapClient (MapClient.tsx):**
- Added imports: `HeatmapLayer`, `ModeToggle`, `TimelineBar`, `HeatPoint` type
- Extended `MapClientProps` with matching timelapse props + destructured in function signature
- Inside MapContainer: `ClusterLayer` conditionally rendered (`mapMode !== 'timelapse'`), `HeatmapLayer` conditionally rendered (`mapMode === 'timelapse'`)
- Outside MapContainer: `ModeToggle` always visible (top-right), `TimelineBar` in `absolute bottom-0` div only when `mapMode === 'timelapse'`

## Verification

- `npx next build`: passes (TypeScript + build)
- `npx jest --no-coverage`: 111/112 tests pass; 1 pre-existing failure in `seed.test.ts` (confirmed pre-existing via git stash check, not caused by these changes)

## Deviations from Plan

None — plan executed exactly as written. Pre-existing test failure in `seed.test.ts` was verified as pre-existing via git stash.

## Self-Check: PASSED

- FOUND: src/components/timelapse/TimelineBar.tsx
- FOUND: src/app/page.tsx
- FOUND: src/components/map/MapClient.tsx
- FOUND: src/components/map/MapClientWrapper.tsx
- FOUND: commit 8f56994 (Task 1)
- FOUND: commit 210944a (Task 2)
