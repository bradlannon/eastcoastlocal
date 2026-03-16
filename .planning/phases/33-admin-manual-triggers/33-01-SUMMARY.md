---
phase: 33-admin-manual-triggers
plan: 01
subsystem: ui
tags: [next.js, react, tailwind, jest, admin, api-routes]

requires:
  - phase: 30-archival
    provides: archivePastEvents function used by archive trigger
  - phase: 27-admin-ui
    provides: admin dashboard page and session auth pattern

provides:
  - POST /api/admin/trigger/[job] route with session cookie auth
  - TriggerActions client component with scrape/discovery/archive buttons
  - discovery_runs rows inserted by manual triggers (same as cron routes)

affects:
  - admin dashboard UI
  - discovery_runs table (new rows from manual triggers)

tech-stack:
  added: []
  patterns:
    - Admin trigger route uses session cookie auth (not CRON_SECRET) for browser-initiated requests
    - Dynamic [job] route segment with async params (Next.js 15+ pattern)
    - Client component uses useRouter().refresh() to re-render server component stats after trigger
    - Discovery triggers insert discovery_runs rows identical to cron routes (dashboard updates)

key-files:
  created:
    - src/app/api/admin/trigger/[job]/route.ts
    - src/app/api/admin/trigger/[job]/route.test.ts
    - src/app/admin/_components/TriggerActions.tsx
  modified:
    - src/app/admin/page.tsx

key-decisions:
  - "Admin trigger route uses admin session cookie auth (verifyToken), not CRON_SECRET — cron secret stays server-only"
  - "Discovery manual triggers insert discovery_runs rows matching exact cron route pattern so Recent Discovery Runs table updates"
  - "TriggerActions uses shared runningJob state to disable all buttons during any running job (prevents double-submit)"
  - "30s warning toast shown for long-running jobs with 8s auto-dismiss on result"

patterns-established:
  - "Admin browser-triggered jobs: POST /api/admin/trigger/[job] with session auth"
  - "Discovery run logging: always insert discovery_runs row whether triggered by cron or admin"

requirements-completed:
  - TRIG-01
  - TRIG-02

duration: 3min
completed: 2026-03-16
---

# Phase 33 Plan 01: Admin Manual Triggers Summary

**POST /api/admin/trigger/[job] with session auth, TriggerActions component with spinner/toast/dropdown wired into admin dashboard, discovery triggers insert discovery_runs rows**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T23:05:07Z
- **Completed:** 2026-03-16T23:08:01Z
- **Tasks:** 2 of 3 (Task 3 is checkpoint:human-verify — awaiting manual verification)
- **Files modified:** 4

## Accomplishments
- POST API route at `/api/admin/trigger/[job]` authenticates via admin session cookie, dispatches to 8 job types, and inserts discovery_runs rows for all discovery variants
- TriggerActions client component with Run Scrape, Run Discovery (6-option dropdown), and Run Archive buttons — inline spinner, 30s warning, 8s auto-dismiss toast, router.refresh() on success
- 9 unit tests covering auth (401), all job dispatches, correct response shapes, error handling (500)
- TriggerActions inserted in admin/page.tsx between stat cards grid and Source Health section

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin trigger API route with tests** - `2e823cb` (feat)
2. **Task 2: TriggerActions component and dashboard wiring** - `112b536` (feat)

**Plan metadata:** (pending final commit)

_Note: Task 1 used TDD — tests written first (RED), then implementation (GREEN)._

## Files Created/Modified
- `src/app/api/admin/trigger/[job]/route.ts` - POST handler with session auth, dispatches scrape/archive/discover/discover-reddit/discover-places-* jobs, inserts discovery_runs for discover variants, export const maxDuration = 60
- `src/app/api/admin/trigger/[job]/route.test.ts` - 9 unit tests covering auth, dispatch, response shapes, error handling
- `src/app/admin/_components/TriggerActions.tsx` - Client component with 3 button groups, dropdown, spinner, toast (success/error/warning), auto-dismiss, router.refresh()
- `src/app/admin/page.tsx` - Added TriggerActions import and rendered between stat cards and Source Health

## Decisions Made
- Session cookie auth for admin triggers (not CRON_SECRET) — browser clients must not know the cron secret
- Discovery manual triggers insert discovery_runs rows using the same pattern as cron routes — ensures Recent Discovery Runs table on dashboard reflects manual triggers
- Single shared `runningJob` state disables all buttons while any job runs (prevents double-submit and concurrent execution confusion)
- Auto-dismiss toast at 8s, 30s warning for approaching Vercel 60s timeout

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated test files (`src/app/api/events/route.test.ts`, `src/lib/filter-utils.test.ts`, `src/lib/timelapse-utils.test.ts`) from schema changes in phases 29-30 (missing `archived_at` and `series_id` fields). These are out of scope — logged as deferred items.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Task 3 (checkpoint:human-verify) requires manual verification on the live admin dashboard at /admin
- After verification: Actions section visible with Run Scrape, Run Discovery dropdown, Run Archive buttons
- Full test suite ready: `npx jest src/app/api/admin/trigger`

## Self-Check: PASSED

All files created, all commits verified.

---
*Phase: 33-admin-manual-triggers*
*Completed: 2026-03-16*
