---
phase: 17-auto-approve-discovery
plan: 02
subsystem: admin-ui
tags: [discovery, admin, revoke, score, badge]
dependency_graph:
  requires: [17-01]
  provides: [DISC-06]
  affects: [src/app/admin/discovery]
tech_stack:
  added: []
  patterns: [server-action-two-table-update, useFormStatus-confirm-pattern]
key_files:
  created: []
  modified:
    - src/app/admin/discovery/actions.ts
    - src/app/admin/discovery/_components/DiscoveryList.tsx
key_decisions:
  - "Revoke mirrors RejectForm confirmation pattern — amber styling distinguishes from red reject"
  - "Auto-approved badge conditioned on discovery_score !== null — null means pre-Phase 17 or manually approved"
  - "revokeCandidate disables scrape_sources before resetting discovered_sources — non-destructive, restores to pending for re-review"
metrics:
  duration: ~8min
  completed: 2026-03-15
  tasks_completed: 2
  files_modified: 2
---

# Phase 17 Plan 02: Admin Discovery UI — Auto-Approve Visibility Summary

**One-liner:** Admin discovery UI gains Score column, Auto-approved badge, and Revoke action with confirmation step completing the auto-approve feedback loop.

## What Was Built

- **`revokeCandidate` server action** — two-table update: disables `scrape_sources.enabled` then resets `discovered_sources` to `status = 'pending'`, `reviewed_at = null`, `added_to_sources_at = null`. Guards against non-approved records.
- **Score column** — new "Score" `<th>` and `<td>` across all three tabs (pending, approved, rejected); shows score formatted to 2 decimal places or `—` for null (pre-Phase 17 rows).
- **Auto-approved badge** — blue badge rendered next to green "Approved" badge on the approved tab when `discovery_score !== null`.
- **Revoke button with confirmation** — amber trigger button in expanded approved rows; click reveals "Confirm Revoke" + Cancel (mirrors RejectForm pattern); `RevokeSubmitButton` uses `useFormStatus()` for pending state.
- **Updated `colSpan`** — expanded row colspan updated from 4 to 5 to span the new Score column.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | revokeCandidate action + UI updates | 3d90468 | actions.ts, DiscoveryList.tsx |
| 2 | Visual verification (pre-approved checkpoint) | — | — |

## Verification

- TypeScript: `npx tsc --noEmit` — passed, 0 errors
- Test suite: 234/234 tests passed

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- `src/app/admin/discovery/actions.ts` — FOUND
- `src/app/admin/discovery/_components/DiscoveryList.tsx` — FOUND
- Commit 3d90468 — FOUND

## Self-Check: PASSED
