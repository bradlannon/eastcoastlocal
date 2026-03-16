---
phase: 30-archival
verified: 2026-03-16T22:15:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
human_verification:
  - test: "Navigate to /admin/archived in the browser"
    expected: "Nav shows 'Archived' tab between Merge Review and Settings; page renders with table columns (Performer, Venue, Event Date, Archived At); empty state shows 'No archived events yet.' when no archived events exist; Previous/Next pagination controls are present and disabled at boundaries"
    why_human: "Server component rendering, Tailwind layout, nav active-state highlighting, and empty-state display cannot be verified programmatically"
---

# Phase 30: Archival Verification Report

**Phase Goal:** Past events disappear from the public map and list automatically each day, without destroying dedup anchors or unarchiving events that get re-scraped
**Verified:** 2026-03-16T22:15:00Z
**Status:** human_needed — all automated checks pass; one visual check required for admin UI
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Past events no longer appear on the public map after the archive cron runs | VERIFIED | `src/app/api/events/route.ts` line 14: `.where(isNull(events.archived_at))` — no date filter, pure soft-delete gate |
| 2 | Re-scraping an already-archived event does not unarchive it | VERIFIED | `src/lib/scraper/normalizer.ts` line 54: `// archived_at intentionally omitted — preserves existing value on re-scrape (ARCH-04)` — `archived_at` absent from `onConflictDoUpdate.set`; normalizer test at line 256 asserts this |
| 3 | The archive cron correctly handles both Halifax and St. Johns timezone thresholds | VERIFIED | `src/lib/archiver.ts`: two separate thresholds via `getStartOfTodayInTimezone('America/Halifax')` and `getStartOfTodayInTimezone('America/St_Johns')`; two province-bucketed UPDATE queries; 3 timezone tests pass with `jest.setSystemTime` |
| 4 | The public /api/events endpoint filters by archived_at IS NULL, not by date | VERIFIED | `src/app/api/events/route.ts` line 2 import: `isNull` (not `gte`); line 14: `.where(isNull(events.archived_at))`; test renamed and asserts `mockWhere` was called |
| 5 | Admin can navigate to an Archived tab in the admin nav | VERIFIED | `src/app/admin/_components/NavLinks.tsx` line 11: `{ href: '/admin/archived', label: 'Archived', exact: false }` added between Merge Review and Settings |
| 6 | Admin sees a paginated list of soft-archived events with performer, venue, date, and archived_at | VERIFIED | `src/app/admin/archived/page.tsx`: table renders Performer, Venue, Event Date, Archived At columns; empty state "No archived events yet."; pagination controls with `?page=N` |
| 7 | The archived list is sorted by archived_at descending (most recently archived first) | VERIFIED | `src/app/admin/archived/page.tsx` line 32: `.orderBy(desc(events.archived_at))`; `src/app/api/admin/archived/route.ts` line 28: `.orderBy(desc(events.archived_at))` |

