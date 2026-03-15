---
phase: 11-admin-dashboard
plan: 01
subsystem: ui
tags: [nextjs, tailwind, drizzle-orm, server-components, dashboard]

requires:
  - phase: 10-admin-auth
    provides: Admin layout shell, session-protected /admin routes, logout endpoint

provides:
  - Admin dashboard at /admin with live stat cards and source health table
  - RefreshButton client component for in-place data reload
  - Loading skeleton for /admin route
  - Nav links (Dashboard / Venues / Discovery) in admin layout

affects: [12-admin-venues, 13-admin-discovery]

tech-stack:
  added: []
  patterns:
    - "Server component with force-dynamic for live DB reads, Promise.all for parallel queries"
    - "Client RefreshButton using router.refresh() — no full navigation, just RSC re-fetch"
    - "Relative time helper defined inline in page file (not extracted to util module)"
    - "Failures-first sort via SQL CASE expression in Drizzle orderBy"

key-files:
  created:
    - src/app/admin/page.tsx
    - src/app/admin/_components/RefreshButton.tsx
    - src/app/admin/loading.tsx
  modified:
    - src/app/admin/layout.tsx

key-decisions:
  - "Inline relativeTime helper in page.tsx — no separate util file per plan spec"
  - "Nav links added to center of layout header: title left, nav center, logout right"
  - "Failures sort first via SQL CASE (0=failure, 1=pending, 2=success) in Drizzle orderBy"

patterns-established:
  - "Admin page pattern: export const dynamic = 'force-dynamic' + Promise.all for parallel DB reads"
  - "Status badge helper returns JSX with conditional Tailwind classes per status string"

requirements-completed: [DASH-01, DASH-02]

duration: 12min
completed: 2026-03-15
---

# Phase 11 Plan 01: Admin Dashboard Summary

**Admin dashboard with 4 live stat cards, failures-first source health table, RefreshButton, loading skeleton, and Dashboard/Venues/Discovery nav links**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-15T02:03:39Z
- **Completed:** 2026-03-15T02:15:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Dashboard page queries 5 DB aggregates in parallel (venues, active sources, pending discoveries, last scrape time, source health rows)
- Source health table sorts failures to top via SQL CASE expression, disabled rows appear muted (opacity-50)
- Last Scrape stat card turns amber (text-amber-600) when most recent scrape is >24h old or never run
- Loading skeleton matches dashboard card/table layout with animate-pulse shimmer
- Admin layout updated with centered nav links (Dashboard / Venues / Discovery) ready before those pages exist

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard page with stat cards and source health table** - `0f16643` (feat)
2. **Task 2: Admin nav links and loading skeleton** - `ea5a8da` (feat)

**Plan metadata:** (docs commit — see final commit hash)

## Files Created/Modified

- `src/app/admin/page.tsx` - Server component with 4 stat cards and source health table, force-dynamic, parallel DB queries
- `src/app/admin/_components/RefreshButton.tsx` - Client component with router.refresh() and animate-spin icon
- `src/app/admin/loading.tsx` - Skeleton loading state: 4 card placeholders and 5-row table skeleton with animate-pulse
- `src/app/admin/layout.tsx` - Added Dashboard/Venues/Discovery nav links centered in header

## Decisions Made

- Used inline `relativeTime` helper in page.tsx rather than a separate util module (per plan spec)
- Nav layout: title left, nav links center, logout right — clean three-column flex layout
- SQL CASE in Drizzle orderBy for failures-first sort: `CASE WHEN status = 'failure' THEN 0 WHEN status = 'pending' THEN 1 ELSE 2 END`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in test files (route.test.ts, seed.test.ts, filter-utils.test.ts, promote-source.test.ts, timelapse-utils.test.ts) were present before this plan. None are in admin files. Build succeeds normally.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Dashboard complete and functional at /admin
- Nav links pre-wired to /admin/venues and /admin/discovery (pages not yet created — will be Phase 12 and 13)
- RefreshButton pattern reusable in future admin pages

---
*Phase: 11-admin-dashboard*
*Completed: 2026-03-15*

## Self-Check: PASSED

- src/app/admin/page.tsx: FOUND
- src/app/admin/_components/RefreshButton.tsx: FOUND
- src/app/admin/loading.tsx: FOUND
- src/app/admin/layout.tsx: FOUND
- .planning/phases/11-admin-dashboard/11-01-SUMMARY.md: FOUND
- Commit 0f16643: FOUND
- Commit ea5a8da: FOUND
