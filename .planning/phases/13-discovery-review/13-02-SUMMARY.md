---
phase: 13-discovery-review
plan: 02
subsystem: ui
tags: [nextjs, react, drizzle, tailwind, server-action, client-component, useActionState, useFormStatus]

# Dependency graph
requires:
  - phase: 13-discovery-review
    plan: 01
    provides: "DiscoveryList component with expandable rows and placeholder action div"
  - path: src/lib/scraper/promote-source.ts
    provides: "promoteSource(id) — creates venue + scrape_source, marks discovered_source approved"
provides:
  - "approveCandidate server action: calls promoteSource, revalidates, redirects"
  - "rejectCandidate server action: updates status to rejected with timestamp + optional reason in raw_context"
  - "DiscoveryList with inline approve/reject UI, loading states, and status badges for reviewed candidates"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useActionState for reject form error state (same pattern as venue forms)"
    - "useFormStatus in isolated SubmitButton wrapper for pending/loading state"
    - "Server action bound directly to form action prop (approveCandidate)"
    - "rejectCandidate uses prevState pattern required by useActionState"

key-files:
  created:
    - src/app/admin/discovery/actions.ts
  modified:
    - src/app/admin/discovery/_components/DiscoveryList.tsx

key-decisions:
  - "approveCandidate wraps promoteSource in try/catch and always revalidates — avoids duplicate promotion blocking UI"
  - "rejection reason stored by appending to raw_context — no schema migration required, preserves original context"
  - "RejectForm extracted as separate component to isolate useActionState hook (required for proper reset behavior)"
  - "No confirmation dialog on approve per user decision — low risk, venues can be edited after promotion"

requirements-completed: [DISC-02, DISC-03]

# Metrics
duration: 6min
completed: 2026-03-15
---

# Phase 13 Plan 02: Approve/Reject Actions Summary

**One-click approve/reject workflow for discovered source candidates via server actions wired into DiscoveryList expanded rows**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-15T04:16:38Z
- **Completed:** 2026-03-15T04:22:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Server actions at `src/app/admin/discovery/actions.ts` with `approveCandidate` and `rejectCandidate`
- Approve button in expanded row: one-click form submission, calls `promoteSource`, loading state via `useFormStatus`
- Reject flow: click "Reject" opens inline form with optional reason input, "Confirm Reject" / "Cancel"
- Rejection reason appended to `raw_context` (no migration needed) and logged to console
- Status badges (green "Approved" / red "Rejected" pills) with `reviewed_at` date shown in approved/rejected tabs
- Build passes; all new files compile cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Approve and reject server actions** - `5617e3f` (feat)
2. **Task 2: Wire action buttons into DiscoveryList expanded rows** - `2a0d413` (feat)

## Files Created/Modified

- `src/app/admin/discovery/actions.ts` — Server actions: `approveCandidate` (calls promoteSource + revalidate + redirect), `rejectCandidate` (DB update status/reviewed_at/raw_context + revalidate + redirect)
- `src/app/admin/discovery/_components/DiscoveryList.tsx` — Added `rejectingId` state, approve form, inline reject form (with `useActionState`), `ApproveSubmitButton`/`RejectSubmitButton` wrappers using `useFormStatus`, status badges for non-pending tabs

## Decisions Made

- `approveCandidate` wraps `promoteSource` in try/catch and always proceeds to revalidate — prevents a second promote attempt locking the row if an error was transient
- Rejection reason stored by appending to `raw_context` with `--- Rejection Reason ---` separator — avoids adding a DB column, preserves original discovery context
- `RejectForm` extracted as its own component to properly scope the `useActionState` hook (one state instance per candidate)
- No confirm dialog on approve per user decision — venues are editable after the fact

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in test files (route.test.ts, seed.test.ts, filter-utils.test.ts, timelapse-utils.test.ts, promote-source.test.ts) were present before this plan and are unrelated to changes made here.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- `src/app/admin/discovery/actions.ts` — FOUND
- `src/app/admin/discovery/_components/DiscoveryList.tsx` — FOUND
- `.planning/phases/13-discovery-review/13-02-SUMMARY.md` — FOUND
- Commit `5617e3f` — FOUND
- Commit `2a0d413` — FOUND

## Next Phase Readiness

- Phase 13 is complete — full discovery review workflow (list + approve/reject) is operational
- Operators can approve candidates at /admin/discovery, creating a venue + scrape_source in one click
- Reject flow records reason and timestamp for audit trail
