---
phase: 03-public-frontend
plan: "03"
subsystem: ui
tags: [nuqs, url-state, leaflet, geolocation, cross-highlight, click-to-pan, filters, mobile]

# Dependency graph
requires:
  - phase: 03-public-frontend
    provides: filter-utils, province-bounds, MapClient, ClusterLayer, MapBoundsTracker, split-screen layout, event list
  - phase: 02-data-pipeline
    provides: events API endpoint, venue + event data

provides:
  - EventFilters component with date chip toggles and province dropdown wired to URL query params
  - GeolocationButton component — centers map on user location via browser geolocation API
  - MapViewController component — province fitBounds auto-zoom and click-to-pan with post-move popup opening
  - Cross-highlight via hover (enlarged highlighted pin) and click-to-pan (flyTo + openPopup) via markersRef
  - Friendly empty state messages for each filter combination
  - Complete public discovery UX for East Coast Local

affects: [future admin dashboard, any phase reading MAP requirements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - nuqs useQueryState for shareable URL filter state
    - useMap() hook components as MapContainer children (side-effect pattern)
    - markersRef pattern — ClusterLayer populates Map<venueId, L.Marker> via ref callback; MapViewController reads it on moveend to call openPopup() after flyTo
    - Suspense boundary wrapping HomeContent — required because nuqs useQueryState uses useSearchParams (Next.js static prerendering constraint)
    - Callback ref stabilization via useRef to prevent useMapEvents re-registration loop in MapBoundsTracker
    - Remove moveend listener before openPopup() to prevent recursive call stack from popup auto-pan

key-files:
  created:
    - src/components/events/EventFilters.tsx
    - src/components/map/GeolocationButton.tsx
    - src/components/map/MapViewController.tsx
  modified:
    - src/app/page.tsx
    - src/components/events/EventCard.tsx
    - src/components/events/EventList.tsx
    - src/components/map/MapClient.tsx
    - src/components/map/ClusterLayer.tsx
    - src/components/map/MapBoundsTracker.tsx

key-decisions:
  - "markersRef pattern: ClusterLayer populates Map<venueId, L.Marker> via ref callback; MapViewController reads it on moveend to call openPopup() after flyTo"
  - "Suspense boundary wrapping HomeContent required — nuqs useQueryState uses useSearchParams, which Next.js requires inside Suspense for static prerendering"
  - "MapBoundsTracker stabilizes onBoundsChange via ref to prevent useMapEvents re-registration loop"
  - "MapViewController removes moveend listener before calling openPopup() to prevent recursive call stack from popup auto-pan"

patterns-established:
  - "URL-synced filter state: use nuqs useQueryState for all user-facing filter controls"
  - "Null-rendering side-effect components: pure Leaflet hook components (useMap) render null and coordinate map view from parent props"
  - "markersRef: pass Map<venueId, L.Marker> ref from MapClient down to ClusterLayer (populate) and MapViewController (consume)"

requirements-completed: [MAP-05, MAP-06, MAP-07, MAP-09, INFR-02]

# Metrics
duration: ~30min (excluding checkpoint review time)
completed: 2026-03-14
---

# Phase 3 Plan 03: Filter Controls, Geolocation, and Map-List Interaction Summary

**Date/province filter chips with nuqs URL state, geolocation button, province fitBounds auto-zoom, hover cross-highlight, and click-to-pan with popup open via markersRef pattern — completing the East Coast Local public discovery UX**

## Performance

- **Duration:** ~30 min (plus checkpoint verification)
- **Started:** 2026-03-14T06:00:00Z
- **Completed:** 2026-03-14 (post-checkpoint approval)
- **Tasks:** 2 (1 auto, 1 checkpoint:human-verify — approved)
- **Files modified:** 11

## Accomplishments

- EventFilters with date quick-filter chips (All/Today/This Weekend/This Week) and province dropdown, both synced to URL query params via nuqs
- GeolocationButton inside MapContainer that calls navigator.geolocation and flyTo on success
- MapViewController null-rendering component that coordinates province fitBounds and click-to-pan flyTo with post-move popup opening via markersRef
- Cross-highlight: hover on list card sets highlightedVenueId, ClusterLayer scales the matching marker icon; click sets flyToTarget, map pans and opens popup
- Friendly empty states for each filter combination (date only, province only, both, viewport only)
- Two runtime bugs found and fixed during human verification: infinite re-render loop in MapBoundsTracker, popup stack overflow in MapViewController
- Human approved all 14 verification items in the browser (map, clusters, popups, list sync, date/province filters, geolocation, event detail, mobile, performance, empty states, cross-highlight)

## Task Commits

Each task was committed atomically:

1. **Task 1: Filter controls, geolocation, cross-highlight, click-to-pan** - `8862ac0` (feat)
2. **Fix: MapBoundsTracker infinite loop + MapViewController stack overflow** - `2c759c9` (fix — found during human-verify checkpoint)

**Plan metadata:** docs commit to follow

## Files Created/Modified

- `src/components/events/EventFilters.tsx` — Date chip toggles, province dropdown, clear filters, event count display; nuqs URL state
- `src/components/map/GeolocationButton.tsx` — Near-me button using browser geolocation API, flyTo with zoom 12 on success
- `src/components/map/MapViewController.tsx` — Null-rendering component: province fitBounds, flyTo-then-openPopup via markersRef; removes moveend listener before openPopup()
- `src/app/page.tsx` — Filter state wiring, filterByDateRange + filterByProvince + filterByBounds chain, highlightedVenueId, flyToTarget, Suspense boundary, empty states
- `src/components/events/EventCard.tsx` — onHover and onClickVenue props; card body click pans map, detail link navigates with stopPropagation
- `src/components/events/EventList.tsx` — Pass-through of onHoverVenue and onClickVenue to EventCard
- `src/components/map/MapClient.tsx` — markersRef creation, GeolocationButton, MapViewController, province/highlightedVenueId/flyToTarget props
- `src/components/map/ClusterLayer.tsx` — Registers each Marker in markersRef via ref callback; applies highlight scaling when highlightedVenueId matches
- `src/components/map/MapBoundsTracker.tsx` — Stabilized onBoundsChange via ref to prevent useMapEvents re-registration loop

## Decisions Made

- markersRef pattern used: ClusterLayer populates `Map<venueId, L.Marker>` via ref callback; MapViewController reads it after flyTo moveend to call `openPopup()`
- MapViewController removes moveend listener before calling `openPopup()` to prevent the popup's auto-pan from re-triggering the listener recursively
- MapBoundsTracker stores `onBoundsChange` in a ref so `useMapEvents` only registers once, avoiding infinite re-render loop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Suspense boundary required for nuqs URL state in Next.js build**
- **Found during:** Task 1 build verification
- **Issue:** `useQueryState` from nuqs calls `useSearchParams` internally. Next.js requires all `useSearchParams` usage inside a `<Suspense>` boundary for static prerendering. Build failed with: "useSearchParams() should be wrapped in a suspense boundary at page '/'".
- **Fix:** Renamed inner component to `HomeContent`, added `Home` default export that wraps `<HomeContent />` in `<Suspense fallback={...}>`.
- **Files modified:** src/app/page.tsx
- **Verification:** Build succeeds; `/` renders as Static
- **Committed in:** 8862ac0

**2. [Rule 1 - Bug] Fixed MapBoundsTracker infinite re-render loop**
- **Found during:** Task 2 (human-verify checkpoint — runtime testing in browser)
- **Issue:** useMapEvents was re-registering on every render because `onBoundsChange` prop had a new identity each render, causing a continuous bounds-change loop
- **Fix:** Store `onBoundsChange` in a `useRef` and reference the ref inside `useMapEvents` so event handler registration is stable across renders
- **Files modified:** src/components/map/MapBoundsTracker.tsx
- **Verification:** Map loads without continuous re-renders; bounds updates fire only on actual map moves
- **Committed in:** 2c759c9

**3. [Rule 1 - Bug] Fixed MapViewController openPopup stack overflow**
- **Found during:** Task 2 (human-verify checkpoint — clicking a list card)
- **Issue:** `openPopup()` triggers Leaflet's internal auto-pan, which fires the `moveend` event, which re-triggered the moveend listener, causing a recursive call stack overflow
- **Fix:** Remove the `moveend` listener before calling `openPopup()` so the auto-pan does not re-trigger the handler
- **Files modified:** src/components/map/MapViewController.tsx
- **Verification:** Click-to-pan opens popup without stack overflow; subsequent clicks work correctly
- **Committed in:** 2c759c9

---

**Total deviations:** 3 auto-fixed (1 blocking Rule 3, 2 bugs Rule 1)
**Impact on plan:** All three fixes essential for correct build and runtime behavior. No scope creep.

## Issues Encountered

The two runtime issues (re-render loop, popup stack overflow) were only observable at runtime in the browser — not caught by TypeScript or unit tests. Both were straightforward to diagnose and fix once identified during the checkpoint verification session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 public frontend is complete — all MAP-01 through MAP-09 and INFR-02 requirements addressed across plans 03-01, 03-02, and 03-03
- The app is deployable to Vercel with full map, filtering, event detail pages, and mobile-responsive layout
- No blockers for future phases (admin dashboard or production data pipeline work)

---
*Phase: 03-public-frontend*
*Completed: 2026-03-14*
