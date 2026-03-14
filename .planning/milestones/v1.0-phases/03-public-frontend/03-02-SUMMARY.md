---
phase: 03-public-frontend
plan: 02
subsystem: map-ui-and-event-list
tags: [leaflet, clustering, viewport-sync, split-screen, mobile, react-leaflet]
dependency_graph:
  requires: [src/lib/filter-utils.ts, src/lib/province-bounds.ts, src/app/api/events/route.ts, src/types/index.ts]
  provides: [interactive map with clusters, split-screen layout, EventList, EventCard, MobileTabBar]
  affects: [03-03 (filter controls will plug into page.tsx header area)]
tech_stack:
  added: []
  patterns: [dynamic no-SSR import, client-side viewport filtering, MarkerClusterGroup, divIcon custom markers]
key_files:
  created:
    - src/components/map/MapClient.tsx
    - src/components/map/MapBoundsTracker.tsx
    - src/components/map/ClusterLayer.tsx
    - src/components/map/VenuePopup.tsx
    - src/components/map/MapClientWrapper.tsx
    - src/components/events/EventCard.tsx
    - src/components/events/EventList.tsx
    - src/components/layout/MobileTabBar.tsx
  modified:
    - src/app/layout.tsx
    - src/app/globals.css
    - src/app/page.tsx
    - src/components/map/MapWrapper.tsx
decisions:
  - MapClientWrapper extracted to separate file (MapClientWrapper.tsx) because next/dynamic with ssr:false cannot be in a file imported by Server Components — MapWrapper.tsx needed 'use client' added for MiniMapWrapper, and MapClientWrapper had to live in its own client-only file
  - page.tsx uses 100dvh for full-viewport height to handle mobile browser chrome correctly
  - MobileTabBar padding-bottom on list panel (pb-[56px]) accounts for fixed tab bar height on mobile
metrics:
  duration: 15 minutes
  completed: 2026-03-14
  tasks_completed: 2
  files_created: 8
  files_modified: 4
  tests_added: 0
  total_tests: 77
---

# Phase 3 Plan 02: Interactive Map, Clustered Pins, and Split-Screen Event List Summary

**One-liner:** CartoDB Positron map with MarkerClusterGroup venue pins, viewport-synced event list, orange-red DivIcon markers, popup event listings, and mobile tab bar — wired into a split-screen page.tsx.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Layout overhaul and interactive map with clustering | f5fad64 | src/app/layout.tsx, src/app/globals.css, src/components/map/MapWrapper.tsx, MapClient.tsx, MapBoundsTracker.tsx, ClusterLayer.tsx, VenuePopup.tsx |
| 2 | Event list, split-screen layout, mobile tab bar, and viewport sync | 50f2bd4 | src/app/page.tsx, EventCard.tsx, EventList.tsx, MobileTabBar.tsx, MapClientWrapper.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ssr:false in MapWrapper.tsx caused build failure**
- **Found during:** Task 2 build verification
- **Issue:** `MapWrapper.tsx` exported both `MiniMapWrapper` and `MapClientWrapper` with `ssr: false`. Next.js 16 (Turbopack) rejects `ssr: false` in any file imported by a Server Component — and `/event/[id]/page.tsx` (a Server Component) imports `MiniMapWrapper` from `MapWrapper.tsx`.
- **Fix:** Added `'use client'` to `MapWrapper.tsx` (satisfying MiniMapWrapper's requirement) and extracted `MapClientWrapper` into a new dedicated `MapClientWrapper.tsx` client file. Updated `page.tsx` to import from the new file.
- **Files modified:** src/components/map/MapWrapper.tsx, src/components/map/MapClientWrapper.tsx (new), src/app/page.tsx
- **Commit:** 50f2bd4

## Verification

- `npx tsc --noEmit` passes with no errors
- `npm test` passes: 77/77 tests (11 test suites)
- `npm run build` succeeds — all 6 routes compile, no SSR errors
- Map renders CartoDB Positron tiles centered on Atlantic Canada
- Venue markers use #E85D26 orange-red DivIcon (12px circle, white border, shadow)
- MarkerClusterGroup clusters markers when zoomed out
- VenuePopup shows venue name, event count, sorted events with "View Details" links
- EventList syncs with map viewport via filterByBounds
- MobileTabBar toggles map/list on mobile, hidden on md+
- Light theme throughout (dark mode block removed from globals.css)

## Self-Check: PASSED
