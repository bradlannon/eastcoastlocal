---
phase: 19-ux-polish-source-attribution
plan: 01
subsystem: ui
tags: [react, nextjs, nuqs, svg, timelapse, map, category-filter]

# Dependency graph
requires:
  - phase: 18-venue-deduplication
    provides: venue data with lat/lng coordinates used by flyTo behavior
provides:
  - Map-pin SVG icon affordance on EventCard for venues with coordinates
  - CategoryChipsRow component for timelapse overlay category filtering
  - Timelapse mode now defaults to showing pins instead of heatmap
affects: [20-admin-merge-review, any phase touching MapClient or EventCard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - nuqs useQueryState for URL-driven category filter without prop drilling
    - group/group-hover Tailwind pattern for parent-hover child color change
    - backdrop-blur overlay row pattern for map overlay UI rows

key-files:
  created:
    - src/components/events/CategoryChipsRow.tsx
  modified:
    - src/components/events/EventCard.tsx
    - src/components/map/MapClient.tsx

key-decisions:
  - "Map-pin icon is purely visual affordance — no click handler added, whole-card click already triggers flyTo"
  - "CategoryChipsRow reads/writes nuqs URL state directly — no prop drilling through MapClient or page.tsx"
  - "Timelapse default inverted to show pins by default — heatmap toggled on demand (post-checkpoint fix)"
  - "Category chip clicks do not pause timelapse playback — heatmap and sidebar filter live"

patterns-established:
  - "Timelapse overlay: flex-col gap-2 column with category row above TimelineBar"
  - "Chip active state: bg-[#E85D26] text-white border-[#E85D26] (matches EventFilters)"
  - "Map overlay glass row: backdrop-blur-md bg-white/70 rounded-xl shadow-lg px-3 py-2"

requirements-completed: [UX-01, UX-02]

# Metrics
duration: ~15min
completed: 2026-03-15
---

# Phase 19 Plan 01: UX Polish — Map-Pin Icon and Timelapse Category Chips Summary

**Map-pin SVG icon on EventCard (gray-to-orange on hover) plus CategoryChipsRow component wired into timelapse overlay with live category filtering via nuqs URL state**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-15
- **Completed:** 2026-03-15
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 3

## Accomplishments

- EventCard now shows a 12px map-pin SVG icon (gray default, orange on group hover) on cards where the venue has lat/lng coordinates — purely visual, no behavior change to existing flyTo click
- New CategoryChipsRow component uses nuqs `useQueryState('category')` to filter timelapse heatmap and sidebar live during playback, with an event count badge and chip styling matching EventFilters
- Timelapse mode default inverted post-checkpoint: pins visible by default, heatmap toggled on demand

## Task Commits

Each task was committed atomically:

1. **Task 1: Add map-pin icon to EventCard and create CategoryChipsRow** - `4e91ef9` (feat)
2. **Task 2: Wire CategoryChipsRow into timelapse overlay in MapClient** - `0011e64` (feat)
3. **Task 3: Checkpoint approved (visual verify)** - approved, no code commit
4. **Post-checkpoint: Invert timelapse default — pins visible by default** - `06ab9e1` (fix)

## Files Created/Modified

- `src/components/events/CategoryChipsRow.tsx` - New standalone component: event count badge + category chips with nuqs URL state, backdrop-blur overlay styling
- `src/components/events/EventCard.tsx` - Added 12px map-pin SVG icon (conditional on venue.lat/lng, group-hover orange)
- `src/components/map/MapClient.tsx` - Wired CategoryChipsRow above TimelineBar in timelapse overlay block; inverted showPins default

## Decisions Made

- Map-pin icon is visual affordance only — the whole-card click already handles flyTo, no new click handler added
- CategoryChipsRow reads/writes nuqs URL state directly (`useQueryState('category')`) — no prop drilling needed because the category filter chain in page.tsx already reads from the URL param
- Chip clicks do not pause timelapse playback — live filtering during playback was the explicit requirement
- Post-checkpoint: timelapse defaults to showing pins because that's the more useful default for users entering timelapse mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Post-Checkpoint] Inverted timelapse default from heatmap to pins**
- **Found during:** Post-checkpoint user review
- **Issue:** Timelapse mode was defaulting to heatmap display; user preferred pins as the default with heatmap as opt-in
- **Fix:** Inverted the `showPins` default logic in MapClient so pins are shown by default
- **Files modified:** src/components/map/MapClient.tsx
- **Verification:** User approved in browser
- **Committed in:** 06ab9e1

---

**Total deviations:** 1 auto-fixed (post-checkpoint UX preference inversion)
**Impact on plan:** UX improvement; no scope creep, no behavior regression.

## Issues Encountered

None — plan executed cleanly. TypeScript compiled without errors on both task completions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UX affordances for map navigation and timelapse filtering are complete
- Phase 19-02 (event_sources schema and source attribution) was already completed prior to this plan
- Phase 20 (Admin Merge Review) is the next planned phase

---
*Phase: 19-ux-polish-source-attribution*
*Completed: 2026-03-15*