**Score:** 7/7 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/archiver.ts` | getStartOfTodayInTimezone + archivePastEvents | VERIFIED | 71 lines; exports both functions; two-bucket UPDATE with isNull guard |
| `src/app/api/cron/archive/route.ts` | GET with CRON_SECRET auth | VERIFIED | 22 lines; Bearer token check; calls archivePastEvents; 200/401/500 |
| `src/app/api/events/route.ts` | isNull(events.archived_at) WHERE clause | VERIFIED | Line 14: `.where(isNull(events.archived_at))`; gte import removed |
| `src/lib/scraper/normalizer.ts` | archived_at absent from ON CONFLICT SET | VERIFIED | ARCH-04 comment at line 54; test asserts absence |
| `vercel.json` | Archive cron at 0 7 * * * | VERIFIED | Lines 33–36: `{ "path": "/api/cron/archive", "schedule": "0 7 * * *" }` |
| `src/app/api/admin/archived/route.ts` | Paginated GET for archived events | VERIFIED | 50 lines; isNotNull filter; innerJoin venues; desc(archived_at); pagination metadata |
| `src/app/admin/archived/page.tsx` | Admin page with table and pagination | VERIFIED | 128 lines; server component; parallel queries; table + empty state + Previous/Next |
| `src/app/admin/archived/loading.tsx` | Loading skeleton | VERIFIED | Animate-pulse skeleton with header + 5 data rows + pagination placeholders |
| `src/app/admin/_components/NavLinks.tsx` | Archived link in nav | VERIFIED | `/admin/archived` entry at line 11 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app/api/cron/archive/route.ts` | `src/lib/archiver.ts` | import archivePastEvents | WIRED | Line 1: `import { archivePastEvents } from '@/lib/archiver'`; called at line 12 |
| `src/lib/archiver.ts` | `src/lib/db/schema.ts` | Drizzle update with lt + isNull + inArray | WIRED | Lines 38–46: `.set({ archived_at: new Date() }).where(and(isNull(events.archived_at), lt(events.event_date, halifaxThreshold), inArray(...)))` |
| `src/app/api/events/route.ts` | `src/lib/db/schema.ts` | isNull(events.archived_at) WHERE clause | WIRED | Line 2: `import { isNull, eq, inArray } from 'drizzle-orm'`; line 14: `.where(isNull(events.archived_at))` |
| `src/app/admin/archived/page.tsx` | `src/lib/db/schema.ts` | Drizzle query with isNotNull(events.archived_at) | WIRED | Line 1: imports isNotNull; line 30: `.where(isNotNull(events.archived_at))` |
| `src/app/admin/_components/NavLinks.tsx` | `src/app/admin/archived/page.tsx` | href: '/admin/archived' | WIRED | Line 11: `{ href: '/admin/archived', label: 'Archived', exact: false }` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ARCH-02 | 30-01-PLAN | Daily cron archives past events using Atlantic timezone threshold | SATISFIED | `archivePastEvents` runs two timezone-bucketed UPDATEs; vercel.json schedules at 0 7 * * *; Halifax (NS/NB/PEI) and NL handled separately |
| ARCH-03 | 30-01-PLAN | Events API excludes archived events from public map and list | SATISFIED | `/api/events` uses `isNull(events.archived_at)` — archived events never returned to map |
| ARCH-04 | 30-01-PLAN | Re-scraping an archived event does not unarchive it | SATISFIED | `archived_at` not in `onConflictDoUpdate.set`; ARCH-04 comment in code; test asserts key absence |
| ARCH-05 | 30-02-PLAN | Admin can view archived events in a dedicated tab | SATISFIED (automated) | API, server page, loading skeleton, nav link all present and wired; visual confirmation pending |

No orphaned requirements — all four ARCH-02 through ARCH-05 are claimed by plans and verified.

---

## Anti-Patterns Found

No TODO/FIXME/PLACEHOLDER comments in phase-modified files. No stub implementations (return null / return {} / return []). No console.log-only handlers. No empty form handlers.

---

## Test Results

| Test File | Tests | Status |
|-----------|-------|--------|
| `src/lib/archiver.test.ts` | 6 | PASS |
| `src/app/api/cron/archive/route.test.ts` | 4 | PASS |
| `src/app/api/events/route.test.ts` | 4 (includes updated filter test) | PASS |
| `src/lib/scraper/normalizer.test.ts` | includes ARCH-04 assertion | PASS |
| `src/app/api/admin/archived/route.test.ts` | 5 | PASS |
| **Total** | **31 + 5 = 36** | **ALL PASS** |

---

## Human Verification Required

### 1. Admin Archived Tab — Visual and Functional Confirmation

**Test:** Start the dev server (`npm run dev`), sign in as admin, click the "Archived" nav link.

**Expected:**
- "Archived" appears in the admin nav between "Merge Review" and "Settings"
- Clicking it navigates to `/admin/archived`
- When no events are archived: "No archived events yet." message shown in a white card
- When archived events exist: table with Performer, Venue, Event Date, Archived At columns; rows sorted by Archived At descending
- "Page X of Y (Z total)" info shown; Previous/Next disabled at first/last page, enabled otherwise
- Loading skeleton (animate-pulse) visible while page loads on slow connections

**Why human:** Server component table rendering, Tailwind layout correctness, nav active-state highlighting, and empty-state display require browser rendering. Cannot be verified via static analysis.

---

## Summary

All seven observable truths are verified against the actual codebase. The archival pipeline is fully wired end-to-end:

1. The daily cron at `0 7 * * *` calls `archivePastEvents`, which pre-fetches venue IDs by province and runs two timezone-bucketed UPDATEs — Halifax provinces (NS/NB/PEI) against `America/Halifax` midnight, NL against `America/St_Johns` midnight. Events with `archived_at IS NULL` and `event_date < threshold` are stamped with `archived_at = now()`.

2. The public `/api/events` endpoint now filters `WHERE archived_at IS NULL`, meaning archived events never reach the map or list regardless of their event_date.

3. The upsert guard in `normalizer.ts` omits `archived_at` from the `onConflictDoUpdate.set` object, ensuring re-scraping a past event cannot resurrect it from the archive.

4. The admin tab at `/admin/archived` surfaces soft-archived events with venue join, `desc(archived_at)` ordering, and Previous/Next pagination. The nav link is wired.

The only remaining item is the visual/functional browser check for the admin UI (ARCH-05 human gate from plan 02-PLAN Task 2).

---

_Verified: 2026-03-16T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
