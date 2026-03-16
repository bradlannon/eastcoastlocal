---
phase: 30-archival
plan: 02
subsystem: admin ui, api
tags: [nextjs, drizzle, tailwind, pagination, admin]

# Dependency graph
requires:
  - phase: 29-schema-foundation
    provides: archived_at column on events table (TIMESTAMPTZ)
provides:
  - Paginated GET /api/admin/archived endpoint returning archived events with venue join
  - Admin page at /admin/archived with table, pagination controls, and empty state
  - Loading skeleton for archived admin page
  - "Archived" nav link in admin sidebar (NavLinks.tsx)
affects: [30-archival, 32-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server component with async searchParams (Next.js 15+ pattern) for paginated admin pages
    - Parallel Promise.all for data + count queries in same server component
    - Drizzle isNotNull() filter for soft-delete/archive pattern

key-files:
  created:
    - src/app/api/admin/archived/route.ts
    - src/app/api/admin/archived/route.test.ts
    - src/app/admin/archived/page.tsx
    - src/app/admin/archived/loading.tsx
  modified:
    - src/app/admin/_components/NavLinks.tsx

key-decisions:
  - "Server component queries DB directly (same pattern as discovery/merge-review pages) rather than fetching from /api/admin/archived"
  - "PAGE_SIZE=50 matches plan spec; Previous/Next links use ?page=N searchParams"

patterns-established:
  - "Admin list page: server component + parallel data/count queries + Tailwind table + Previous/Next pagination"

requirements-completed: [ARCH-05]

# Metrics
duration: 12min
completed: 2026-03-16
---

# Phase 30 Plan 02: Admin Archived Events Tab Summary

**Read-only paginated admin tab at /admin/archived showing soft-archived events with Drizzle isNotNull filter, venue join, and Previous/Next pagination**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-16T21:38:33Z
- **Completed:** 2026-03-16T21:50:00Z
- **Tasks:** 1 auto (Task 2 is checkpoint:human-verify)
- **Files modified:** 5

## Accomplishments

- GET /api/admin/archived endpoint with pagination metadata (events, page, totalPages, total)
- Admin server component page at /admin/archived with table sorted by archived_at desc
- Empty state, loading skeleton, and disabled Previous/Next when at boundaries
- "Archived" nav link added to admin sidebar between Merge Review and Settings

## Task Commits

Each task was committed atomically:

1. **RED — Failing tests** - `d49026a` (test)
2. **GREEN — Implementation** - `0df9e4e` (feat)

**Plan metadata:** (docs commit — pending)

_Note: TDD tasks have test commit + feat commit_

## Files Created/Modified

- `src/app/api/admin/archived/route.ts` - Paginated GET endpoint with isNotNull filter and venue innerJoin
- `src/app/api/admin/archived/route.test.ts` - 5 tests covering pagination, offset, empty state, 500 error
- `src/app/admin/archived/page.tsx` - Server component with table, pagination controls, empty state
- `src/app/admin/archived/loading.tsx` - Animate-pulse skeleton matching other admin loading states
- `src/app/admin/_components/NavLinks.tsx` - Added "Archived" entry before Settings

## Decisions Made

- Server component queries DB directly (same pattern as existing admin pages) rather than calling the API route — avoids unnecessary HTTP round-trip in Next.js server components
- PAGE_SIZE = 50 per plan spec

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Archived tab is complete and build passes
- Task 2 (checkpoint:human-verify) requires visual confirmation in browser at /admin/archived
- After verification, phase 30 plans 03+ can proceed (archival cron, etc.)

---
*Phase: 30-archival*
*Completed: 2026-03-16*
