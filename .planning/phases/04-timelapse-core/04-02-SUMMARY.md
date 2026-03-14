---
phase: 04-timelapse-core
plan: "02"
subsystem: ui
tags: [leaflet, leaflet.heat, react-leaflet, heatmap, map, timelapse]

# Dependency graph
requires:
  - phase: 04-timelapse-core/04-01
    provides: timelapse-utils.ts with HeatPoint type and pure utility functions

provides:
  - leaflet.heat@0.2.0 installed and SSR-safe
  - HeatmapLayer.tsx — imperative useMap + leaflet.heat wrapper with full lifecycle management
  - ModeToggle.tsx — floating icon button with MapMode type export

affects:
  - 04-timelapse-core/04-03 (HomeContent wiring — imports HeatmapLayer and ModeToggle)
  - 04-timelapse-core/04-04 (prop threading through MapClient and MapClientWrapper)

# Tech tracking
tech-stack:
  added:
    - leaflet.heat@0.2.0
    - "@types/leaflet.heat@0.2.5"
  patterns:
    - Imperative Leaflet plugin wrapping via useMap + dual-useEffect (create/update)
    - Floating map overlay button following GeolocationButton pattern

key-files:
  created:
    - src/components/map/HeatmapLayer.tsx
    - src/components/map/ModeToggle.tsx
  modified:
    - package.json (added leaflet.heat + @types/leaflet.heat)

key-decisions:
  - "HeatPoint type imported from timelapse-utils.ts rather than redefined in HeatmapLayer.tsx — single source of truth"
  - "@ts-expect-error removed — @types/leaflet.heat provides full type coverage for L.heatLayer, no suppression needed"
  - "ModeToggle positioned absolute top-4 right-4 z-[1000] inside outer div.relative (not inside MapContainer)"

patterns-established:
  - "Pattern: Imperative Leaflet plugin wrapping — first useEffect creates layer, cleanup calls map.removeLayer; second useEffect updates via setLatLngs keyed on [map, points, visible]"
  - "Pattern: Floating map button — absolute z-[1000] positioning inside div.relative wrapper, w-10 h-10 bg-white rounded-full shadow-md"

requirements-completed: [HEAT-01, HEAT-04, MODE-01, MODE-03]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 4 Plan 02: HeatmapLayer and ModeToggle Components Summary

**leaflet.heat@0.2.0 installed and SSR-safe; HeatmapLayer wraps it with dual-useEffect lifecycle (create/setLatLngs/removeLayer); ModeToggle is a floating top-right icon button — both ready for Plan 03 wiring**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T16:22:27Z
- **Completed:** 2026-03-14T16:25:38Z
- **Tasks:** 2
- **Files modified:** 3 (HeatmapLayer.tsx, ModeToggle.tsx, package.json)

## Accomplishments

- Installed leaflet.heat@0.2.0 and @types/leaflet.heat@0.2.5; SSR build gate passed immediately
- Created HeatmapLayer.tsx with proper dual-useEffect pattern: create/destroy lifecycle separate from data-update lifecycle using setLatLngs (no re-creation)
- Created ModeToggle.tsx with mode-aware icon (heatmap vs pin), accessible aria-labels, and GeolocationButton-mirroring styling

## Task Commits

Each task was committed atomically:

1. **Task 1: Install leaflet.heat and create HeatmapLayer component** - `eff9775` (feat)
2. **Task 2: Create ModeToggle floating button component** - `01a674a` (feat)

## Files Created/Modified

- `src/components/map/HeatmapLayer.tsx` — Imperative leaflet.heat wrapper; useMap + dual-useEffect; imports HeatPoint from timelapse-utils; returns null
- `src/components/map/ModeToggle.tsx` — Floating top-right button; heatmap/pin SVG icons; exports MapMode type
- `package.json` — Added leaflet.heat (dep) and @types/leaflet.heat (devDep)

## Decisions Made

- Imported `HeatPoint` from `timelapse-utils.ts` rather than re-declaring in `HeatmapLayer.tsx` — avoids type duplication since Plan 01 already exports it
- Removed `@ts-expect-error` directive — `@types/leaflet.heat` provides full typing for `L.heatLayer`, so the directive would fail TypeScript's unused-directive check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused @ts-expect-error directive**
- **Found during:** Task 1 (HeatmapLayer creation + next build verification)
- **Issue:** Plan specified `@ts-expect-error` for `L.heatLayer`, but `@types/leaflet.heat@0.2.5` provides full type declarations — the directive becomes an error itself in strict TypeScript ("Unused '@ts-expect-error' directive")
- **Fix:** Removed the `@ts-expect-error` comment; `L.heatLayer` is properly typed by `@types/leaflet.heat`
- **Files modified:** src/components/map/HeatmapLayer.tsx
- **Verification:** `next build` passed cleanly after removal
- **Committed in:** eff9775 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Import HeatPoint from timelapse-utils instead of redefining**
- **Found during:** Task 1 (initial draft included local HeatPoint interface)
- **Issue:** Plan 01 had already created `timelapse-utils.ts` which exports `HeatPoint`; re-declaring created type duplication
- **Fix:** Replaced local `export interface HeatPoint` with `import type { HeatPoint } from '@/lib/timelapse-utils'`
- **Files modified:** src/components/map/HeatmapLayer.tsx
- **Verification:** TypeScript compilation succeeded; `next build` passed
- **Committed in:** eff9775 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- HeatmapLayer and ModeToggle are fully self-contained and ready for Plan 03 (HomeContent wiring)
- Both components export clean interfaces: `HeatmapLayer` (default) with `HeatPoint` from timelapse-utils; `ModeToggle` (default) + `MapMode` type
- SSR gate confirmed passing — Plan 03 can proceed directly to HomeContent state wiring without re-verifying SSR
- Pre-existing seed.test.ts failure (unrelated venue lookup) remains in test suite — not introduced by this plan

---
*Phase: 04-timelapse-core*
*Completed: 2026-03-14*
