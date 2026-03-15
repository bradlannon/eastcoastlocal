---
phase: 13-discovery-review
plan: 01
subsystem: ui
tags: [nextjs, react, drizzle, tailwind, server-component, client-component]

# Dependency graph
requires:
  - phase: 12-venue-source-management
    provides: "Admin layout with active nav, venue/source table patterns, server action patterns"
  - phase: 09-source-discovery
    provides: "discovered_sources table with status, raw_context, discovery_method fields"
provides:
  - "/admin/discovery page with tab-filtered list of discovered source candidates"
  - "DiscoveryList client component with expandable rows and status tabs"
  - "Loading skeleton for discovery review page"
affects: [13-02-approve-reject]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server component page passes parallel-fetched candidates + counts to client component"
    - "Status tabs as Link components with searchParam-based filtering (full page re-fetch)"
    - "Expandable table rows via useState expandedId (one at a time)"
    - "Fragment wrapper for row+detail-row pairs to satisfy table structure"

key-files:
  created:
    - src/app/admin/discovery/page.tsx
    - src/app/admin/discovery/loading.tsx
    - src/app/admin/discovery/_components/DiscoveryList.tsx
  modified: []

key-decisions:
  - "Status tabs use Link (client nav) + searchParams — triggers server component re-render for fresh DB data on each tab"
  - "Counts fetched as three parallel count() queries rather than a single GROUP BY — simpler code, negligible perf difference at this scale"
  - "Fragment wrapper used for row pairs in tbody — required for valid HTML table structure with expandable detail rows"

patterns-established:
  - "Tab filtering pattern: Link to ?status=X → server component re-runs with new searchParam → fresh query"
  - "Inline row expansion: useState expandedId + conditional tr render below clicked row"

requirements-completed: [DISC-01, DISC-04]

# Metrics
duration: 8min
completed: 2026-03-15
---

# Phase 13 Plan 01: Discovery Review List Page Summary

**Filterable discovered-sources list at /admin/discovery with status tabs, expandable detail rows showing raw_context and discovery_method, and loading skeleton**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-15T04:13:05Z
- **Completed:** 2026-03-15T04:21:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Discovery review page at /admin/discovery with Pending/Approved/Rejected tab filtering
- Per-status counts shown in each tab label ("Pending (3)")
- Expandable rows showing raw_context, discovery_method, and discovered_at for each candidate
- Loading skeleton matching admin dashboard pattern (tab + table row placeholders)

## Task Commits

Each task was committed atomically:

1. **Task 1: Discovery list page with status filtering** - `7783d15` (feat)
2. **Task 2: DiscoveryList client component with tabs and expandable rows** - `9bf753b` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified
- `src/app/admin/discovery/page.tsx` - Server component; parallel DB queries for candidates + counts, passes to DiscoveryList
- `src/app/admin/discovery/loading.tsx` - Loading skeleton with tab and row placeholders
- `src/app/admin/discovery/_components/DiscoveryList.tsx` - Client component; tab navigation, expandable rows, empty state

## Decisions Made
- Status tabs use `Link` components pointing to `?status=X` — this triggers a full server component re-render giving fresh data on each tab switch
- Counts fetched via three parallel `count()` queries rather than a GROUP BY — simpler, and at this scale makes no difference
- Used `Fragment` wrapper for row + expanded-detail row pairs to keep valid `<tbody>` structure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in test files (route.test.ts, seed.test.ts, filter-utils.test.ts, timelapse-utils.test.ts, promote-source.test.ts) were present before this plan and are not related to new files. New discovery files compile cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- /admin/discovery list page is complete and functional
- Plan 02 can add Approve/Reject server actions — placeholder `<div className="flex gap-2 mt-3">` is already in DiscoveryList expanded row for the buttons
- `promoteSource()` in src/lib/scraper/promote-source.ts is ready to be called from a server action for approve flow

---
*Phase: 13-discovery-review*
*Completed: 2026-03-15*
