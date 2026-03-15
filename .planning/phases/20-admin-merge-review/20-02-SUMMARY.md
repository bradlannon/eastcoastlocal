---
phase: 20-admin-merge-review
plan: 02
subsystem: admin-ui
tags: [nextjs, drizzle, tailwind, server-component, client-component, venue-dedup]

# Dependency graph
requires:
  - phase: 20-admin-merge-review
    plan: 01
    provides: mergePair and keepSeparate server actions, venueMergeCandidates table
  - phase: 18-venue-deduplication
    provides: venue_merge_candidates populated by dedup pipeline
provides:
  - Admin merge review page at /admin/merge-review
  - Side-by-side venue card UI with inline merge confirmation
  - Pending count badge on admin nav Merge Review link
affects:
  - src/app/admin/layout.tsx (converted to server component)
  - Admin nav: new Merge Review entry with orange badge

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Drizzle alias() for self-join on venues table (venue_a / venue_b)
    - Parallel count queries for tab badge counts
    - In-memory lookup maps for event/source counts (avoids per-row subqueries)
    - NavLinks extracted as client component so layout can be async server component
    - Inline confirmation pattern via useState(confirmingId) — no modal needed

key-files:
  created:
    - src/app/admin/merge-review/page.tsx
    - src/app/admin/merge-review/_components/MergeReviewList.tsx
    - src/app/admin/_components/NavLinks.tsx
  modified:
    - src/app/admin/layout.tsx

key-decisions:
  - "Drizzle alias used for venue self-join — alias(venues, 'venue_a') and alias(venues, 'venue_b') pattern from research"
  - "Event and source counts fetched with GROUP BY and collected into Map — avoids N+1 and subquery complexity for small queues"
  - "NavLinks extracted as separate client component so AdminLayout can be async server component (no 'use client' in layout)"
  - "Inline merge confirmation uses local useState(confirmingId) — no server round-trip needed for UI state toggle"

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 20 Plan 02: Admin Merge Review UI Summary

**Admin merge review page with Drizzle self-join alias query, side-by-side venue cards with inline merge confirmation, tab filtering, and pending count badge extracted into server-component-compatible admin layout**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-15T20:56:59Z
- **Completed:** 2026-03-15T20:58:52Z
- **Tasks:** 2 auto + 1 checkpoint (pending human verification)
- **Files modified:** 4

## Accomplishments
- Built `page.tsx` server component using Drizzle `alias()` for venue self-join, parallel status count queries, and in-memory event/source count maps
- Built `MergeReviewList.tsx` client component with tab bar (Pending/Merged/Kept Separate), side-by-side venue cards, inline merge confirmation pattern, and keep-separate action
- Created `NavLinks.tsx` client component extracted from layout, with orange pending count badge on Merge Review link when count > 0
- Converted `layout.tsx` to async server component that fetches pending merge candidate count and passes it to `NavLinks`

## Task Commits

Each task was committed atomically:

1. **Task 1: Build merge review page and client component** - `e2f09c6`
2. **Task 2: Refactor admin layout for pending merge count badge** - `16bf998`

**Task 3 (checkpoint:human-verify):** Awaiting human verification

## Files Created/Modified
- `src/app/admin/merge-review/page.tsx` — Server component: alias self-join, parallel queries, event/source count maps, MergeReviewList render
- `src/app/admin/merge-review/_components/MergeReviewList.tsx` — Client component: tabs, side-by-side VenueCard, inline merge confirm, keep-separate form
- `src/app/admin/_components/NavLinks.tsx` — New client component: active link detection, Merge Review badge, logout button
- `src/app/admin/layout.tsx` — Converted to async server component: fetches pending count, renders NavLinks

## Decisions Made
- **Drizzle alias self-join**: Used `alias(venues, 'venue_a')` and `alias(venues, 'venue_b')` with `innerJoin` — matches research guidance
- **In-memory count maps**: Collected all venue IDs from result set, ran two GROUP BY queries, built Maps — simpler than subqueries for expected small queue sizes
- **NavLinks extraction**: Required to allow layout to be a server component (layouts with `usePathname` must be client components; moving that hook into NavLinks solves the conflict)
- **Inline confirmation with useState**: `confirmingId` state tracks which candidate is in confirm mode — clean, no modal needed

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/app/admin/merge-review/page.tsx
- FOUND: src/app/admin/merge-review/_components/MergeReviewList.tsx
- FOUND: src/app/admin/_components/NavLinks.tsx
- FOUND: src/app/admin/layout.tsx (modified)
- FOUND: commit e2f09c6
- FOUND: commit 16bf998

---
*Phase: 20-admin-merge-review*
*Completed: 2026-03-15*
