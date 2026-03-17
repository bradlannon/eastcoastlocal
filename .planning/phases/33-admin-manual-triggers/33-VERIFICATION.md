---
phase: 33-admin-manual-triggers
verified: 2026-03-16T23:30:00Z
status: human_needed
score: 6/7 must-haves verified
re_verification: false
human_verification:
  - test: "Visual: Actions section renders on /admin with 3 button groups"
    expected: "Page shows 'Actions' heading, Run Scrape button, Discovery dropdown + Run Discovery button, Run Archive button"
    why_human: "React component rendering cannot be confirmed programmatically; requires browser"
  - test: "Interactive: Click Run Scrape — verify spinner during run and result toast after"
    expected: "Button shows inline spinner while request is in flight; toast appears with 'Scrape complete' on success"
    why_human: "Timing-dependent UI state; requires browser interaction"
  - test: "Interactive: Trigger a slow job and verify 30s warning toast appears"
    expected: "After 30 seconds, amber toast 'Still running... (Vercel timeout at 60s)' appears while button spinner continues"
    why_human: "Timing-dependent behavior impossible to verify statically"
  - test: "Interactive: Dashboard stats refresh after successful trigger"
    expected: "After a successful trigger, server-rendered stats (Last Scrape time, archive count, etc.) visibly update without full page reload"
    why_human: "router.refresh() effect on server component data requires live browser session"
---

# Phase 33: Admin Manual Triggers Verification Report

**Phase Goal:** Admin can trigger any cron job (scrape, discover, discover-places, discover-reddit, archive) on demand from the admin dashboard without waiting for scheduled runs
**Verified:** 2026-03-16T23:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can trigger scrape from dashboard and see result toast | ? HUMAN | Route dispatches `runScrapeJob` (verified); toast logic exists in component (verified); live rendering requires human |
| 2 | Admin can trigger archive from dashboard and see archived count | ? HUMAN | Route returns `archived: result.total` (verified); `formatSuccessMessage` returns "Archived N events" (verified); live rendering requires human |
| 3 | Admin can trigger any discovery sub-type from dashboard dropdown | ? HUMAN | All 6 discovery variants in `DISCOVERY_OPTIONS` array (verified); all 6 dispatched correctly in route switch (verified); live dropdown requires human |
| 4 | Unauthenticated requests to trigger endpoint return 401 | ✓ VERIFIED | Tests pass: missing cookie returns 401 `{success:false, error:'Unauthorized'}`; invalid token returns 401 (test IDs: auth-1, auth-2) |
| 5 | Dashboard stats refresh automatically after successful trigger | ? HUMAN | `router.refresh()` called on `body.success` (line 82 of TriggerActions.tsx); effect on live server component requires human |
| 6 | Button shows spinner while job is running | ? HUMAN | `runningJob` state drives `<Spinner />` inside each button (lines 129, 154-155, 167); live interaction requires human |
| 7 | 30s warning appears for long-running jobs | ? HUMAN | `setTimeout(() => setResult({isWarning:true,...}), 30_000)` at line 67 of TriggerActions.tsx; timing behavior requires human |

**Score:** 1/7 truths fully verified programmatically; 6/7 are implemented correctly and require human confirmation of live behavior.

