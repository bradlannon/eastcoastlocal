---
phase: 05-click-through
plan: "02"
subsystem: map/click-through
tags: [heatmap, click-through, popup, react-leaflet, timelapse]
dependency_graph:
  requires:
    - "05-01"  # findNearbyVenues, VenueGroup, CLICK_RADIUS_METERS
  provides:
    - "HEAT-03"  # click heatmap hotspot -> see venue events popup
  affects:
    - src/components/map/MapClient.tsx
    - src/components/map/MapClientWrapper.tsx
    - src/app/page.tsx
tech_stack:
  added: []
  patterns:
    - react-leaflet Popup with position prop (not Marker wrapper)
    - eventHandlers={{ remove }} for popup close (react-leaflet EventedProps pattern)
    - useMemo to build Map<venueId, VenueGroup> from time-windowed events
    - useEffect cleanup on unmount to clear popup state on mode switch
key_files:
  created:
    - src/components/map/HeatmapPopup.tsx
    - src/components/map/HeatmapClickLayer.tsx
  modified:
    - src/components/map/MapClient.tsx
    - src/components/map/MapClientWrapper.tsx
    - src/app/page.tsx
decisions:
  - "react-leaflet Popup onClose does not exist — use eventHandlers={{ remove }} instead (EventedProps pattern)"
  - "HeatmapClickLayer clears popup on timePosition change to prevent stale event windows after scrubbing"
  - "onScrubStart reused as onPause prop — already calls setIsPlaying(false), no new handler needed"
metrics:
  duration_seconds: 116
  tasks_completed: 2
  files_created: 2
  files_modified: 3
  completed_date: "2026-03-14"
requirements:
  - HEAT-03
---

# Phase 05 Plan 02: HeatmapClickLayer and HeatmapPopup Summary

**One-liner:** Click-to-popup feature wiring HeatmapClickLayer (proximity + time-windowing) and HeatmapPopup (single/multi-venue grouping) into timelapse mode via threaded referenceDate prop.

## What Was Built

Complete heatmap click-through feature delivering HEAT-03. Users can click heatmap hotspots in timelapse mode and see a popup listing events at nearby venues filtered to the current 24-hour time window.

### Components Created

**HeatmapPopup.tsx** — Thin popup content component. Renders a single `VenuePopup` for single-venue results, or a scrollable multi-venue grouped list with uppercase venue name headers for multi-venue results.

**HeatmapClickLayer.tsx** — Invisible React layer that:
- Derives `Map<venueId, VenueGroup>` from time-windowed events via `useMemo`
- Registers/cleans up `map.on('click')` via `useEffect`
- On click: calls `findNearbyVenues` → if results empty, does nothing; if results found, calls `onPause()` first then sets click state
- Clears popup state when `timePosition` changes (scrub = stale popup prevention)
- Clears popup state on unmount (mode switch cleanup)
- Renders `<Popup position={latlng}>` (not `<Marker><Popup>` — avoids Pitfall 1)

### Props Threaded

`referenceDate?: Date` added to `MapClientWrapperProps` and `MapClientProps`. `referenceDate.current` passed from `page.tsx` → `MapClientWrapper` → `MapClient` → `HeatmapClickLayer`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] react-leaflet Popup has no `onClose` prop**
- **Found during:** Task 1 TypeScript verification
- **Issue:** Plan specified `onClose={() => setClickState(null)}` on `<Popup>` but `PopupProps` extends `EventedProps` which uses `eventHandlers` map rather than direct callback props
- **Fix:** Changed to `eventHandlers={{ remove: () => setClickState(null) }}` — the `remove` Leaflet event fires when popup is removed from the map
- **Files modified:** src/components/map/HeatmapClickLayer.tsx
- **Commit:** cebe305

## Checkpoint Pending

Task 3 is a `checkpoint:human-verify` requiring visual confirmation of the click-through feature. Both auto tasks completed and committed successfully. Awaiting user verification before plan is finalized.

## Self-Check: PASSED

- HeatmapPopup.tsx: FOUND
- HeatmapClickLayer.tsx: FOUND
- SUMMARY.md: FOUND
- Commit cebe305: FOUND
- Commit dd2b258: FOUND
