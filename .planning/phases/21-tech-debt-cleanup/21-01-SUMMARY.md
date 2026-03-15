---
phase: 21-tech-debt-cleanup
plan: "01"
subsystem: scraper, map-ui
tags: [tech-debt, coalesce, dedup, event-count, attr-02]
dependency_graph:
  requires: []
  provides: [ATTR-02-ticket-link-coalesce, clean-venue-dedup-api, correct-event-count-badge]
  affects: [src/lib/scraper/normalizer.ts, src/lib/scraper/venue-dedup.ts, src/app/page.tsx]
tech_stack:
  added: []
  patterns: [COALESCE-in-onConflictDoUpdate, TDD-red-green]
key_files:
  created: []
  modified:
    - src/lib/scraper/normalizer.ts
    - src/lib/scraper/normalizer.test.ts
    - src/lib/scraper/venue-dedup.ts
    - src/lib/scraper/venue-dedup.test.ts
    - src/app/page.tsx
decisions:
  - "COALESCE applied to ticket_link in upsertEvent onConflictDoUpdate — keeps existing TM link when scraper produces null"
  - "findBestMatch was orphaned since Phase 18 decision to use scoreVenueCandidate per-candidate; removed cleanly with no callers"
  - "eventCount badge uses mapEvents.length (pre-bounds province+category filtered) not sidebarEvents.length (bounds-clipped)"
metrics:
  duration: 3 min
  completed_date: "2026-03-15"
  tasks_completed: 3
  files_modified: 5
---

# Phase 21 Plan 01: Tech Debt Cleanup Summary

**One-liner:** COALESCE ticket_link to prevent TM link overwrites, remove orphaned findBestMatch export, fix eventCount badge to show map-wide count.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Fix ticket_link COALESCE in upsertEvent (ATTR-02) | 69a8de5 | normalizer.ts, normalizer.test.ts |
| 2 | Remove orphaned findBestMatch export and tests | f2d8ba9 | venue-dedup.ts, venue-dedup.test.ts |
| 3 | Fix eventCount badge to use map-wide count | 282d947 | page.tsx |

## Verification Results

1. `npx jest --no-coverage` — 269/271 tests pass (2 pre-existing ticketmaster failures unrelated to this plan)
2. `npx next build` — production build succeeds
3. `grep -r "findBestMatch" src/` — zero results
4. `grep "COALESCE.*ticket_link" src/lib/scraper/normalizer.ts` — COALESCE confirmed
5. `grep "eventCount={mapEvents.length}" src/app/page.tsx` — 2 occurrences confirmed

## Deviations from Plan

None — plan executed exactly as written.

Pre-existing failures noted: 2 tests in `ticketmaster.test.ts` fail independently of this plan's changes (verified by stash check). Deferred to separate issue tracking.

## Self-Check: PASSED