**Implementation completeness: 6/7 truths have substantive, wired implementations. Only the visual/interactive behaviors remain for human sign-off.**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/api/admin/trigger/[job]/route.ts` | POST handler with session auth dispatching to 8 job types | ✓ VERIFIED | 190 lines. Exports `POST` and `maxDuration = 60`. Session cookie auth via `verifyToken`. Switch covers: scrape, archive, discover, discover-reddit, discover-places-{ns,nb,pei,nl}. Default returns 400. try/catch returns 500. |
| `src/app/api/admin/trigger/[job]/route.test.ts` | Unit tests covering auth, dispatch, response shapes, error handling | ✓ VERIFIED | 213 lines (well above 40-line minimum). 9 tests: 2 auth, 5 dispatch (scrape, archive, discover, discover-reddit, discover-places-ns), 1 unknown-job 400, 1 error 500. All 9 pass. |
| `src/app/admin/_components/TriggerActions.tsx` | Client component with trigger buttons, spinner, toast, timeout warning | ✓ VERIFIED | 189 lines (above 60-line minimum). `'use client'` directive. 3 button groups, 6-option dropdown, `runningJob` state, `Spinner` component, success/error/warning toast, 8s auto-dismiss, `router.refresh()`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TriggerActions.tsx` | `/api/admin/trigger/[job]` | `fetch` POST call | ✓ WIRED | Line 76: `fetch(\`/api/admin/trigger/${job}\`, { method: 'POST' })` — response handled with `body.success` check, `formatSuccessMessage`, `setResult`, `router.refresh()` |
| `route.ts` | cron functions | dynamic import in switch | ✓ WIRED | All 8 cases use `await import('@/lib/...')` to load and call the correct function. DB insert for all 6 discovery variants. |
| `admin/page.tsx` | `TriggerActions.tsx` | component import | ✓ WIRED | Line 6: `import TriggerActions from './_components/TriggerActions'` — rendered at line 252 between stat cards grid and Source Health section |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TRIG-01 | 33-01-PLAN.md | Admin trigger API route authenticates via session cookie; dispatches all job types; returns correct response shapes | ✓ SATISFIED | Route verified: session auth (lines 14-18), 8-way switch dispatch (lines 23-183), correct shapes per job type. 9 unit tests pass. |
| TRIG-02 | 33-01-PLAN.md | TriggerActions dashboard component with buttons, spinner, toast, 30s warning, router.refresh() | ? NEEDS HUMAN | Component code verified as complete and substantive; wired into admin/page.tsx. Live visual/interactive behavior requires human testing. |

**Note on TRIG-01 / TRIG-02 in REQUIREMENTS.md:** These IDs appear in ROADMAP.md and the plan frontmatter but are NOT defined in `.planning/REQUIREMENTS.md`. The requirements file covers v2.2 requirements (ARCH-*, SER-*, UI-* series) and does not include a TRIG section. TRIG-01 and TRIG-02 are orphaned requirement IDs — they exist in the roadmap reference but have no definition in REQUIREMENTS.md. This is a documentation gap, not an implementation gap. The actual behaviors these IDs represent are fully implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `route.ts` | 186 | `console.error(...)` in catch block | ℹ️ Info | Intentional server-side error logging; not a stub |
| None | — | No TODO/FIXME/placeholder comments found | — | — |
| None | — | No empty handlers or `return null` returns | — | — |

No blocker or warning anti-patterns found. The `console.error` is deliberate operational logging.

### Human Verification Required

#### 1. Actions Section Renders on Admin Dashboard

**Test:** Log in to /admin and scroll below the stat cards grid.
**Expected:** An "Actions" heading (h2) followed by a white card containing three groups: "Run Scrape" button, a Discovery dropdown with 6 options + "Run Discovery" button, and "Run Archive" button.
**Why human:** React component rendering and Tailwind class application require a browser.

#### 2. Spinner and Toast on Trigger Click

**Test:** Click "Run Scrape" while the dashboard is loaded.
**Expected:** The Run Scrape button shows an inline spinner and all three buttons become disabled. After completion, a green toast appears: "Scrape complete". Toast auto-dismisses after 8 seconds.
**Why human:** Timing-dependent UI state transitions require live interaction.

#### 3. 30-Second Warning Toast

**Test:** Trigger a slow job (e.g., "Run Discovery" with Gemini Search) and wait.
**Expected:** After approximately 30 seconds, an amber toast appears: "Still running... (Vercel timeout at 60s)" while the spinner continues.
**Why human:** Timing-dependent behavior; cannot be confirmed statically.

#### 4. Dashboard Stats Refresh After Success

**Test:** Trigger "Run Archive" and observe the dashboard stat cards after the success toast appears.
**Expected:** Server-rendered stats (archived count, last run timestamp) refresh to show updated values without a full page reload.
**Why human:** `router.refresh()` re-renders server components; effect requires a live Next.js session with real database.

### Gaps Summary

No implementation gaps found. All three artifacts exist, are substantive, and are correctly wired. The 9 unit tests cover auth, all dispatch paths, response shapes, and error handling — and all pass. The only items pending are live browser verification of UI behavior (rendering, spinner, toast, timing, router.refresh effect), which are marked for human sign-off.

**Documentation gap (non-blocking):** TRIG-01 and TRIG-02 are referenced in ROADMAP.md and the plan but are not defined in `.planning/REQUIREMENTS.md`. The requirements file should be updated to include a "Manual Triggers" section defining these IDs.

---

_Verified: 2026-03-16T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
