---
phase: 31-series-detection
plan: "02"
subsystem: series-detection
tags: [cron, admin-trigger, backfill, gemini-prompt, series-detection]
dependency_graph:
  requires:
    - src/lib/series-detector.ts (detectAndTagSeries — from Plan 01)
    - src/app/api/cron/archive/route.ts (pattern reference)
    - src/lib/db/backfill-categories.ts (pattern reference)
    - vercel.json (cron config)
  provides:
    - src/app/api/cron/detect-series/route.ts (scheduled cron endpoint)
    - src/app/api/cron/detect-series/route.test.ts (4 auth + delegation tests)
    - src/lib/db/backfill-series.ts (one-shot backfill script)
  affects:
    - vercel.json (new cron entry)
    - src/lib/scraper/extractor.ts (recurrence_pattern prompt instruction)
    - src/app/api/admin/trigger/[job]/route.ts (detect-series case)
    - src/app/admin/_components/TriggerActions.tsx (Detect Series button)
tech_stack:
  added: []
  patterns:
    - CRON_SECRET Bearer auth on cron routes (mirror of archive route)
    - Admin session cookie auth on trigger route (existing pattern)
    - Dynamic import for job cases in admin trigger switch
    - dotenv/config + process.exit(0) backfill script pattern
key_files:
  created:
    - src/app/api/cron/detect-series/route.ts
    - src/app/api/cron/detect-series/route.test.ts
    - src/lib/db/backfill-series.ts
  modified:
    - vercel.json
    - src/lib/scraper/extractor.ts
    - src/app/api/admin/trigger/[job]/route.ts
    - src/app/admin/_components/TriggerActions.tsx
decisions:
  - detect-series cron runs at 10 6 * * * (6:10am UTC) — 10 minutes after scrape at 6:00am to avoid timeout overlap
  - No discovery_runs insert in detect-series admin trigger — not a discovery job, no dashboard table to update
  - backfill-series.ts calls detectAndTagSeries directly (no HTTP) — one-shot script for existing events
  - recurrence_pattern prompt instruction added after event_category guidance block — schema already accepted the field
metrics:
  duration_seconds: 420
  completed_date: "2026-03-16"
  tasks_completed: 2
  files_created: 3
  files_modified: 4
requirements_completed: [SER-05, SER-06]
---

# Phase 31 Plan 02: Series Detection Integration Summary

**One-liner:** Series detection wired end-to-end: CRON_SECRET-protected cron at 6:10am UTC, Gemini recurrence_pattern prompt hint, admin trigger with dashboard button, and backfill script for existing events.

## What Was Built

Complete integration pipeline connecting the Plan 01 detection algorithm to scheduled and on-demand execution.

### Files Created

| File | Purpose |
|------|---------|
| `src/app/api/cron/detect-series/route.ts` | Scheduled cron endpoint — GET with CRON_SECRET Bearer auth, delegates to `detectAndTagSeries()`, returns `{ success, seriesUpserted, eventsTagged, timestamp }` |
| `src/app/api/cron/detect-series/route.test.ts` | 4 tests: 401 no auth, 401 wrong token, 200 success (mock returns 3/12), 500 on throw |
| `src/lib/db/backfill-series.ts` | One-shot backfill script — `import 'dotenv/config'`, calls `detectAndTagSeries()`, logs counts, exits cleanly |

### Files Modified

| File | Change |
|------|--------|
| `vercel.json` | Added `{ "path": "/api/cron/detect-series", "schedule": "10 6 * * *" }` after archive entry |
| `src/lib/scraper/extractor.ts` | Added `recurrence_pattern` field instruction to Gemini prompt after event_category guidance |
| `src/app/api/admin/trigger/[job]/route.ts` | Added `detect-series` case: dynamic import `detectAndTagSeries`, returns `{ seriesUpserted, eventsTagged }` |
| `src/app/admin/_components/TriggerActions.tsx` | Added Detect Series button after Run Archive; added `formatSuccessMessage` case for detect-series |

### Cron schedule

| Cron | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/scrape` | `0 6 * * *` | Scrape events (6:00am UTC) |
| `/api/cron/detect-series` | `10 6 * * *` | Series detection (6:10am UTC, 10 min after scrape) |
| `/api/cron/archive` | `0 7 * * *` | Archive past events (7:00am UTC) |

## Test Coverage

4 tests in `route.test.ts` mirroring the archive cron test pattern:

| Test | Assert |
|------|--------|
| No auth header | 401, success: false |
| Wrong token | 401, success: false |
| Valid auth + mock resolves | 200, seriesUpserted: 3, eventsTagged: 12, timestamp present |
| Valid auth + mock throws | 500, success: false |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/app/api/cron/detect-series/route.ts
- FOUND: src/app/api/cron/detect-series/route.test.ts
- FOUND: src/lib/db/backfill-series.ts
- FOUND: vercel.json contains "detect-series"
- FOUND: extractor.ts contains "recurrence_pattern"
- FOUND: admin trigger route contains "detect-series" case
- FOUND: TriggerActions.tsx contains "Detect Series" button
- FOUND: commit 21140e2 (Task 1)
- FOUND: commit f2aa48d (Task 2)
