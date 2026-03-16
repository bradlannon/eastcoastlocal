---
phase: 27-admin-config
plan: "01"
subsystem: admin-ui, scraper
tags: [discovery, admin, no_website, gemini, env-config]
dependency_graph:
  requires: []
  provides: [no_website-admin-tab, env-overridable-GEMINI_AUTO_APPROVE]
  affects: [src/app/admin/discovery, src/lib/scraper/places-discoverer]
tech_stack:
  added: []
  patterns: [isActionableTab helper pattern, env-overridable threshold constants]
key_files:
  created: []
  modified:
    - src/app/admin/discovery/page.tsx
    - src/app/admin/discovery/_components/DiscoveryList.tsx
    - src/lib/scraper/places-discoverer.ts
decisions:
  - "Extracted isActionableTab = activeStatus === 'pending' || activeStatus === 'no_website' as component-scoped const for DRY condition reuse across 5 JSX locations"
  - "GEMINI_AUTO_APPROVE uses parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9') matching existing pattern in discovery-orchestrator.ts and reddit-discoverer.ts"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-03-16"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 27 Plan 01: Admin Config Summary

**One-liner:** No Website tab added to discovery admin with isActionableTab helper; GEMINI_AUTO_APPROVE now reads from process.env with 0.9 fallback

## What Was Built

Two targeted changes to the admin discovery UI and the Places discoverer:

1. **No Website tab** — Admin can now see, approve, and reject `no_website` venue stubs from the discovery page. The tab appears as the 4th tab with a live count. Approve/reject/batch-approve all work identically to the Pending tab.

2. **Env-overridable GEMINI_AUTO_APPROVE** — The hardcoded `0.9` threshold in `places-discoverer.ts` now reads from `process.env.GEMINI_AUTO_APPROVE` with `'0.9'` as the fallback string, matching the existing pattern in `discovery-orchestrator.ts` and `reddit-discoverer.ts`.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add No Website tab to discovery admin page | 1ce6891 | page.tsx, DiscoveryList.tsx |
| 2 | Make GEMINI_AUTO_APPROVE env-overridable in places-discoverer | e0b1e30 | places-discoverer.ts |

## Key Changes

### page.tsx
- `Status` type expanded: `'pending' | 'approved' | 'rejected' | 'no_website'`
- `VALID_STATUSES` array updated
- 5th query added to `Promise.all` for `no_website` count
- `counts` object includes `no_website` key

### DiscoveryList.tsx
- `counts` prop type includes `no_website: number`
- `TABS` array has 4th entry: `{ status: 'no_website', label: 'No Website' }`
- `const isActionableTab = activeStatus === 'pending' || activeStatus === 'no_website'` extracted as component-level const
- All 5 `activeStatus === 'pending'` guard expressions replaced with `isActionableTab`: batch approve visibility, checkbox header, per-row checkbox, colSpan calculation, action area ternary

### places-discoverer.ts
- `GEMINI_AUTO_APPROVE` changed from literal `0.9` to `parseFloat(process.env.GEMINI_AUTO_APPROVE ?? '0.9')`

## Verification Results

- TypeScript compiles without errors: PASSED
- places-discoverer tests (47/47): PASSED
- No solo `activeStatus === 'pending'` guards remain in DiscoveryList.tsx: CONFIRMED
- `process.env.GEMINI_AUTO_APPROVE` pattern present in places-discoverer.ts: CONFIRMED

## Deviations from Plan

### Auto-fixed Issues

None.

**Note:** Plan's verify command used `npx vitest run` but this is a Jest project. Ran `npx jest` instead — all tests passed. The `GEMINI_AUTO_APPROVE` test required no updates because `parseFloat(undefined ?? '0.9')` evaluates to `0.9` at module load time in the Jest environment.

## Self-Check: PASSED

Files exist:
- FOUND: src/app/admin/discovery/page.tsx
- FOUND: src/app/admin/discovery/_components/DiscoveryList.tsx
- FOUND: src/lib/scraper/places-discoverer.ts

Commits exist:
- FOUND: 1ce6891 (Task 1)
- FOUND: e0b1e30 (Task 2)
