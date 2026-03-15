---
phase: 17-auto-approve-discovery
verified: 2026-03-15T07:58:53Z
status: human_needed
score: 7/7 must-haves verified
re_verification: false
human_verification:
  - test: "Score column renders in all three tabs (Pending, Approved, Rejected)"
    expected: "A 'Score' column header appears in the table; rows show a numeric value like '0.95' for scored candidates or '—' for pre-Phase 17 rows"
    why_human: "page.tsx uses db.select() returning all columns — column projection is correct — but rendering can only be confirmed by loading /admin/discovery"
  - test: "Auto-approved badge appears in Approved tab for auto-promoted sources"
    expected: "Blue 'Auto-approved' badge appears alongside green 'Approved' badge when discovery_score is not null on an approved candidate"
    why_human: "Badge is conditioned on discovery_score !== null; actual DB rows with non-null scores need to exist and be approved to exercise this branch"
  - test: "Revoke button with confirmation works end-to-end"
    expected: "Clicking 'Revoke' shows 'Confirm Revoke' and 'Cancel'; clicking 'Confirm Revoke' disables the scrape_source and resets the discovered_source to pending, then redirects back"
    why_human: "Two-table server action logic is correct in code; redirect/revalidate behavior and DB side-effects require a live environment"
---

# Phase 17: Auto-Approve Discovery Verification Report

**Phase Goal:** High-confidence discovered venue sources are promoted to active scraping automatically, reducing the admin review queue without introducing noise into the pipeline
**Verified:** 2026-03-15T07:58:53Z
**Status:** human_needed — all automated checks pass; 3 UI behaviors require human confirmation
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Newly discovered sources receive a numeric score between 0.0 and 1.0 | VERIFIED | `scoreCandidate()` exported from `discovery-orchestrator.ts` L38-52; Math.max(0, Math.min(score, 1.0)) enforces bounds |
| 2 | Sources scoring 0.8 or higher are auto-promoted to active scrape sources | VERIFIED | `runDiscoveryJob()` L162-173: `if (score >= AUTO_APPROVE_THRESHOLD)` calls `promoteSource(staged.id)` |
| 3 | Sources scoring below 0.8 remain pending in the review queue | VERIFIED | No `promoteSource` call below threshold; Test 9 confirms `promoteSource` not called for 0.50-scoring candidate |
| 4 | discovery_score is persisted in the database for admin visibility | VERIFIED | `runDiscoveryJob()` L156-159: `db.update(discovered_sources).set({ discovery_score: score })` for every inserted candidate |
| 5 | Auto-approved sources display an "Auto-approved" badge in the admin discovery UI | VERIFIED* | `DiscoveryList.tsx` L296-300: badge rendered when `candidate.discovery_score !== null` and `status === 'approved'` — *needs human to confirm live render |
| 6 | All discovery candidates show their numeric score in a Score column | VERIFIED* | Score `<th>` L180-183 and score `<td>` L206-210 in DiscoveryList.tsx — *needs human to confirm all 3 tabs |
| 7 | An admin can revoke an auto-approved source, disabling its scraping and returning it to pending | VERIFIED* | `revokeCandidate` L69-92 in actions.ts: two-table update confirmed in code — *needs human to confirm end-to-end flow |

**Score:** 7/7 truths code-verified (3 require human UI confirmation)

---

## Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema.ts` | discovery_score column on discovered_sources | VERIFIED | L99: `discovery_score: doublePrecision('discovery_score')` present; nullable |
| `drizzle/0004_yielding_the_hunter.sql` | DB migration for discovery_score column | VERIFIED | `ALTER TABLE "discovered_sources" ADD COLUMN "discovery_score" double precision` |
| `src/lib/scraper/discovery-orchestrator.ts` | scoreCandidate() and auto-promote loop | VERIFIED | Both `scoreCandidate` (L38) and `runDiscoveryJob` (L54) exported; auto-promote loop L150-173 substantive |
| `src/lib/scraper/discovery-orchestrator.test.ts` | Unit tests for scoring and auto-promote | VERIFIED | 15 tests pass: 5 scoreCandidate + 3 auto-promote + 7 pre-existing runDiscoveryJob tests |
| `src/app/admin/discovery/actions.ts` | revokeCandidate server action | VERIFIED | Exports `approveCandidate`, `rejectCandidate`, `revokeCandidate` (L10, L25, L69) |
| `src/app/admin/discovery/_components/DiscoveryList.tsx` | Score column, auto-approved badge, revoke button | VERIFIED | Contains "Auto-approved" (L298), score column (L180, L206), RevokeSubmitButton, revoke confirmation flow |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `discovery-orchestrator.ts` | `schema.ts` | discovery_score column write | VERIFIED | L157-159: `.set({ discovery_score: score })` writes to `discovered_sources` using schema import |
| `discovery-orchestrator.ts` | `promote-source.ts` | promoteSource() call | VERIFIED | L7: `import { promoteSource } from './promote-source'`; L168: `await promoteSource(staged.id)` inside threshold guard |
| `DiscoveryList.tsx` | `actions.ts` | revokeCandidate form action | VERIFIED | L7: `import { ..., revokeCandidate } from '../actions'`; L320: `<form action={revokeCandidate}>` |
| `actions.ts` | `schema.ts` | scrape_sources.enabled = false + discovered_sources.status = pending | VERIFIED | L7: imports `scrape_sources`; L79-82: `.set({ enabled: false })`; L85-88: `.set({ status: 'pending', ... })` |
| `page.tsx` | `DiscoveryList.tsx` | discovery_score column surfaced to component | VERIFIED | `db.select()` with no column projection returns all schema columns; `candidates` prop typed to include `discovery_score: number \| null` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DISC-05 | 17-01-PLAN.md | High-confidence discovered sources auto-approved using multiple signals | SATISFIED | scoreCandidate() uses 6 signals: city, province, source_name, https, path pattern, social domain; threshold-based promoteSource call wired in runDiscoveryJob |
| DISC-06 | 17-02-PLAN.md | Auto-approved sources visible in admin UI and can be revoked | SATISFIED (code) | Score column, Auto-approved badge, Revoke flow all present in DiscoveryList.tsx; revokeCandidate server action verified; needs human to confirm live render |

