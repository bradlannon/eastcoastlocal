---
phase: 03-public-frontend
plan: 03
subsystem: filter-controls-and-interaction
tags: [nuqs, url-state, leaflet, geolocation, cross-highlight, click-to-pan, filters, mobile]
dependency_graph:
  requires:
    - src/lib/filter-utils.ts
    - src/lib/province-bounds.ts
    - src/components/map/MapClient.tsx
    - src/components/map/ClusterLayer.tsx
    - src/app/page.tsx
  provides:
    - date/province filter chips with URL state
    - province auto-zoom
    - geolocation button
    - hover cross-highlight
    - click-to-pan with popup open
    - friendly empty state messages
  affects:
    - src/app/page.tsx (filter chain, Suspense wrapper)
tech_stack:
  added: []
  patterns:
    - nuqs useQueryState for shareable URL filter state
    - useMap() hook components as MapContainer children (side-effect pattern)
    - markersRef pattern for imperative popup open after flyTo
    - Suspense boundary required for nuqs useSearchParams in Next.js static prerender
key_files:
  created:
    - src/components/events/EventFilters.tsx
    - src/components/map/GeolocationButton.tsx
    - src/components/map/MapViewController.tsx
  modified:
    - src/app/page.tsx
    - src/components/events/EventCard.tsx
    - src/components/events/EventList.tsx
    - src/components/map/ClusterLayer.tsx
    - src/components/map/MapClient.tsx
    - src/components/map/MapClientWrapper.tsx
decisions:
  - Suspense boundary wrapping HomeContent required — nuqs useQueryState calls useSearchParams internally, which Next.js requires inside Suspense for static prerendering
  - markersRef (useRef Map<number, L.Marker>) populated by ClusterLayer via ref callback, consumed by MapViewController to open popup after flyTo moveend event
  - Card click pans map + switches to map tab on mobile; performer name link and View Details link navigate to detail page (stopPropagation used)
  - flyToTarget cleared after 2s timeout to prevent re-trigger on re-render
metrics:
  duration: 4
  completed: 2026-03-14
  tasks_completed: 1
  files_created: 3
  files_modified: 6
  tests_added: 0
  total_tests: 77
---

# Phase 3 Plan 03: Filter Controls, Geolocation, and Map-List Interaction Summary

**One-liner:** Date chips and province dropdown with nuqs URL state, geolocation button, province fitBounds auto-zoom, hover cross-highlight with enlarged pulsing pin, and click-to-pan with popup open via markersRef pattern.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Filter controls, geolocation, cross-highlight, click-to-pan | 8862ac0 | EventFilters.tsx (new), GeolocationButton.tsx (new), MapViewController.tsx (new), ClusterLayer.tsx, MapClient.tsx, MapClientWrapper.tsx, EventCard.tsx, EventList.tsx, page.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Suspense boundary required for nuqs URL state in Next.js build**
- **Found during:** Task 1 build verification
- **Issue:** `useQueryState` from nuqs calls `useSearchParams` internally. Next.js 16 requires all `useSearchParams` usage to be wrapped in a `<Suspense>` boundary for static prerendering. Build failed with: "useSearchParams() should be wrapped in a suspense boundary at page "/"".
- **Fix:** Renamed inner component to `HomeContent`, added a `Home` default export that wraps `<HomeContent />` in `<Suspense fallback={...}>`.
- **Files modified:** src/app/page.tsx
- **Commit:** 8862ac0

## Verification

- `npx tsc --noEmit` passes with no errors
- `npm test` passes: 77/77 tests (11 test suites)
- `npm run build` succeeds — all 6 routes compile, `/` renders as Static
- EventFilters: date chips toggle, province dropdown present, clear filters button conditional on active filter
- GeolocationButton: crosshair SVG rendered inside MapContainer, flyTo on success
- MapViewController: province fitBounds effect, flyTo + moveend popup open
- ClusterLayer: markersRef registration via ref callback, highlighted icon scaling
- EventCard: onHover triggers setHighlightedVenueId, onClick triggers flyToTarget
- EventList: passes onHoverVenue and onClickVenue through to EventCard
- page.tsx: full filter chain (filterByDateRange -> filterByProvince -> filterByBounds), friendly empty state messages

## Awaiting Human Verification

Task 2 is a `checkpoint:human-verify` — human must confirm all 14 visual/functional items in a browser at http://localhost:3000.

## Self-Check: PASSED
