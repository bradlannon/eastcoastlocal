---
phase: 25-admin-scale-tooling
plan: 02
subsystem: ui
tags: [react, next.js, server-actions, forms, admin]

requires:
  - phase: 25-01-discovery-runs-instrumentation
    provides: discovery_runs table; promoteSource used for batch promotion

provides:
  - batchApproveCandidate server action (Promise.allSettled over promoteSource)
  - Checkbox selection UI on discovery pending tab
  - Batch Approve button with live count and loading state

affects: [admin-discovery-review, future bulk-action patterns]

tech-stack:
  added: []
  patterns:
    - "Promise.allSettled for batch operations — continues on individual failures, logs failure count"
    - "useFormStatus in child button component for server action loading state"
    - "useEffect([activeStatus]) to clear selection state on tab switch"
    - "onClick stopPropagation on td wrapper to prevent row expansion when clicking checkboxes"

key-files:
  created: []
  modified:
    - src/app/admin/discovery/actions.ts
    - src/app/admin/discovery/_components/DiscoveryList.tsx

key-decisions:
  - "Promise.allSettled (not Promise.all) for batch promote — individual failures don't abort the batch"
  - "Checkbox column only on pending tab — not shown on approved/rejected tabs"
  - "colSpan updates dynamically: 6 when pending (checkbox column present), 5 otherwise"
  - "Batch approve button floats above table, only visible when selectedIds.size > 0"

patterns-established:
  - "Batch server action: parse comma-separated IDs from hidden input, allSettled + error count log"

requirements-completed: [ADMIN-01]

duration: 2min
completed: 2026-03-16
---

# Phase 25 Plan 02: Batch Approve Discovery Candidates Summary

**Checkbox-based batch approve for discovery pending tab using Promise.allSettled and useFormStatus loading state**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-16T11:58:04Z
- **Completed:** 2026-03-16T12:00:09Z
- **Tasks:** 1 of 2 (Task 2 is human verification checkpoint)
- **Files modified:** 2

## Accomplishments

- `batchApproveCandidate` server action accepts comma-separated IDs and promotes them in parallel using Promise.allSettled
- Checkbox column added to pending tab with select-all header checkbox
- "Batch Approve (N)" button floats above the table, visible only when selections exist
- BatchApproveButton uses useFormStatus for loading state ("Approving..." during submission)
- useEffect clears checkbox selection when switching tabs
- stopPropagation on checkbox td prevents accidental row expansion

## Task Commits

Each task was committed atomically:

1. **Task 1: Add batchApproveCandidate server action and checkbox UI** - `9ccf526` (feat)

**Plan metadata:** (pending — awaiting Task 2 human verification)

## Files Created/Modified

- `src/app/admin/discovery/actions.ts` - Added batchApproveCandidate server action
- `src/app/admin/discovery/_components/DiscoveryList.tsx` - Added checkbox column, select-all, batch approve button, BatchApproveButton component

## Decisions Made

- Promise.allSettled over Promise.all for batch promotion: individual venue failures should not abort the entire batch; failures are logged with count
- Checkbox column restricted to pending tab via conditional rendering: approved/rejected tabs have no bulk actions
- Dynamic colSpan: 6 on pending tab (checkbox column present), 5 on other tabs — prevents layout breakage in expanded rows

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Batch approve UI built and build-verified; awaiting human verification of UX (Task 2 checkpoint)
- After human verification: Phase 25 plan 02 complete, all Phase 25 plans done

## Self-Check

- `src/app/admin/discovery/actions.ts` — FOUND (modified)
- `src/app/admin/discovery/_components/DiscoveryList.tsx` — FOUND (modified)
- Commit `9ccf526` — FOUND

## Self-Check: PASSED

---
*Phase: 25-admin-scale-tooling*
*Completed: 2026-03-16*