No orphaned requirements — both DISC-05 and DISC-06 map directly to plans that claimed and implemented them. REQUIREMENTS.md marks both as `[x] Complete / Phase 17`.

---

## Anti-Patterns Found

No anti-patterns detected in phase-modified files.

| File | Pattern Checked | Result |
|------|-----------------|--------|
| `discovery-orchestrator.ts` | TODO/FIXME, empty returns, stub handlers | Clean |
| `discovery-orchestrator.test.ts` | Skipped tests, placeholder assertions | Clean — 15 tests, all substantive |
| `actions.ts` | Empty action stubs, console.log-only handlers | Clean — all three actions perform real DB work |
| `DiscoveryList.tsx` | Placeholder JSX, empty onClick handlers | Clean — all state handlers are substantive |

---

## Human Verification Required

### 1. Score Column Renders in All Three Tabs

**Test:** Navigate to `/admin/discovery`. Check the Pending tab table header — confirm "Score" column appears. Switch to Approved and Rejected tabs — confirm "Score" column is present in both.
**Expected:** All three tabs show a "Score" column. Rows with scored candidates show a 2-decimal number (e.g., "0.95"). Rows with null score (pre-Phase 17 rows) show "—".
**Why human:** The `db.select()` in page.tsx returns all schema columns, so the data is present in the props; rendering correctness requires visual confirmation in a live browser.

### 2. Auto-Approved Badge in Approved Tab

**Test:** Navigate to `/admin/discovery?status=approved`. If any auto-approved sources exist (discovery_score is not null), click to expand a row.
**Expected:** A blue "Auto-approved" badge appears alongside the green "Approved" badge inside the expanded row. The Score cell in the table row shows the numeric score.
**Why human:** Badge renders only when `discovery_score !== null` on an approved candidate — requires real DB rows that were auto-promoted during a discovery job run.

### 3. Revoke Confirmation Flow

**Test:** In the Approved tab, expand an approved row. Click the "Revoke" button (amber styling).
**Expected:** A confirmation row appears showing "Confirm Revoke" (amber submit) and "Cancel" (gray) buttons. Clicking "Cancel" dismisses the confirmation without action. Clicking "Confirm Revoke" submits, disables the scrape source, resets the discovered source to pending, and redirects back to the discovery page (candidate disappears from Approved tab, reappears in Pending tab).
**Why human:** Server action redirect/revalidate behavior and the two-table DB side-effect require a live environment with a real database.

---

## Scoring Logic Deviation Note

The PLAN specified `score -= 0.50` for social domains (facebook, instagram, eventbrite). The implementation uses `score -= 1.0` (L50 of discovery-orchestrator.ts). This is a documented and justified deviation: with all bonuses active (city + province + source_name + https = +0.45, total 0.95), a -0.50 penalty would yield 0.45 — not 0.0 as the test expected. The -1.0 penalty guarantees `Math.max(0, ...)` always clamps social domains to 0.0 regardless of signal combination. All 5 scoreCandidate tests pass with this formula.

---

## Summary

Phase 17 goal is achieved in code. The pipeline changes (DISC-05) are fully automated-verified: `scoreCandidate()` is a pure, exported, well-tested function; the auto-promote loop is substantively wired to `promoteSource()`; `discovery_score` is persisted to DB on every candidate insertion; all 15 unit tests pass; TypeScript compiles with 0 errors.

The admin UI changes (DISC-06) are code-verified — the Score column, Auto-approved badge, and Revoke with confirmation are all substantively implemented and wired. Three behaviors require human confirmation because they depend on live DB state and browser rendering.

---

_Verified: 2026-03-15T07:58:53Z_
_Verifier: Claude (gsd-verifier)_
