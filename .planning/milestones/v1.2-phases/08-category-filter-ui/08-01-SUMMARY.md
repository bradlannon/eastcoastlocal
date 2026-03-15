---
phase: 08-category-filter-ui
plan: "01"
subsystem: filter-ui
tags: [filtering, category, chips, badges, url-persistence]
dependency_graph:
  requires: [src/lib/categories.ts, src/lib/db/schema.ts, src/lib/filter-utils.ts]
  provides: [category filter chip row, filterByCategory function, category badges]
  affects: [src/app/page.tsx, src/components/events/EventFilters.tsx, src/components/events/EventCard.tsx, src/app/event/[id]/page.tsx]
tech_stack:
  added: []
  patterns: [TDD red-green, nuqs URL state, useMemo filter chain]
key_files:
  created: []
  modified:
    - src/lib/filter-utils.ts
    - src/lib/filter-utils.test.ts
    - src/app/page.tsx
    - src/components/events/EventFilters.tsx
    - src/components/events/EventCard.tsx
    - src/app/event/[id]/page.tsx
decisions:
  - "Category chip row placed between date chips and province dropdown in EventFilters — matches plan spec"
  - "filterByCategory uses e.events.event_category === category — strict equality matches DB enum values"
  - "Category badges use orange-50/orange-700 color scheme — visually distinct from gray price badge"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-14"
  tasks_completed: 3
  files_modified: 6
---

# Phase 08 Plan 01: Category Filter UI Summary

**One-liner:** Category chip row with URL persistence filters map + sidebar by event type, with badges on cards and detail pages.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add filterByCategory with tests | 0addf20 | Done |
| 2 | Wire category filter into page.tsx and EventFilters.tsx | 5d24f9b | Done |
| 3 | Add category badges to EventCard and event detail page | b8906d5 | Done |

## What Was Built

### filterByCategory (Task 1 — TDD)
Pure function added to `src/lib/filter-utils.ts` that filters `EventWithVenue[]` by `event_category` field. Follows the same null-passthrough contract as `filterByProvince`. 5 unit tests added covering: null returns all, specific category match, different category match, nonexistent category returns empty, empty input returns empty.

### Category filter wired into app (Task 2)
- `useQueryState('category')` added in `HomeContent` — reads `?category=` from URL
- Filter chain in `useMemo` extended: both timelapse and cluster branches apply `filterByCategory` after `filterByProvince`
- Heatmap intensity in timelapse mode now reflects category filter (`computeVenueHeatPoints(categoryFiltered)`)
- `getEmptyMessage()` updated with combined filter check and standalone category message
- `CATEGORY_META` and `EventCategory` imported for label lookup

### Category chip row (Task 2 — EventFilters.tsx)
- "All" chip + 8 category chips (Live Music, Comedy, Theatre, Arts, Sports, Festival, Community, Other)
- Active chip uses `bg-[#E85D26]` orange — matches existing date chip style
- Chips use `overflow-x-auto no-scrollbar` for horizontal scroll on mobile
- `hasFilters` and `handleClearFilters` updated to include category
- `useEventFilters` hook updated to expose `category`

### Category badges (Task 3)
- `EventCard`: orange-50/orange-700 badge in date+time row after price badge
- Event detail page: orange-50/orange-700 rounded-full badge after price badge
- Back-link from detail page preserves `?category=` parameter alongside `when` and `province`

## Verification Results

1. `npx jest filter-utils` — 21 tests pass (16 pre-existing + 5 new)
2. `npm run build` (Task 2) — compiled successfully, no TypeScript errors
3. `npm run build` (Task 3) — compiled successfully, no TypeScript errors
4. `npx jest` (full suite) — 139 pass, 1 pre-existing failure (seed.test.ts "Ship Pub" — deferred, out of scope)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files exist:
- src/lib/filter-utils.ts — FOUND (filterByCategory exported)
- src/lib/filter-utils.test.ts — FOUND (filterByCategory tests included)
- src/app/page.tsx — FOUND (filterByCategory in filter chain)
- src/components/events/EventFilters.tsx — FOUND (CATEGORY_META chip row)
- src/components/events/EventCard.tsx — FOUND (event_category badge)
- src/app/event/[id]/page.tsx — FOUND (category badge + back-link)

Commits exist:
- 0addf20 — feat(08-01): add filterByCategory with unit tests
- 5d24f9b — feat(08-01): wire category filter into page.tsx and EventFilters.tsx
- b8906d5 — feat(08-01): add category badges to EventCard and event detail page
