---
phase: 20
slug: admin-merge-review
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + ts-jest |
| **Config file** | `jest.config.ts` |
| **Quick run command** | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest src/lib/db/merge-venue.test.ts --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | DEDUP-04 | unit | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` | N/A | ✅ pass |
| 20-01-02 | 01 | 1 | DEDUP-04 | unit | `npx jest src/lib/db/merge-venue.test.ts --no-coverage` | N/A | ✅ pass |
| 20-01-03 | 01 | 1 | DEDUP-04 | unit | `npx jest src/lib/scraper/ticketmaster.test.ts --no-coverage` | ✅ extend | ✅ pass |
| 20-02-01 | 02 | 1 | DEDUP-04 | manual | Server component rendering | N/A | ✅ pass |
| 20-02-02 | 02 | 1 | DEDUP-04 | manual | Server action integration | N/A | ✅ pass |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/db/merge-venue.test.ts` — unit tests for `performVenueMerge` and `keepSeparate` (mocked DB)
- [x] `src/app/admin/merge-review/` — directory structure (page.tsx, actions.ts, _components/)

*Existing infrastructure covers test framework — Jest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Side-by-side card layout renders correctly | DEDUP-04 | Server component UI rendering | Navigate to /admin/merge-review, verify card pair display |
| Merge inline confirm flow works end-to-end | DEDUP-04 | Server action + revalidation | Click Merge → Confirm → verify venue deleted, events reassigned |
| Keep Separate removes pair from pending tab | DEDUP-04 | Server action + revalidation | Click Keep Separate → verify pair moves to Kept Separate tab |
| Pending count badge appears on admin nav | DEDUP-04 | Layout rendering | Check admin nav shows badge with correct count |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-03-16
